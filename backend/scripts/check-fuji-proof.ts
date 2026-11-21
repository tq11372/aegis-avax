import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  isAddressEqual,
  erc20Abi,
  parseAbi,
  parseEventLogs,
} from "viem";
import { fuji, vaultAbi } from "../src/fuji.ts";
import type { Hex } from "viem";

const client = createPublicClient({
  transport: http("https://api.avax-test.network/ext/bc/C/rpc"),
});
const proof = JSON.parse(
  await readFile(
    new URL("../../docs/fuji-live-proof.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(await client.getChainId(), 43113);
assert.ok(
  proof.completed &&
    proof.chainId === 43113 &&
    isAddressEqual(proof.vault, fuji.vault),
);
assert.deepEqual(
  new Set(proof.rows.map((row: { hash: Hex }) => row.hash)).size,
  proof.rows.length,
);
const failures: Record<string, string> = {
  unsigned: "InvalidSecurityClearance",
  limit: "TxLimitExceeded",
  recipient: "TargetNotWhitelisted",
  revoked: "AgentRevoked",
};
assert.equal(proof.rows.length, 10);
for (const step of [
  "faucet",
  "audit",
  "fee",
  "execute",
  "unsigned",
  "limit",
  "recipient",
  "revoke",
  "revoked",
  "grant",
])
  assert.equal(
    proof.rows.filter((row: { step: string }) => row.step === step).length,
    1,
  );
for (const row of proof.rows) {
  const receipt = await client.getTransactionReceipt({ hash: row.hash });
  assert.equal(receipt.status, failures[row.step] ? "reverted" : "success");
  assert.equal(receipt.status, row.status);
  assert.equal(receipt.blockNumber, BigInt(row.block));
  assert.equal(receipt.gasUsed, BigInt(row.gasUsed));
  assert.equal(row.explorer, "https://testnet.snowtrace.io/tx/" + row.hash);
  if (failures[row.step]) {
    const tx = await client.getTransaction({ hash: row.hash });
    assert.ok(
      tx.to &&
        isAddressEqual(tx.to, fuji.vault) &&
        isAddressEqual(tx.from, proof.agent),
    );
    const { decodeFunctionData } = await import("viem");
    const call = decodeFunctionData({ abi: vaultAbi, data: tx.input });
    assert.ok(call.functionName === "execute");
    let reason;
    try {
      await client.simulateContract({
        account: tx.from,
        address: fuji.vault,
        abi: vaultAbi,
        functionName: call.functionName,
        args: call.args,
        blockNumber: receipt.blockNumber - 1n,
      });
    } catch (e) {
      const err =
        e instanceof BaseError
          ? e.walk((x) => x instanceof ContractFunctionRevertedError)
          : undefined;
      if (err instanceof ContractFunctionRevertedError)
        reason = err.data?.errorName;
    }
    assert.equal(reason, failures[row.step]);
    assert.equal(reason, row.observedError);
  }
}
for (const point of [proof.before, proof.after]) {
  const blockNumber = BigInt(point.block);
  assert.equal(
    await client.readContract({
      blockNumber,
      address: fuji.vault,
      abi: vaultAbi,
      functionName: "nonce",
    }),
    BigInt(point.nonce),
  );
  assert.equal(
    await client.readContract({
      blockNumber,
      address: fuji.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [fuji.vault],
    }),
    BigInt(point.balance),
  );
  assert.equal(
    await client.readContract({
      blockNumber, address: fuji.token, abi: erc20Abi,
      functionName: "balanceOf", args: [fuji.partner],
    }),
    BigInt(point.partnerBalance),
  );
}
assert.equal(
  BigInt(proof.before.balance) - BigInt(proof.after.balance),
  1000000n,
);
assert.equal(BigInt(proof.after.nonce) - BigInt(proof.before.nonce), 3n);
const ownerEvents = parseAbi([
  "event AgentRevoked(address indexed agent)",
  "event AgentGranted(address indexed agent)",
]);
const uiReceipts = [
  { event: "AgentRevoked", hash: "0x58bbe66be17945a793806bad15a85f6fa2be039f054e14c91e6340bca27ec066" },
  { event: "AgentGranted", hash: "0x8d0f2242af805b2ad385c78f0927c57db9d26ef4ac7c889d09784536681dc6f1" },
] as const;
let previousBlock = BigInt(proof.after.block);
for (const { event, hash } of uiReceipts) {
  const receipt = await client.getTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.ok(receipt.to && isAddressEqual(receipt.to, fuji.vault));
  assert.ok(isAddressEqual(receipt.from, fuji.owner));
  assert.ok(receipt.blockNumber > previousBlock);
  const vaultLogs = receipt.logs.filter((log) => isAddressEqual(log.address, fuji.vault));
  const events = parseEventLogs({ abi: ownerEvents, eventName: event, logs: vaultLogs });
  assert.equal(events.length, 1);
  assert.ok(isAddressEqual(events[0].args.agent, proof.agent));
  previousBlock = receipt.blockNumber;
}
console.log("Fuji RPC verified 10 proof receipts, 2 owner UI receipts, four revert reasons, nonce and vault/partner balances.");

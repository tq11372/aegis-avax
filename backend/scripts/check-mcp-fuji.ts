import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { erc20Abi, isAddressEqual, parseAbi, parseEventLogs } from "viem";
import { connect, fuji, vaultAbi } from "../src/fuji.ts";

const run = JSON.parse(
  await readFile(
    new URL("../../docs/fuji-mcp-proof.json", import.meta.url),
    "utf8",
  ),
);
const client = connect("https://api.avax-test.network/ext/bc/C/rpc");
assert.equal(await client.getChainId(), 43113);
assert.deepEqual(run.exchanges, [
  { status: 402, paymentHeader: false },
  { status: 200, paymentHeader: true },
]);
assert.equal(run.riskLevel, "SAFE");
assert.equal(run.verifier, "model");
const fee = await client.getTransactionReceipt({ hash: run.feeHash });
const spend = await client.getTransactionReceipt({ hash: run.executeHash });
assert.equal(fee.status, "success");
assert.equal(spend.status, "success");
assert.ok(
  fee.blockNumber < spend.blockNumber ||
    (fee.blockNumber === spend.blockNumber &&
      fee.transactionIndex < spend.transactionIndex),
);
assert.equal(fee.from.toLowerCase(), run.relayer.toLowerCase());
assert.ok(fee.to && isAddressEqual(fee.to, fuji.token));
assert.ok(spend.to && isAddressEqual(spend.to, fuji.vault));
assert.ok(isAddressEqual(spend.from, run.agent));
assert.equal(run.payTo, fuji.owner);
assert.equal(run.partner, fuji.partner);
assert.equal(run.vault, fuji.vault);
assert.equal(run.token, fuji.token);
assert.equal(run.amountAtomic, "1000000");
assert.equal(run.feeAtomic, "5000");
function verifyTransfer(
  receipt: typeof fee,
  from: string,
  to: string,
  value: bigint,
) {
  const logs = receipt.logs.filter((log) =>
    isAddressEqual(log.address, fuji.token),
  );
  const events = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs });
  assert.equal(events.length, 1);
  assert.deepEqual(
    [
      events[0].args.from.toLowerCase(),
      events[0].args.to.toLowerCase(),
      events[0].args.value,
    ],
    [from.toLowerCase(), to.toLowerCase(), value],
  );
}
verifyTransfer(fee, run.agent, fuji.owner, 5000n);
verifyTransfer(spend, fuji.vault, fuji.partner, 1000000n);
const executed = parseEventLogs({
  abi: parseAbi([
    "event AgentExecuted(address indexed agent,address indexed token,address indexed recipient,uint256 amount,uint256 nonce)",
  ]),
  logs: spend.logs.filter((l) => isAddressEqual(l.address, fuji.vault)),
});
assert.equal(executed.length, 1);
const { agent, token, recipient, amount, nonce } = executed[0].args;
assert.deepEqual(
  [agent, token, recipient, amount, nonce],
  [run.agent, fuji.token, fuji.partner, 1000000n, BigInt(run.nonceBefore)],
);
async function state(blockNumber: bigint) {
  const balance = (address: typeof fuji.vault) =>
    client.readContract({
      blockNumber,
      address: fuji.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
  return Promise.all([
    balance(fuji.vault),
    balance(fuji.partner),
    client.readContract({
      blockNumber,
      address: fuji.vault,
      abi: vaultAbi,
      functionName: "nonce",
    }),
  ]);
}
const before = await state(spend.blockNumber - 1n),
  after = await state(spend.blockNumber);
assert.deepEqual(after, [
  before[0] - 1000000n,
  before[1] + 1000000n,
  before[2] + 1n,
]);
const gasFeeWei =
  fee.gasUsed * fee.effectiveGasPrice + spend.gasUsed * spend.effectiveGasPrice;
assert.ok(gasFeeWei <= 1000000000000000n);
console.log(
  JSON.stringify({
    feeBlock: String(fee.blockNumber),
    executeBlock: String(spend.blockNumber),
    vaultBefore: String(before[0]),
    vaultAfter: String(after[0]),
    partnerBefore: String(before[1]),
    partnerAfter: String(after[1]),
    nonceAfter: String(after[2]),
    gasFeeWei: String(gasFeeWei),
  }),
);

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { auditAbi, recordEvidence } from "../src/audit.ts";

const key = generatePrivateKey(),
  account = privateKeyToAccount(key);
const artifact = JSON.parse(
  await readFile(
    new URL(
      "../../contracts/out/ThreatAuditLog.sol/ThreatAuditLog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
async function withNetwork(
  id: number,
  run: (target: {
    id: number;
    url: string;
    contract: Address;
  }) => Promise<void>,
) {
  const child = spawn(
    process.env.ANVIL_BIN || "anvil",
    [
      "--chain-id",
      String(id),
      "--port",
      "0",
      "--accounts",
      "0",
      "--host",
      "127.0.0.1",
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  const lines = createInterface({ input: child.stdout });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Anvil startup timeout")),
        15000,
      );
      child.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Anvil exited"));
      });
      lines.on("line", (line) => {
        const m = line.match(/Listening on (127\.0\.0\.1:\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve("http://" + m[1]);
        }
      });
    });
    const chain = defineChain({
      id,
      name: "Local audit test",
      nativeCurrency: { name: "Gas", symbol: "GAS", decimals: 18 },
      rpcUrls: { default: { http: [url] } },
    });
    const transport = http(url),
      client = createPublicClient({ chain, transport, pollingInterval: 60 });
    await createTestClient({ chain, transport, mode: "anvil" }).setBalance({
      address: account.address,
      value: 10n ** 18n,
    });
    const wallet = createWalletClient({ account, chain, transport });
    const deployment = await client.waitForTransactionReceipt({
      hash: await wallet.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args: [account.address],
      }),
    });
    assert.ok(deployment.contractAddress);
    const contract = deployment.contractAddress;
    await client.waitForTransactionReceipt({
      hash: await wallet.writeContract({
        address: contract,
        abi: parseAbi(["function setReporter(address,bool)"]),
        functionName: "setReporter",
        args: [account.address, true],
      }),
    });
    await run({ id, url, contract });
  } finally {
    lines.close();
    child.kill();
  }
}
await withNetwork(252025, async (primary) =>
  withNetwork(43113, async (secondary) => {
    const item = {
      id: keccak256(stringToHex("audit-smoke-1")),
      hash: keccak256(stringToHex("risk-fixture")),
      level: 2 as const,
    };
    const settings = { key, primary, secondary };
    const verified = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("../scripts/verify-audit.ts", import.meta.url))],
      {
        windowsHide: true,
        env: {
          ...process.env,
          AUDIT_L1_RPC_URL: primary.url,
          AUDIT_L1_CHAIN_ID: String(primary.id),
          AUDIT_LOG_CONTRACT_ADDRESS: primary.contract,
          AUDIT_REPORTER_ADDRESS: account.address,
          DEPLOYER_ADDRESS: account.address,
        },
      },
    );
    assert.equal(JSON.parse(verified.stdout).contract, getAddress(primary.contract));
    async function check(
      target: typeof primary,
      txHash: Hex | undefined,
      id: Hex,
    ) {
      assert.ok(txHash);
      const client = createPublicClient({ transport: http(target.url) });
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      assert.equal(receipt.status, "success");
      const log = receipt.logs.find(
        (l) => l.address.toLowerCase() === target.contract.toLowerCase(),
      );
      assert.ok(log);
      const decoded = decodeEventLog({
        abi: auditAbi,
        eventName: "ThreatLogged",
        data: log.data,
        topics: log.topics,
      });
      assert.equal(decoded.args.id, id);
      assert.equal(decoded.args.riskHash, item.hash);
      assert.equal(decoded.args.level, 2);
    }
    const first = await recordEvidence(settings, item);
    assert.equal(first.chainId, primary.id);
    await check(primary, first.txHash, item.id);
    assert.equal((await recordEvidence(settings, item)).txHash, undefined);
    const next = { ...item, id: keccak256(stringToHex("audit-smoke-2")) };
    const at = performance.now();
    const fallback = await recordEvidence(
      { ...settings, primary: { ...primary, url: "http://127.0.0.1:1" } },
      next,
    );
    const ms = Math.round(performance.now() - at);
    assert.equal(fallback.chainId, 43113);
    await check(secondary, fallback.txHash, next.id);
    assert.ok(ms < 5000, "Fallback took " + ms + " ms");
    console.log(
      JSON.stringify({
        network: "two isolated Anvil nodes",
        first: first.txHash,
        fallback: fallback.txHash,
        fallbackMs: ms,
        duplicateSuppressed: true,
      }),
    );
  }),
);

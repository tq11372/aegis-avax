import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
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
// Interrupt a real worker on either side of RPC acceptance, then recover its
// migrated outbox in a second process against the same two isolated chains.
async function checkRestart(
  primary: { id: number; url: string; contract: Address },
  secondary: typeof primary,
  accepted: boolean,
) {
  const directory = await mkdtemp(join(tmpdir(), "aegis-audit-"));
  const path = join(directory, "outbox.sqlite");
  const db = new DatabaseSync(path);
  const reader = createPublicClient({ transport: http(primary.url) });
  const item = {
    id: keccak256(stringToHex("restart-" + accepted)),
    hash: keccak256(stringToHex("sample")),
    level: 1,
  };
  const scope = JSON.stringify([
    account.address,
    [primary.id, getAddress(primary.contract)],
    [secondary.id, getAddress(secondary.contract)],
  ]);
  const before = await reader.getTransactionCount({ address: account.address });
  let intercepted = false;
  const proxy = createServer(async (req, res) => {
    try {
      const parts: Buffer[] = [];
      for await (const chunk of req) parts.push(chunk);
      const body = Buffer.concat(parts).toString();
      const sending = JSON.parse(body).method === "eth_sendRawTransaction";
      if (!sending || accepted) {
        const upstream = await fetch(primary.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const response = await upstream.text();
        if (!sending) {
          res.end(response);
          return;
        }
        if (JSON.parse(response).error) {
          res.end(response);
          return;
        }
      }
      intercepted = true; // Drop the reply after the bytes have been persisted.
      res.destroy();
    } catch {
      res.destroy();
    }
  });
  let worker: ReturnType<typeof spawn> | undefined;
  async function stop() {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exit = once(worker, "exit");
      worker.kill();
      await exit;
    }
  }
  function start(url: string) {
    worker = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import { createAuditSink } from './backend/src/audit.ts'; createAuditSink(process.env); setInterval(() => {}, 60000)",
      ],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        windowsHide: true,
        stdio: "ignore",
        env: {
          ...process.env,
          AUDIT_REPORTER_PRIVATE_KEY: key,
          AUDIT_L1_RPC_URL: url,
          AUDIT_L1_CHAIN_ID: String(primary.id),
          AUDIT_LOG_CONTRACT_ADDRESS: primary.contract,
          AUDIT_FALLBACK_RPC_URL: secondary.url,
          AUDIT_FALLBACK_CONTRACT_ADDRESS: secondary.contract,
          AUDIT_OUTBOX_PATH: path,
        },
      },
    );
  }
  async function until(predicate: () => boolean) {
    const deadline = Date.now() + 30000;
    while (!predicate()) {
      if (worker?.exitCode != null || Date.now() >= deadline)
        throw Error("Audit worker recovery timed out");
      await delay(50);
    }
  }
  try {
    db.exec(
      "CREATE TABLE outbox(scope TEXT,id TEXT,evidence TEXT,target INTEGER,due INTEGER DEFAULT 0,receipt TEXT,PRIMARY KEY(scope,id))",
    );
    db.prepare("INSERT INTO outbox(scope,id,evidence) VALUES(?,?,?)").run(
      scope,
      item.id,
      JSON.stringify(item),
    );
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const addr = proxy.address();
    assert.ok(addr && typeof addr !== "string");
    start("http://127.0.0.1:" + addr.port);
    await until(() => intercepted);
    await stop();
    const row = db.prepare("SELECT signed_tx,target FROM outbox").get()!;
    assert.equal(row.target, primary.id);
    const hash = keccak256(row.signed_tx as Hex);
    assert.equal(
      await reader.getTransactionCount({ address: account.address }),
      before + Number(accepted),
    );
    // Expire the crashed worker's lease without a two-minute sleep.
    db.exec("UPDATE outbox SET due=0");
    start(primary.url);
    await until(
      () => !!db.prepare("SELECT receipt FROM outbox").get()?.receipt,
    );
    assert.equal(
      JSON.parse(
        String(db.prepare("SELECT receipt FROM outbox").get()!.receipt),
      ).txHash,
      hash,
    );
    assert.equal(
      (await reader.getTransactionReceipt({ hash })).status,
      "success",
    );
    assert.equal(
      await reader.getTransactionCount({ address: account.address }),
      before + 1,
    );
    const fallback = createPublicClient({ transport: http(secondary.url) });
    assert.equal(
      await fallback.readContract({
        address: secondary.contract,
        abi: auditAbi,
        functionName: "recorded",
        args: [item.id],
      }),
      false,
    );
  } finally {
    await stop();
    proxy.closeAllConnections();
    if (proxy.listening)
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    db.close();
    await rm(directory, { recursive: true, force: true });
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
    assert.equal(
      JSON.parse(verified.stdout).contract,
      getAddress(primary.contract),
    );
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
    await checkRestart(primary, secondary, false);
    await checkRestart(primary, secondary, true);
    console.log(
      JSON.stringify({
        network: "two isolated Anvil nodes",
        first: first.txHash,
        fallback: fallback.txHash,
        fallbackMs: ms,
        duplicateSuppressed: true,
        restartBeforeAcceptance: true,
        restartAfterAcceptance: true,
      }),
    );
  }),
);

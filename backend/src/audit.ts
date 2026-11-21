import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  isHex,
  keccak256,
  parseAbi,
  stringToHex,
  type Hex,
  type Address,
  TransactionReceiptNotFoundError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Scan } from "./fuji.ts";
export const auditAbi = parseAbi([
  "function reporters(address) view returns (bool)",
  "function recorded(bytes32) view returns (bool)",
  "function logThreat(bytes32 id,bytes32 riskHash,uint8 level,uint256 observedAt)",
  "event ThreatLogged(bytes32 indexed id,bytes32 indexed riskHash,uint8 level,uint256 observedAt)",
]);
type Destination = { url: string; id: number; contract: Address };
type Report = {
  riskLevel: "SAFE" | "MEDIUM" | "CRITICAL";
  intentMatch: boolean;
  triggeredRules: string[];
  simulation: { block: string };
};
type Evidence = { id: Hex; hash: Hex; level: 1 | 2 };
export function evidence(scan: Scan, report: Report): Evidence | undefined {
  if (report.riskLevel === "SAFE") return;
  const hash = (data: unknown) => keccak256(stringToHex(JSON.stringify(data)));
  const riskHash = hash([
    report.riskLevel,
    report.intentMatch,
    [...report.triggeredRules].sort(),
  ]);
  return {
    hash: riskHash,
    id: hash([
      "AegisAVAX/v1",
      43113,
      report.simulation.block,
      scan.from.toLowerCase(),
      scan.to.toLowerCase(),
      scan.data.toLowerCase(),
      scan.value,
      scan.userIntent,
      scan.minOutput ?? null,
      riskHash,
    ]),
    level: report.riskLevel === "CRITICAL" ? 2 : 1,
  };
}
export function auditSettings(env: NodeJS.ProcessEnv) {
  const key = env.AUDIT_REPORTER_PRIVATE_KEY;
  if (!key) return;
  if (!isHex(key) || key.length !== 66)
    throw Error("Invalid audit reporter key");
  function destination(
    url?: string,
    id?: string,
    address?: string,
  ): Destination {
    const chainId = Number(id);
    if (
      !url ||
      !address ||
      !Number.isSafeInteger(chainId) ||
      chainId <= 0 ||
      [1, 43114].includes(chainId)
    )
      throw Error("Invalid audit testnet configuration");
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
      )
    )
      throw Error("Invalid audit RPC");
    return { url, id: chainId, contract: getAddress(address) };
  }
  const primary = destination(
    env.AUDIT_L1_RPC_URL,
    env.AUDIT_L1_CHAIN_ID,
    env.AUDIT_LOG_CONTRACT_ADDRESS,
  );
  const secondary = env.AUDIT_FALLBACK_RPC_URL
    ? destination(
        env.AUDIT_FALLBACK_RPC_URL,
        "43113",
        env.AUDIT_FALLBACK_CONTRACT_ADDRESS,
      )
    : undefined;
  if (secondary && primary.id === secondary.id && primary.contract !== secondary.contract)
    throw Error("Ambiguous audit contracts for one chain ID");
  return { key, primary, secondary };
}
type Settings = NonNullable<ReturnType<typeof auditSettings>>;
export async function recordEvidence(
  settings: Settings,
  item: Evidence,
  beforeBroadcast?: (target: Destination, signed: Hex) => void,
  pinned?: { signed?: Hex },
) {
  const account = privateKeyToAccount(settings.key);
  async function prepare(target: Destination) {
    const chain = defineChain({
      id: target.id,
      name: "Audit testnet",
      nativeCurrency: { name: "Gas", symbol: "GAS", decimals: 18 },
      rpcUrls: { default: { http: [target.url] } },
    });
    const transport = http(target.url, { retryCount: 0, timeout: 1200 });
    const reader = createPublicClient({ chain, transport });
    const contract = { address: target.contract, abi: auditAbi } as const;
    const [id, block, allowed, recorded] = await Promise.all([
      reader.getChainId(),
      reader.getBlock(),
      reader.readContract({
        ...contract,
        functionName: "reporters",
        args: [account.address],
      }),
      reader.readContract({
        ...contract,
        functionName: "recorded",
        args: [item.id],
      }),
    ]);
    if (id !== target.id) throw Error("Audit chain mismatch");
    if (recorded) {
      const hash = pinned?.signed && keccak256(pinned.signed);
      const receipt =
        hash &&
        (await reader.getTransactionReceipt({ hash }).catch(error => {
          if (error instanceof TransactionReceiptNotFoundError) return undefined;
          throw error;
        }));
      return {
        target,
        send: undefined,
        confirmedHash: receipt?.status === "success" ? hash : undefined,
      };
    }
    if (!allowed) throw Error("Audit reporter mismatch");
    if (pinned && !pinned.signed)
      throw Error("Legacy broadcast outcome still unconfirmed");
    const wallet = createWalletClient({ account, chain, transport });
    let signed = pinned?.signed;
    if (!signed) {
      const call = {
        ...contract,
        account,
        functionName: "logThreat",
        args: [item.id, item.hash, item.level, block.timestamp],
      } as const;
      await reader.simulateContract(call);
      const transaction = await wallet.prepareTransactionRequest({
        to: target.contract,
        data: encodeFunctionData(call),
      });
      signed = await wallet.signTransaction(transaction);
    }
    const serializedTransaction = signed;
    return {
      target,
      send: async () => {
        if (!pinned) beforeBroadcast?.(target, serializedTransaction);
        const hash = keccak256(serializedTransaction);
        try {
          await wallet.sendRawTransaction({ serializedTransaction });
        } catch (error) {
          // An RPC may accept the bytes and lose its response. Verify by hash.
          if (!(await reader.getTransaction({ hash }).catch(() => null)))
            throw error;
        }
        const receipt = await reader.waitForTransactionReceipt({
          hash,
          timeout: 30000,
        });
        if (receipt.status !== "success")
          throw Error("Audit transaction reverted");
        return hash;
      },
    };
  }
  let ready;
  try {
    ready = await prepare(settings.primary);
  } catch (error) {
    if (pinned || !settings.secondary) throw error;
    ready = await prepare(settings.secondary);
  }
  // A broadcast with an uncertain outcome stays on the selected chain.
  return {
    chainId: ready.target.id,
    contract: ready.target.contract,
    txHash: (await ready.send?.()) ?? ready.confirmedHash,
  };
}
export function createAuditSink(env: NodeJS.ProcessEnv) {
  const settings = auditSettings(env);
  if (!settings) return () => undefined;
  const path = resolve(env.AUDIT_OUTBOX_PATH || ".aegis-audit/outbox.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS outbox(
      scope TEXT NOT NULL, id TEXT NOT NULL, evidence TEXT NOT NULL,
      target INTEGER, due INTEGER NOT NULL DEFAULT 0, receipt TEXT,
      PRIMARY KEY(scope,id))`);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db
        .prepare("PRAGMA table_info(outbox)")
        .all()
        .some((column) => column.name === "signed_tx")
    )
      db.exec("ALTER TABLE outbox ADD COLUMN signed_tx TEXT");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const destinations = [settings.primary, settings.secondary].filter(
    (d): d is Destination => !!d,
  );
  const scope = JSON.stringify([
    privateKeyToAccount(settings.key).address,
    ...destinations.map((d) => [d.id, d.contract]),
  ]);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO outbox(scope,id,evidence) VALUES(?,?,?)",
  );
  const claim =
    db.prepare(`UPDATE outbox SET due=? WHERE scope=? AND due<=? AND id=(
    SELECT id FROM outbox WHERE scope=? AND receipt IS NULL
    ORDER BY rowid LIMIT 1) RETURNING id,evidence,target,signed_tx`);
  const pin = db.prepare(
    "UPDATE outbox SET target=?,signed_tx=? WHERE scope=? AND id=? AND target IS NULL",
  );
  const done = db.prepare("UPDATE outbox SET receipt=? WHERE scope=? AND id=?");
  const retry = db.prepare("UPDATE outbox SET due=? WHERE scope=? AND id=?");
  let working = false;
  async function drain() {
    if (working) return;
    working = true;
    try {
      for (;;) {
        const now = Date.now();
        const row = claim.get(now + 120000, scope, now, scope);
        if (!row) break;
        const item: Evidence = JSON.parse(String(row.evidence));
        try {
          const target = destinations.find((d) => d.id === row.target);
          if (row.target !== null && !target)
            throw Error("Audit destination has changed");
          const result = await recordEvidence(
            target
              ? { ...settings!, primary: target, secondary: undefined }
              : settings!,
            item,
            (selected, signed) => {
              if (pin.run(selected.id, signed, scope, item.id).changes !== 1)
                throw Error("Evidence already claimed for broadcast");
            },
            target ? { signed: row.signed_tx as Hex | undefined } : undefined,
          );
          done.run(JSON.stringify(result), scope, item.id);
        } catch {
          retry.run(Date.now() + 60000, scope, item.id);
          console.warn("Audit evidence pending reconciliation", item.id);
        }
      }
    } finally {
      working = false;
    }
  }
  function wake() {
    void drain().catch(() => console.error("Audit outbox unavailable"));
  }
  setInterval(wake, 10000).unref();
  wake();
  return (scan: Scan, report: Report) => {
    const item = evidence(scan, report);
    if (!item) return;
    insert.run(scope, item.id, JSON.stringify(item));
    wake();
    return item.id;
  };
}

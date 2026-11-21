import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isHex,
  keccak256,
  parseAbi,
  stringToHex,
  type Hex,
  type Address,
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
  return { key, primary, secondary };
}
type Settings = NonNullable<ReturnType<typeof auditSettings>>;
export async function recordEvidence(settings: Settings, item: Evidence,
  beforeBroadcast?: (target: Destination) => void, reconcileOnly = false) {
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
    if (id !== target.id || !allowed)
      throw Error("Audit chain or reporter mismatch");
    if (recorded) return { target, send: undefined };
    if (reconcileOnly) throw Error("Broadcast outcome still unconfirmed");
    const { request } = await reader.simulateContract({
      ...contract,
      account,
      functionName: "logThreat",
      args: [item.id, item.hash, item.level, block.timestamp],
    });
    const wallet = createWalletClient({ account, chain, transport });
    return {
      target,
      send: async () => {
        beforeBroadcast?.(target);
        const hash = await wallet.writeContract(request);
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
    if (!settings.secondary) throw error;
    ready = await prepare(settings.secondary);
  }
  // A broadcast with an uncertain outcome stays on the selected chain.
  return {
    chainId: ready.target.id,
    contract: ready.target.contract,
    txHash: await ready.send?.(),
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
  const destinations = [settings.primary, settings.secondary].filter((d): d is Destination => !!d);
  const scope = JSON.stringify([privateKeyToAccount(settings.key).address,
    ...destinations.map(d => [d.id, d.contract])]);
  const insert = db.prepare("INSERT OR IGNORE INTO outbox(scope,id,evidence) VALUES(?,?,?)");
  const claim = db.prepare(`UPDATE outbox SET due=? WHERE scope=? AND id=(
    SELECT id FROM outbox WHERE scope=? AND receipt IS NULL AND due<=?
    ORDER BY due,rowid LIMIT 1) RETURNING id,evidence,target`);
  const pin = db.prepare("UPDATE outbox SET target=? WHERE scope=? AND id=? AND target IS NULL");
  const done = db.prepare("UPDATE outbox SET receipt=? WHERE scope=? AND id=?");
  const retry = db.prepare("UPDATE outbox SET due=? WHERE scope=? AND id=?");
  let working = false;
  async function drain() {
    if (working) return;
    working = true;
    try {
      for (;;) {
        const now = Date.now();
        const row = claim.get(now + 120000, scope, scope, now);
        if (!row) break;
        const item: Evidence = JSON.parse(String(row.evidence));
        try {
          const target = destinations.find(d => d.id === row.target);
          if (row.target !== null && !target) throw Error("Audit destination has changed");
          const result = await recordEvidence(target ? { ...settings!, primary: target, secondary: undefined } : settings!, item, selected => {
            if (pin.run(selected.id, scope, item.id).changes !== 1)
              throw Error("Evidence already claimed for broadcast");
          }, !!target);
          done.run(JSON.stringify(result), scope, item.id);
        } catch {
          retry.run(Date.now() + 60000, scope, item.id);
          console.warn("Audit evidence pending reconciliation", item.id);
        }
      }
    } finally { working = false; }
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

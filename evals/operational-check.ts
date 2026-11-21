import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { connect, fuji, rpc, scanSchema } from "../backend/src/fuji.ts";
import { withFork } from "../backend/src/fork.ts";
import { review, reputation } from "../backend/src/risk.ts";
import { simulate } from "../backend/src/simulation.ts";
import { verifyIntent } from "../backend/src/intent.ts";

const modelUrl = process.env.LLM_BASE_URL;
if (
  !modelUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(modelUrl).hostname)
)
  throw Error("Start the local model and demo before running this measurement");

function transfer(from: Address, amount: number, requested = amount) {
  return scanSchema.parse({
    from,
    to: fuji.token,
    value: "0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [fuji.partner, BigInt(amount) * 1000000n],
    }),
    userIntent: `Chuyển ${requested} mUSDC đến MockPartner`,
  });
}

const state = await fetch("http://127.0.0.1:4022/api/demo/state").then((r) =>
  r.json(),
);
const load = [];
for (const [label, clients, identical] of [
  ["one", 1, false],
  ["four-distinct", 4, false],
  ["four-identical", 4, true],
] as const) {
  const samples = [];
  for (let wave = 0; wave < 3; wave++) {
    const batch = await Promise.all(
      Array.from({ length: clients }, async (_, i) => {
        const scan = transfer(state.vault, wave + 1 + (identical ? 0 : i));
        const start = performance.now();
        const response = await fetch(
          "http://127.0.0.1:4021/api/v1/web/verify-tx",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(scan),
            signal: AbortSignal.timeout(65000),
          },
        );
        const body = await response.json();
        return {
          wave,
          client: i,
          status: response.status,
          ms: Math.round(performance.now() - start),
          risk: body.riskLevel ?? null,
          verifier: body.verifier ?? null,
        };
      }),
    );
    samples.push(...batch);
  }
  const served = samples
    .filter((s) => s.status === 200)
    .map((s) => s.ms)
    .sort((a, b) => a - b);
  const percentile = (p: number) =>
    served[Math.ceil(p * served.length) - 1] ?? null;
  load.push({
    label,
    requests: samples.length,
    ok: served.length,
    busy: samples.filter((s) => s.status === 429).length,
    p50ServedMs: percentile(0.5),
    p95ServedMs: percentile(0.95),
    samples,
  });
}

// Share the exact simulated state across modes, varying only the decision stage.
const comparison = await withFork(async (chain, block) => {
  const cases = [];
  for (const amount of [1, 2, 3, 4]) {
    for (const requested of [amount, amount + 1]) {
      const scan = transfer(fuji.vault, amount, requested);
      const sim = await simulate(chain, block, scan);
      assert.equal(sim.reverted, false);
      const targets = await reputation(chain, block, scan, sim);
      const rules = review(scan, sim, targets);
      delete process.env.LLM_BASE_URL;
      let offline;
      try {
        offline = await verifyIntent(scan, sim, rules, targets);
      } finally {
        process.env.LLM_BASE_URL = modelUrl;
      }
      const full = await verifyIntent(scan, sim, rules, targets);
      cases.push({
        amount,
        requested,
        expectedBlock: amount !== requested,
        rulesOnlyBlock: rules.triggeredRules.length > 0,
        offline: { verifier: offline.verifier, risk: offline.riskLevel },
        full: { verifier: full.verifier, risk: full.riskLevel },
      });
    }
  }
  return { block: String(block), cases };
});
const proof = JSON.parse(
  await readFile(
    new URL("../docs/fuji-live-proof.json", import.meta.url),
    "utf8",
  ),
);
const tx = proof.rows.find((row: { step: string }) => row.step === "fee");
assert.ok(tx, "Missing x402 payment receipt in the Fuji proof");
const client = connect(rpc);
assert.equal(await client.getChainId(), 43113);
const receipt = await client.getTransactionReceipt({ hash: tx.hash });
assert.equal(receipt.status, "success");
const cost = {
  chainId: 43113,
  hash: receipt.transactionHash,
  gasUsed: String(receipt.gasUsed),
  gasPriceWei: String(receipt.effectiveGasPrice),
  relayerGasWei: String(receipt.gasUsed * receipt.effectiveGasPrice),
};
const result = {
  measuredAt: new Date().toISOString(),
  model: process.env.LLM_MODEL,
  demoForkBlock: state.block,
  load,
  comparison,
  cost,
};
const output = process.argv[2];
if (output) await writeFile(output, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(result, (key, val) => (key === "samples" ? undefined : val)),
);

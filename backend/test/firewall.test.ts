import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, erc20Abi, maxUint256, type Address } from "viem";
import { fuji, scanSchema, type Scan, type Simulation } from "../src/fuji.ts";
import { review, confirmedTransfer } from "../src/risk.ts";
import { verifyIntent } from "../src/intent.ts";
import { createApp } from "../src/server.ts";
import { paidPath } from "../src/payments.ts";
import { createMcp } from "../../mcp-server/src/server.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const input: Scan = {
  from: fuji.vault,
  to: fuji.token,
  value: "0",
  userIntent: "Chuyển 3 mUSDC đến MockPartner",
  knownRecipients: [],
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [fuji.partner, 3000000n],
  }),
};
const snapshot: Simulation = {
  block: "1",
  blockHash: "0x01",
  reverted: false,
  result: "0x01",
  balances: [
    {
      asset: fuji.token,
      account: fuji.vault,
      before: "100000000",
      after: "97000000",
    },
    { asset: fuji.token, account: fuji.partner, before: "0", after: "3000000" },
  ],
  events: [
    {
      name: "Transfer",
      asset: fuji.token,
      from: fuji.vault,
      to: fuji.partner,
      amount: "3000000",
    },
  ],
};

test("clean transfer requires matching measured balances", () => {
  assert.equal(confirmedTransfer(input, snapshot)?.amount, "3000000");
  assert.equal(
    confirmedTransfer(input, { ...snapshot, balances: [] }),
    undefined,
  );
  assert.deepEqual(review(input, snapshot, []).triggeredRules, []);
});
test("risk rules inspect approvals, losses, recipient, registry and minimum output", () => {
  const similar = (
    fuji.partner.slice(0, 8) +
    "0".repeat(28) +
    fuji.partner.slice(-6)
  ).toLowerCase() as Address;
  const scan = {
    ...input,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [similar, maxUint256],
    }),
    minOutput: { token: fuji.token, amount: "1" },
  };
  const sim = {
    ...snapshot,
    balances: [
      { asset: fuji.token, account: fuji.vault, before: "100", after: "19" },
    ],
  };
  const codes = review(scan, sim, [
    { address: similar, allowed: false, verified: false, flagged: true },
  ]).triggeredRules;
  assert.equal(new Set(codes).size, 5);
});
test("risk rules veto an otherwise clean intent; missing model fails closed", async () => {
  const bad = review(input, { ...snapshot, reverted: true }, []);
  assert.equal(
    (await verifyIntent(input, snapshot, bad)).riskLevel,
    "CRITICAL",
  );
  const original = process.env.LLM_MODEL;
  delete process.env.LLM_MODEL;
  try {
    const verdict = await verifyIntent(
      input,
      snapshot,
      review(input, snapshot, []),
    );
    assert.equal(verdict.intentMatch, false);
  } finally {
    if (original !== undefined) process.env.LLM_MODEL = original;
  }
});
test("explicit intent mismatch cannot be labelled SAFE", async () => {
  const mismatch = { ...input, userIntent: "Chuyển 7 mUSDC đến MockPartner" };
  const resolved = await verifyIntent(
    mismatch,
    snapshot,
    review(mismatch, snapshot, []),
  );
  assert.equal(resolved.verifier, "intent");
  assert.equal(resolved.intentMatch, false);
});
test("API rejects invalid input and advertises the precise x402 price", async () => {
  const app = createApp();
  const free = await app.request("/api/v1/web/verify-tx", {
    method: "POST",
    body: "{}",
  });
  assert.equal(free.status, 400);
  const response = await app.request(paidPath, {
    method: "POST",
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 402);
  const terms = JSON.parse(
    Buffer.from(response.headers.get("PAYMENT-REQUIRED")!, "base64").toString(),
  ).accepts[0];
  assert.equal(terms.amount, "5000");
  assert.equal(terms.network, "eip155:43113");
  assert.equal(terms.asset.toLowerCase(), fuji.token.toLowerCase());
  assert.equal(scanSchema.safeParse({ ...input, value: "-1" }).success, false);
});
test("MCP client discovers the scan tool over the protocol", async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcp(),
    client = new Client({ name: "test", version: "1" });
  try {
    await server.connect(a);
    await client.connect(b);
    const list = await client.listTools();
    assert.deepEqual(
      list.tools.map((t) => t.name),
      ["simulate_and_verify_tx"],
    );
  } finally {
    await client.close();
    await server.close();
  }
});

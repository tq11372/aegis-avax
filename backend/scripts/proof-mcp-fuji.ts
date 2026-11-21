// One authorized testnet payment only. The exclusive local journal prevents an accidental rerun.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, open, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { ownerPayment } from "../src/owner-intent.ts";
import { connect, fuji, rpc, vaultAbi } from "../src/fuji.ts";

async function main() {
  assert.equal(process.argv[2], "--broadcast-once");
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  assert.equal(
    resolve(process.cwd()),
    resolve(projectRoot),
    "Run from the repository root",
  );
  assert.ok(
    !existsSync("docs/fuji-mcp-proof.json"),
    "Proof already published; use npm run check:mcp-fuji",
  );
  assert.equal(rpc, "https://api.avax-test.network/ext/bc/C/rpc");
  assert.equal(fuji.vault, "0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F");
  assert.equal(process.env.X402_FACILITATOR_URL || "", "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.LLM_BASE_URL!).hostname,
    ),
  );
  const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex);
  const agent = privateKeyToAccount(
    process.env.AGENT_SESSION_PRIVATE_KEY as Hex,
  );
  const relayer = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
  const chain = connect(rpc);
  assert.equal(await chain.getChainId(), 43113);
  const read = { address: fuji.vault, abi: vaultAbi } as const;
  const [currentOwner, currentAgent, currentSigner, nonce] = await Promise.all([
    chain.readContract({ ...read, functionName: "owner" }),
    chain.readContract({ ...read, functionName: "agent" }),
    chain.readContract({ ...read, functionName: "signer" }),
    chain.readContract({ ...read, functionName: "nonce" }),
  ]);
  assert.equal(owner.address, currentOwner);
  assert.equal(owner.address, fuji.owner);
  assert.equal(agent.address, currentAgent);
  assert.equal(relayer.address, currentSigner);
  assert.equal(
    privateKeyToAccount(process.env.AEGIS_SIGNER_PRIVATE_KEY as Hex).address,
    currentSigner,
  );
  Object.assign(process.env, {
    X402_PAY_TO: owner.address,
    X402_PAYER_PRIVATE_KEY: process.env.AGENT_SESSION_PRIVATE_KEY,
    X402_SESSION_BUDGET_ATOMIC: "5000",
    AEGIS_REQUIRE_OWNER_INTENT: "true",
    AUDIT_REPORTER_PRIVATE_KEY: "",
  });
  const { createApp } = await import("../src/server.ts");
  const { paymentGate, facilitator } = await import("../src/payments.ts");
  const { createMcp } = await import("../../mcp-server/src/server.ts");
  const maxFeePerGas = 2_000_000_000n,
    maxPriorityFeePerGas = 1_000_000n;
  assert.ok((await chain.getGasPrice()) < maxFeePerGas);
  // These two fixed limits bound the combined worst-case gas fee to 0.001 AVAX.
  const app = createApp(
    paymentGate(
      facilitator({ gas: 200000n, maxFeePerGas, maxPriorityFeePerGas }),
    ),
  );
  const exchanges: { status: number; paymentHeader: boolean }[] = [];
  const server = serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const res = await app.fetch(req);
      if (new URL(req.url).pathname === "/api/v1/agent/verify-tx")
        exchanges.push({
          status: res.status,
          paymentHeader: req.headers.has("payment-signature"),
        });
      return res;
    },
  });
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  process.env.AEGIS_API_URL = "http://127.0.0.1:" + address.port;
  const mcp = createMcp(),
    consumer = new Client({ name: "fuji-proof", version: "1" });
  const amount = 1_000_000n;
  const input = {
    from: fuji.vault,
    to: fuji.token,
    value: "0",
    userIntent: "Chuyển 1 mUSDC đến MockPartner",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [fuji.partner, amount],
    }),
  };
  try {
    const preflight = await fetch(
      process.env.AEGIS_API_URL + "/api/v1/web/verify-tx",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const review = await preflight.json();
    assert.equal(preflight.status, 200);
    assert.equal(review.verifier, "model");
    assert.equal(review.riskLevel, "SAFE");
    const [left, right] = InMemoryTransport.createLinkedPair();
    await mcp.connect(left);
    await consumer.connect(right);
    const validUntil = (await chain.getBlock()).timestamp + 180n;
    const signature = await owner.signTypedData(
      ownerPayment(
        fuji.vault,
        agent.address,
        fuji.token,
        fuji.partner,
        amount,
        nonce,
        validUntil,
      ),
    );
    await mkdir(".fuji-proof", { recursive: true });
    const journal = await open(".fuji-proof/mcp-once.jsonl", "ax");
    try {
      async function record(data: object) {
        await journal.write(JSON.stringify(data) + "\n");
        await journal.sync();
      }
      await record({
        phase: "calling",
        expectedVaultNonce: String(nonce),
        sender: agent.address,
      });
      const reply = await consumer.callTool({
        name: "simulate_and_verify_tx",
        arguments: {
          ...input,
          ownerApproval: { validUntil: String(validUntil), signature },
        },
      });
      assert.ok(
        !reply.isError &&
          Array.isArray(reply.content) &&
          reply.content[0].type === "text",
        "MCP call failed",
      );
      const response = JSON.parse(reply.content[0].text);
      const feeHash: Hex = response.payment.transaction;
      assert.equal(response.payment.success, true);
      await record({ phase: "fee", feeHash, exchanges });
      assert.deepEqual(exchanges, [
        { status: 402, paymentHeader: false },
        { status: 200, paymentHeader: true },
      ]);
      assert.equal(response.result.riskLevel, "SAFE");
      assert.equal(response.result.verifier, "model");
      const clearance = response.result.clearance;
      const args = [
        fuji.token,
        input.data,
        0n,
        BigInt(clearance.deadline),
        clearance.signature,
      ] as const;
      await chain.simulateContract({
        ...read,
        account: agent.address,
        functionName: "execute",
        args,
      });
      const wallet = createWalletClient({
        account: agent,
        chain: avalancheFuji,
        transport: http(rpc),
      });
      const raw = await wallet.signTransaction(
        await wallet.prepareTransactionRequest({
          to: fuji.vault,
          data: encodeFunctionData({
            abi: vaultAbi,
            functionName: "execute",
            args,
          }),
          gas: 300000n,
          maxFeePerGas,
          maxPriorityFeePerGas,
        }),
      );
      const { keccak256 } = await import("viem");
      const executeHash = keccak256(raw);
      await record({ phase: "prepared", executeHash });
      assert.equal(
        await wallet.sendRawTransaction({ serializedTransaction: raw }),
        executeHash,
      );
      for (const hash of [feeHash, executeHash])
        assert.equal(
          (await chain.waitForTransactionReceipt({ hash })).status,
          "success",
        );
      const proof = {
        chainId: 43113,
        exchanges,
        tool: "simulate_and_verify_tx",
        model: process.env.LLM_MODEL,
        verifier: response.result.verifier,
        riskLevel: response.result.riskLevel,
        vault: fuji.vault,
        agent: agent.address,
        relayer: relayer.address,
        payTo: owner.address,
        partner: fuji.partner,
        token: fuji.token,
        amountAtomic: String(amount),
        feeAtomic: "5000",
        nonceBefore: String(nonce),
        feeHash,
        executeHash,
      };
      await writeFile(
        "docs/fuji-mcp-proof.json",
        JSON.stringify(proof, null, 2) + "\n",
        { flag: "wx" },
      );
      console.log(JSON.stringify(proof));
    } finally {
      await journal.close();
    }
  } finally {
    await consumer.close();
    await mcp.close();
    server.close();
  }
}
main().catch((err) => {
  console.error(
    "Proof stopped:",
    err instanceof assert.AssertionError ? err.message.slice(0, 160) : err.name,
    "Inspect the local journal before considering any further action.",
  );
  process.exitCode = 1;
});

// Run explicitly with npm run test:fork. All writes use a private child Anvil.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import {
  getAddress,
  createWalletClient,
  createTestClient,
  encodeFunctionData,
  erc20Abi,
  http,
  maxUint256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fileURLToPath } from "node:url";
import { withFork } from "../src/fork.ts";
import { fuji, rpc, connect, vaultAbi } from "../src/fuji.ts";
import { createMcp } from "../../mcp-server/src/server.ts";

const chain = connect(rpc);
const block = await chain.getBlockNumber();
const balanceAtBlock = () =>
  chain.readContract({
    address: fuji.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [fuji.vault],
    blockNumber: block,
  });
const before = await balanceAtBlock();
await withFork(async (sandbox) => {
  const local = sandbox.transport.url;
  assert.ok(local && new URL(local).hostname === "127.0.0.1");
  const dev = createTestClient({
    chain: avalancheFuji,
    mode: "anvil",
    transport: http(local),
  });
  await dev.setAutomine(true);
  const keys = {
    relayer: generatePrivateKey(),
    signer: generatePrivateKey(),
    agent: generatePrivateKey(),
  };
  const account = privateKeyToAccount(keys.relayer),
    agent = privateKeyToAccount(keys.agent);
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(local),
  });
  const receipt = (hash: Hex) =>
    sandbox.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  await dev.setBalance({ address: account.address, value: 10n ** 18n });
  await dev.setBalance({ address: agent.address, value: 10n ** 18n });
  const artifact = JSON.parse(
    await readFile(
      new URL(
        "../../contracts/out/GuardVault.sol/GuardVault.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const deployed = await receipt(
    await wallet.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [
        account.address,
        fuji.policy,
        privateKeyToAccount(keys.signer).address,
      ],
    }),
  );
  assert.equal(deployed.status, "success");
  const vault = getAddress(deployed.contractAddress!);
  async function write(
    address: Address,
    abi: typeof erc20Abi | ReturnType<typeof parseAbi>,
    functionName: string,
    args: readonly unknown[],
    sender = account,
  ) {
    const hash = await wallet.writeContract({
      address,
      abi: abi as import("viem").Abi,
      functionName,
      args,
      account: sender,
    });
    assert.equal((await receipt(hash)).status, "success");
    return hash;
  }
  await write(vault, parseAbi(["function grantAgent(address)"]), "grantAgent", [
    agent.address,
  ]);
  await write(fuji.token, parseAbi(["function faucet()"]), "faucet", [], agent);
  await write(fuji.token, erc20Abi, "transfer", [vault, 50_000_000n], agent);

  // Deterministic HTTP fixture tests the model integration without external credentials.
  const model = createServer((req, res) => {
    req.resume();
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: "SAFE",
                intentMatch: true,
                explanationVi: "Kết quả của fixture kiểm thử.",
              }),
            },
          },
        ],
      }),
    );
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  const port = (model.address() as AddressInfo).port;
  const realModel = process.argv.includes("--local-model");
  if (realModel)
    assert.ok(
      process.env.LLM_BASE_URL &&
        ["127.0.0.1", "localhost", "[::1]"].includes(
          new URL(process.env.LLM_BASE_URL).hostname,
        ) &&
        process.env.LLM_MODEL,
      "Configure a local model endpoint in .env",
    );
  // A separate process loads the same backend with the locally deployed vault and throwaway roles.
  const start = new URL("./smoke-server.ts", import.meta.url);
  const child = spawn(process.execPath, [fileURLToPath(start)], {
    env: {
      ...process.env,
      FUJI_RPC_URL: local,
      GUARD_VAULT_ADDRESS: vault,
      RELAYER_PRIVATE_KEY: keys.relayer,
      X402_FACILITATOR_URL: "",
      AEGIS_SIGNER_PRIVATE_KEY: keys.signer,
      LLM_BASE_URL: realModel
        ? process.env.LLM_BASE_URL
        : "http://127.0.0.1:" + port,
      LLM_MODEL: realModel ? process.env.LLM_MODEL : "integration-fixture",
      LLM_API_KEY: "",
      X402_PAY_TO: fuji.owner,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Smoke backend startup timeout")),
        15000,
      );
      child.stdout.on("data", (d) => {
        const m = String(d).match(/AEGIS_PORT=(\d+)/);
        if (m) {
          clearTimeout(timeout);
          resolve("http://127.0.0.1:" + m[1]);
        }
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(Error("Smoke backend exited"));
      });
      child.once("error", reject);
    });
    const clean = {
      from: vault,
      to: fuji.token,
      value: "0",
      userIntent: "Chuyển 3 mUSDC đến MockPartner",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [fuji.partner, 3_000_000n],
      }),
    };
    const options = (data: typeof clean) => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const web = await fetch(url + "/api/v1/web/verify-tx", options(clean));
    const free = await web.json();
    assert.equal(web.status, 200, JSON.stringify(free));
    assert.equal(free.clearance, null);
    assert.equal(free.riskLevel, "SAFE", JSON.stringify(free));
    if (realModel) {
      assert.equal(free.verifier, "model");
      const mismatch = await (
        await fetch(
          url + "/api/v1/web/verify-tx",
          options({ ...clean, userIntent: "Chuyển 7 mUSDC đến MockPartner" }),
        )
      ).json();
      assert.equal(mismatch.intentMatch, false, JSON.stringify(mismatch));
      assert.notEqual(mismatch.riskLevel, "SAFE");
      console.log(
        "Local model passed amount mismatch and clean intent checks:",
        process.env.LLM_MODEL,
      );
    }
    process.env.X402_PAYER_PRIVATE_KEY = keys.agent;
    process.env.X402_PAY_TO = fuji.owner;
    process.env.AEGIS_API_URL = url;
    const getPayeeBalance = () =>
      sandbox.readContract({
        address: fuji.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [fuji.owner],
      });
    const payeeBefore = await getPayeeBalance();
    const mcp = createMcp(),
      consumer = new Client({ name: "smoke", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await mcp.connect(left);
    await consumer.connect(right);
    const result = await consumer.callTool({
      name: "simulate_and_verify_tx",
      arguments: clean,
    });
    await consumer.close();
    await mcp.close();
    assert.ok(
      Array.isArray(result.content) && result.content[0].type === "text",
    );
    const {
      status,
      result: report,
      payment: settlement,
    } = JSON.parse(result.content[0].text);
    assert.equal(status, 200, JSON.stringify(report));
    assert.equal((await getPayeeBalance()) - payeeBefore, 5000n);
    assert.equal(settlement.success, true);
    assert.equal(
      (await receipt(settlement.transaction as Hex)).status,
      "success",
    );
    const args = [
      fuji.token,
      clean.data,
      0n,
      BigInt(report.clearance.deadline),
      report.clearance.signature,
    ] as const;
    const tx = await write(vault, vaultAbi, "execute", args, agent);
    const remaining = await sandbox.readContract({
      address: fuji.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vault],
    });
    assert.equal(remaining, 47_000_000n);
    const flagged = {
      ...clean,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [fuji.flagged, maxUint256],
      }),
    };
    const denied = await (
      await fetch(url + "/api/v1/web/verify-tx", options(flagged))
    ).json();
    assert.ok(denied.triggeredRules.includes("UNLIMITED_APPROVAL"));
    assert.equal(denied.clearance, null);
    await assert.rejects(
      sandbox.simulateContract({
        address: vault,
        abi: vaultAbi,
        functionName: "execute",
        account: agent.address,
        args: [
          fuji.token,
          clean.data,
          0n,
          BigInt(report.clearance.deadline),
          "0x",
        ],
      }),
      /InvalidSecurityClearance/,
    );
    console.log(
      JSON.stringify({
        environment: "local Anvil fork",
        model: realModel ? process.env.LLM_MODEL : "HTTP fixture",
        paymentReceipt: settlement.transaction,
        executionReceipt: tx,
        remainingVault: String(remaining),
        blocked: denied.triggeredRules,
      }),
    );
  } finally {
    child.kill();
    model.closeAllConnections();
    model.close();
  }
});
assert.equal(await balanceAtBlock(), before);

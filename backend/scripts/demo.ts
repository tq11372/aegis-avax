import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  parseAbi,
  parseUnits,
  type Hex,
} from "viem";
import { decodePaymentResponseHeader } from "@x402/fetch";
import { withFork } from "../src/fork.ts";
import { fuji, vaultAbi } from "../src/fuji.ts";
import { extractRevertCode } from "../src/clearance.ts";
import { seed } from "./sandbox.ts";
import { ownerPayment } from "../src/owner-intent.ts";
import { privateKeyToAccount } from "viem/accounts";
import { paidFetch } from "../../mcp-server/src/server.ts";

await withFork(async (chain, block) => {
  const { keys, agent, vault, policy, local, write } = await seed(chain);
  const backend = "http://127.0.0.1:4021";
  process.env.X402_PAY_TO = fuji.owner;
  const pay = paidFetch(keys.agent);
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../src/server.ts", import.meta.url))],
    {
      windowsHide: true,
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        PORT: "4021",
        AEGIS_REQUIRE_OWNER_INTENT: "true",
        AUDIT_REPORTER_PRIVATE_KEY: "",
        FUJI_RPC_URL: local,
        GUARD_VAULT_ADDRESS: vault,
        POLICY_MODULE_ADDRESS: policy,
        RELAYER_PRIVATE_KEY: keys.relayer,
        AEGIS_SIGNER_PRIVATE_KEY: keys.signer,
        X402_FACILITATOR_URL: "",
        X402_PAY_TO: fuji.owner,
      },
    },
  );
  const app = new Hono();
  const controls = parseAbi([
    "function txLimit() view returns (uint256)",
    "function dailyCap() view returns (uint256)",
    "function setLimits(uint256,uint256,bool)",
    "function targetWhitelist(address) view returns (bool)",
    "function setTargetAllowed(address,bool)",
  ]);
  const activeAbi = parseAbi([
    "function revokeAgent()",
    "function grantAgent(address)",
  ]);
  const state = async () => {
    const [balance, activeAgent, limit, cap, spent, partnerAllowed] =
      await Promise.all([
        chain.readContract({
          address: fuji.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [vault],
        }),
        chain.readContract({
          address: vault,
          abi: vaultAbi,
          functionName: "agent",
        }),
        chain.readContract({
          address: policy,
          abi: controls,
          functionName: "txLimit",
        }),
        chain.readContract({
          address: policy,
          abi: controls,
          functionName: "dailyCap",
        }),
        chain.readContract({
          address: vault,
          abi: vaultAbi,
          functionName: "spentInWindow",
        }),
        chain.readContract({
          address: policy,
          abi: controls,
          functionName: "targetWhitelist",
          args: [fuji.partner],
        }),
      ]);
    return {
      network: "Anvil · Fuji fork",
      block: String(block),
      vault,
      token: fuji.token,
      partner: fuji.partner,
      flagged: fuji.flagged,
      active: activeAgent === agent.address,
      balance: formatUnits(balance, 6),
      txLimit: formatUnits(limit, 6),
      dailyCap: formatUnits(cap, 6),
      spent: formatUnits(spent, 6),
      partnerAllowed,
    };
  };
  let busy = false;
  app.get("/api/demo/state", async (c) => c.json(await state()));
  app.get("/api/demo/receipt/:hash", async (c) => {
    const hash = c.req.param("hash");
    if (!/^0x[0-9a-f]{64}$/i.test(hash))
      return c.json({ error: "Invalid hash" }, 400);
    const r = await chain.getTransactionReceipt({ hash: hash as Hex });
    return c.json({
      network: "Anvil",
      hash: r.transactionHash,
      block: String(r.blockNumber),
      from: r.from,
      to: r.to,
      status: r.status,
      gasUsed: String(r.gasUsed),
    });
  });
  app.post("/api/demo/action", async (c) => {
    const origin = c.req.header("origin");
    if (
      origin &&
      !["http://127.0.0.1:3000", "http://localhost:3000"].includes(origin)
    )
      return c.json({ error: "Unknown origin" }, 403);
    if (c.req.header("x-aegis-demo") !== "local")
      return c.json({ error: "Missing local demo header" }, 403);
    if (busy) return c.json({ error: "Một thao tác đang xử lý" }, 409);
    busy = true;
    let payment: string | undefined;
    try {
      const { action, txLimit, dailyCap, partnerAllowed } = await c.req.json();
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [fuji.partner, 3000000n],
      });
      let hash: Hex | undefined, message: string;
      if (action === "pay") {
        // Fixed owner instruction, independent of any invoice or agent-supplied text.
        const head = await chain.getBlock();
        const validUntil = head.timestamp + 90n;
        const nonce = await chain.readContract({ address: vault, abi: vaultAbi, functionName: "nonce", blockNumber: head.number });
        const signature = await privateKeyToAccount(keys.relayer).signTypedData(
          ownerPayment(vault, agent.address, fuji.token, fuji.partner, 3000000n, nonce, validUntil));

        const res = await pay(
          backend + "/api/v1/agent/verify-tx",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              from: vault,
              ownerApproval: { signature, validUntil: String(validUntil) },
              to: fuji.token,
              data,
              value: "0",
              userIntent: "Chuyển 3 mUSDC đến MockPartner",
            }),
          },
        );
        const body = await res.json();
        const settled = res.headers.get("PAYMENT-RESPONSE");
        if (settled) payment = decodePaymentResponseHeader(settled).transaction;
        if (!res.ok || !body.clearance)
          return c.json(
            {
              error:
                body.error ?? body.explanationVi ?? "Clearance unavailable",
              payment,
            },
            422,
          );
        const current = await chain.getBlock();
        const currentNonce = await chain.readContract({
          address: vault, abi: vaultAbi, functionName: "nonce", blockNumber: current.number,
        });
        if (currentNonce !== BigInt(body.clearance.nonce) || current.timestamp > BigInt(body.clearance.deadline))
          return c.json({ error: "Clearance đã hết hạn hoặc nonce đã đổi. Kiểm tra biên nhận phí trước khi yêu cầu ký lại.", payment }, 409);
        hash = await write(
          vault,
          vaultAbi,
          "execute",
          [
            fuji.token,
            data,
            0n,
            BigInt(body.clearance.deadline),
            body.clearance.signature,
          ],
          agent,
        );
        message = "Đã chuyển 3 mUSDC đến MockPartner.";
      } else if (action === "mismatch") {
        const proposedAmount = parseUnits("4", 6);
        const proposal = encodeFunctionData({
          abi: erc20Abi, functionName: "transfer", args: [fuji.partner, proposedAmount],
        });
        const res = await fetch(backend + "/api/v1/web/verify-tx", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            from: vault,
            to: fuji.token,
            data: proposal,
            value: "0",
            userIntent: "Chuyển 3 mUSDC đến MockPartner",
          }),
        });
        const report = await res.json();
        if (
          !res.ok ||
          report.intentMatch !== false ||
          report.clearance !== null
        )
          throw Error("Unexpected scan result");
        message = "Bạn cho phép 3 mUSDC đến MockPartner. Hóa đơn mẫu đề xuất " +
          formatUnits(proposedAmount,6) + " mUSDC đến cùng đối tác. " + report.explanationVi;
      } else if (action === "check") {
        const head = await chain.getBlock();
        try {
          await chain.simulateContract({
            address: vault,
            account: agent.address,
            abi: vaultAbi,
            functionName: "execute",
            args: [
              fuji.token,
              data,
              0n,
              head.timestamp + 120n,
              "0x",
            ],
          });
        } catch (e) {
          const code = extractRevertCode(e);
          if (!code) throw e;
          const labels: Record<string, string> = {
            InvalidSecurityClearance:
              "Hợp đồng GuardVault đã REVERT cứng: InvalidSecurityClearance() (từ chối lệnh thiếu clearance).",
            TargetNotWhitelisted:
              "Hợp đồng PolicyModule đã REVERT cứng: TargetNotWhitelisted() (người nhận không nằm trong whitelist).",
            TxLimitExceeded:
              "Hợp đồng PolicyModule đã REVERT cứng: TxLimitExceeded() (vượt trần mỗi giao dịch).",
            DailyCapExceeded:
              "Hợp đồng PolicyModule đã REVERT cứng: DailyCapExceeded() (vượt trần 24 giờ).",
            AgentRevoked:
              "Hợp đồng GuardVault đã REVERT cứng: AgentRevoked() (session key đã bị thu hồi).",
            TokenNotWhitelisted:
              "Hợp đồng PolicyModule đã REVERT cứng: TokenNotWhitelisted() (token không được phép).",
          };
          return c.json({
            message:
              labels[code] ?? `Hợp đồng GuardVault đã REVERT cứng: ${code}().`,
            state: await state(),
          });
        }
        throw Error("Expected a revert");
      } else if (action === "kill" || action === "grant") {
        hash = await write(
          vault,
          activeAbi,
          action === "kill" ? "revokeAgent" : "grantAgent",
          action === "kill" ? [] : [agent.address],
        );
        message =
          action === "kill"
            ? "Đã thu hồi session key."
            : "Đã cấp lại session key.";
      } else if (action === "limits") {
        if (
          ![txLimit, dailyCap].every(
            (v) => typeof v === "string" && /^\d{1,9}(\.\d{1,6})?$/.test(v),
          ) ||
          Number(txLimit) <= 0 ||
          Number(dailyCap) < Number(txLimit)
        )
          return c.json(
            {
              error:
                "Hạn mức ngày phải bằng hoặc lớn hơn hạn mức mỗi giao dịch.",
            },
            400,
          );
        hash = await write(policy, controls, "setLimits", [
          parseUnits(txLimit, 6),
          parseUnits(dailyCap, 6),
          true,
        ]);
        message = "Đã cập nhật hạn mức.";
      } else if (action === "partner" && typeof partnerAllowed === "boolean") {
        hash = await write(policy, controls, "setTargetAllowed", [
          fuji.partner,
          partnerAllowed,
        ]);
        message = "Đã cập nhật quyền người nhận.";
      } else return c.json({ error: "Unknown action" }, 400);
      return c.json({ message, hash, payment, state: await state() });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Session payment budget exhausted"))
        return c.json({ error: "Đã hết ngân sách phí x402 của phiên." }, 409);
      return c.json(
        {
          payment,
          error:
            "Thao tác chưa hoàn tất. Kiểm tra quyền agent, hạn mức và dịch vụ Qwen.",
        },
        422,
      );
    } finally {
      busy = false;
    }
  });
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4022 });
  console.log("Local Anvil sandbox: http://127.0.0.1:4022/api/demo/state");
  try {
    await Promise.race([
      once(child, "exit"),
      once(server, "close"),
      once(process, "SIGINT"),
      once(process, "SIGTERM"),
    ]);
  } finally {
    child.kill();
    server.close();
  }
});

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { fuji, isSame, scanFields } from "../../backend/src/fuji.ts";

export function paidFetch(key: Hex) {
  const account = privateKeyToAccount(key);
  const network = "eip155:43113";
  const payTo = process.env.X402_PAY_TO || fuji.owner;
  const client = new x402Client().register(
    network,
    new ExactEvmScheme(account),
  );
  client.setSpendControls({
    allowedAssets: [
      { network, asset: fuji.token, maxAmountPerPayment: "5000" },
    ],
  });
  const configured = process.env.X402_SESSION_BUDGET_ATOMIC ?? "100000";
  if (!/^(0|[1-9][0-9]{0,77})$/.test(configured))
    throw Error("Invalid X402_SESSION_BUDGET_ATOMIC");
  let remaining = BigInt(configured);
  client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    const amount = BigInt(selectedRequirements.amount);
    if (amount > remaining) return { abort: true, reason: "Session payment budget exhausted" };
    // Reserve before signing, including when the downstream settlement is uncertain.
    remaining -= amount;
  });
  client.registerPolicy((version, offers) =>
    offers.filter(
      (o) =>
        version === 2 &&
        o.network === network &&
        o.scheme === "exact" &&
        o.amount === "5000" &&
        isSame(o.asset, fuji.token) &&
        isSame(o.payTo, payTo) &&
        o.extra?.name === "Aegis Mock USDC" &&
        o.extra?.version === "1",
    ),
  );
  return wrapFetchWithPayment(fetch, client);
}

export function createMcp() {
  const server = new McpServer({ name: "aegis-mcp", version: "0.1.0" });
  const payerKey = process.env.X402_PAYER_PRIVATE_KEY as Hex | undefined;
  const pay = payerKey ? paidFetch(payerKey) : undefined;
  server.registerTool(
    "simulate_and_verify_tx",
    {
      description:
        "Phân tích giao dịch Fuji, trả đúng 0,005 mUSDC mỗi lượt qua x402. Đọc kết quả và clearance khi hợp lệ.",
      inputSchema: scanFields,
    },
    async (input) => {
      if (!pay)
        return {
          isError: true,
          content: [
            { type: "text", text: "Configure X402_PAYER_PRIVATE_KEY locally." },
          ],
        };
      const endpoint = new URL(
        "/api/v1/agent/verify-tx",
        process.env.AEGIS_API_URL || "http://127.0.0.1:4021",
      );
      const res = await pay(endpoint.toString(), {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const settled = res.headers.get("PAYMENT-RESPONSE");
      const rawText = await res.text();
      let parsedResult: unknown = { raw: rawText };
      try {
        parsedResult = JSON.parse(rawText);
      } catch {
        /* Preserve raw text when server returns non-JSON error body. */
      }
      return {
        isError: !res.ok,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: res.status,
              result: parsedResult,
              payment: settled ? decodePaymentResponseHeader(settled) : null,
            }),
          },
        ],
      };
    },
  );
  return server;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await createMcp().connect(new StdioServerTransport());

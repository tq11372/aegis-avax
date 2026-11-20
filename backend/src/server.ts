import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fuji, isSame, scanSchema, type Scan } from "./fuji.ts";
import { withFork } from "./fork.ts";
import { simulate } from "./simulation.ts";
import { confirmedTransfer, reputation, review } from "./risk.ts";
import { verifyIntent } from "./intent.ts";
import { issue } from "./clearance.ts";
import { paidPath, paymentGate } from "./payments.ts";

export async function analyze(scan: Scan, paid: boolean) {
  const { sim, rules } = await withFork(async (client, block) => {
    const sim = await simulate(client, block, scan);
    const targets = await reputation(client, block, scan, sim);
    return { sim, rules: review(scan, sim, targets) };
  });
  const verdict = await verifyIntent(scan, sim, rules);
  if (paid && verdict.verifier === "unavailable")
    throw Error("Model unavailable");
  const transfer = confirmedTransfer(scan, sim);
  let clearance = null;
  if (paid && verdict.riskLevel === "SAFE" && verdict.intentMatch) {
    const intent = scan.userIntent.trim().toLowerCase();
    // Signing accepts an unambiguous amount and destination, independently of model output.
    const canonical =
      transfer &&
      [
        transfer.recipient,
        ...(isSame(transfer.recipient, fuji.partner) ? ["MockPartner"] : []),
      ].some(
        (to) =>
          intent ===
          ("Chuyển " + transfer.display + " mUSDC đến " + to).toLowerCase(),
      );
    if (transfer && canonical) clearance = await issue(scan, transfer);
    else
      return {
        ...rules,
        verifier: verdict.verifier,
        riskLevel: "MEDIUM",
        intentMatch: false,
        explanationVi:
          "Lệnh chưa khớp mẫu chuyển mUSDC của két với đúng số tiền và người nhận.",
        simulation: sim,
        clearance: null,
      };
  }
  return { ...rules, ...verdict, simulation: sim, clearance };
}

export function createApp(gate = paymentGate(), analyzeTx = analyze) {
  const app = new Hono();
  let running = 0;
  app.use("*", bodyLimit({ maxSize: 32768 }));
  app.get("/health", (c) => c.json({ chainId: 43113 }));
  app.use(paidPath, async (c, next) => {
    if (
      c.req.header("PAYMENT-SIGNATURE") &&
      !process.env.RELAYER_PRIVATE_KEY &&
      !process.env.X402_FACILITATOR_URL
    )
      return c.json({ error: "Facilitator not configured" }, 503);
    await next();
  });
  app.use(paidPath, gate);
  for (const [path, paid] of [
    ["/api/v1/web/verify-tx", false],
    [paidPath, true],
  ] as const) {
    app.post(path, async (c) => {
      const parsed = scanSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success)
        return c.json(
          {
            error: "Invalid transaction input",
            fields: parsed.error.issues.map((i) => i.path.join(".")),
          },
          400,
        );
      if (running >= 3) return c.json({ error: "Simulator busy" }, 429);
      running++;
      try {
        return c.json(await analyzeTx(parsed.data, paid));
      } catch {
        return c.json(
          {
            error:
              "Không thể hoàn tất phân tích hoặc cấp chữ ký. Kiểm tra Anvil, RPC, policy và cấu hình dịch vụ.",
          },
          503,
        );
      } finally {
        running--;
      }
    });
  }
  return app;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const port = Number(process.env.PORT || 4021);
  serve({ fetch: createApp().fetch, port, hostname: "127.0.0.1" });
  console.log("Aegis backend listening on http://127.0.0.1:" + port);
}

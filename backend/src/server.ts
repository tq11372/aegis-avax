import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fuji, scanSchema, type Scan } from "./fuji.ts";
import { withFork } from "./fork.ts";
import { simulate } from "./simulation.ts";
import { confirmedTransfer, reputation, review } from "./risk.ts";
import { matchesTransferIntent, verifyIntent } from "./intent.ts";
import { issue, PolicyRejectionError } from "./clearance.ts";
import { paidPath, paymentGate } from "./payments.ts";
import { createAuditSink } from "./audit.ts";

export async function analyze(scan: Scan, paid: boolean) {
  const { sim, rules, targets } = await withFork(async (client, block) => {
    const sim = await simulate(client, block, scan);
    const targets = await reputation(client, block, scan, sim);
    return { sim, rules: review(scan, sim, targets), targets };
  });
  const verdict = await verifyIntent(scan, sim, rules, targets);
  if (paid && verdict.verifier === "unavailable")
    throw Error("Model unavailable");
  const transfer = confirmedTransfer(scan, sim);
  let clearance = null;
  if (paid && verdict.riskLevel === "SAFE" && verdict.intentMatch) {
    // Signing requires an unambiguous amount and destination match, independent of model output.
    const confirmed = transfer && matchesTransferIntent(scan.userIntent, transfer);
    if (transfer && confirmed) clearance = await issue(scan, transfer);
    else
      return {
        ...rules,
        verifier: verdict.verifier,
        riskLevel: "MEDIUM" as const,
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
  const audit = createAuditSink(process.env);
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
        const report = await analyzeTx(parsed.data, paid);
        if (report.verifier !== "unavailable") audit(parsed.data, report);
        return c.json(report);
      } catch (err) {
        if (err instanceof PolicyRejectionError) {
          return c.json(
            {
              error: err.message,
              revertReason: err.code,
            },
            422,
          );
        }
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

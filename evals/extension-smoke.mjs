import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const extension = fileURLToPath(new URL("../extension", import.meta.url));
const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [
    "--disable-extensions-except=" + extension,
    "--load-extension=" + extension,
  ],
});
try {
  const worker =
    ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:3000");
  const select = page.getByLabel("Kịch bản mẫu");
  await select.selectOption("1");
  const input = await page.getByLabel("Calldata").inputValue();
  const from = await page.getByLabel("Ví gửi", { exact: true }).inputValue();
  const to = await page.getByLabel("Hợp đồng đích").inputValue();
  await page.getByRole("button", { name: "Mô phỏng giao dịch" }).click();
  await page
    .locator("[data-aegis-shield]")
    .getByRole("status")
    .filter({ hasText: "CRITICAL" })
    .waitFor({ timeout: 90000 });
  await select.selectOption("0");
  await page.getByRole("button", { name: "Mô phỏng giao dịch" }).click();
  await page
    .locator("[data-aegis-shield]")
    .getByRole("status")
    .filter({ hasText: "SAFE" })
    .waitFor({ timeout: 100000 });
  const popup = await ctx.newPage();
  await popup.goto("chrome-extension://" + extensionId + "/popup.html");
  await popup.getByLabel("Giao dịch cần mô phỏng (JSON)").fill(
    JSON.stringify({
      from,
      to,
      data: input,
      value: "0",
      userIntent: "Chuyển 3 mUSDC đến MockPartner",
    }),
  );
  await popup.getByRole("button", { name: "Kiểm tra giao dịch" }).click();
  await popup
    .locator("#result[data-level='CRITICAL']")
    .waitFor({ timeout: 90000 });
  const domain = await popup.evaluate(
    async () =>
      await chrome.runtime.sendMessage({
        action: "domain",
        url: "https://example.org",
      }),
  );
  assert.ifError(domain.error ? Error(domain.error) : null);
  assert.match(domain.value, /Chưa thấy/);
  // Use a hostname from the downloaded list without navigating to that site.
  const recorded = await worker.evaluate(async () => {
    const cache = await caches.open("aegis-domain-list-v1");
    const [request] = await cache.keys();
    const lists = request
      ? await cache.match(request)
      : new Response(
          (
            await fetch(chrome.runtime.getURL("data/metamask.json.gz"))
          ).body.pipeThrough(new DecompressionStream("gzip")),
        );
    const { blacklist, whitelist } = await lists.json();
    return blacklist.find(
      (name) =>
        /^[a-z0-9-]+\.[a-z0-9.-]+$/i.test(name) && !whitelist.includes(name),
    );
  });
  assert.ok(recorded);
  const blocked = await popup.evaluate(
    async (name) =>
      await chrome.runtime.sendMessage({
        action: "domain",
        url: "https://" + name,
      }),
    recorded,
  );
  assert.match(blocked.value, /CẢNH BÁO/);
  console.log(
    "MV3 passed: real overlay SAFE/CRITICAL, popup CRITICAL and local domain checks against the MetaMask feed.",
  );
} finally {
  await ctx.close();
}

import assert from "node:assert/strict";
import { chromium } from "playwright";

const address = process.argv[2];
if (!address)
  throw Error("Pass the public app URL or the local static preview URL.");
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(address, { waitUntil: "domcontentloaded" });
    await page
      .getByText("Đã đọc Fuji", { exact: true })
      .waitFor({ timeout: 60000 });
    assert.ok(Number(await page.locator("#block").textContent()) > 0);
    await page.getByRole("button", { name: "Kiểm tra trên Fuji" }).click();
    await page
      .getByText("Qua kiểm tra policy và token", { exact: true })
      .waitFor({ timeout: 60000 });
    await page.locator("#approved").fill("2");
    await page.locator("#check").click();
    await page
      .getByText("Lệch số tiền trong lệnh gốc", { exact: true })
      .waitFor({ timeout: 60000 });
    await page.locator("#approved").fill("1");
    await page.locator("#recipient").selectOption("flagged");
    await page.locator("#check").click();
    await page.getByText(/TargetNotWhitelisted/).waitFor({ timeout: 60000 });
    await page.locator("#verify").click();
    await page
      .locator("#receipt-status")
      .getByText(/61430093.*61430094/)
      .waitFor({ timeout: 60000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "Verified live Fuji state, accepted and rejected requests, two receipts at width",
      width,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

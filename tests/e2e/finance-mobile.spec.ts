import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Read-only checks. Provide a local minted session; never log its contents.
const sessionPath = process.env.FINANCE_MOBILE_SESSION_FILE;
test.skip(!sessionPath, "Requires an authenticated local test session");
test.use({ viewport: { width: 392, height: 852 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  if (!sessionPath) return;
  const auth = JSON.parse(readFileSync(sessionPath, "utf8"));
  await page.goto("/");
  await page.evaluate(({ storage_key, session }) => {
    localStorage.setItem(storage_key, JSON.stringify(session));
  }, auth);
});

test("existing delivery note opens its complete print document", async ({ page }) => {
  await page.goto("/delivery-notes");
  const print = page.getByRole("button", { name: "طباعة", exact: true }).first();
  await expect(print).toBeVisible();
  await print.click();
  await expect(page.frameLocator("#__react_print_iframe__").locator("body")).toContainText(/DN-2026-/);
});

test("invoice table can scroll to columns beyond the phone viewport", async ({ page }) => {
  await page.goto("/invoices?type=sales");
  await page.getByRole("button", { name: "جدول", exact: true }).click();
  const table = page.locator(".shared-table-scroll").first();
  await expect(table).toBeVisible();
  const offset = await table.evaluate((element) => {
    element.scrollLeft = -300;
    return element.scrollLeft;
  });
  expect(offset).toBeLessThan(-100);
});

for (const [name, path] of [["receipt", "/finance/receipt/new"], ["payment", "/finance/payment/new"]]) {
  test(`${name} commands remain available from mobile actions`, async ({ page }) => {
    await page.goto(path);
    await page.getByTestId("mobile-actions-trigger").click();
    for (const command of ["new", "draft", "post", "preview", "print", "prev", "next", "inquiry", "center"]) {
      await expect(page.getByTestId(`action-${command}`)).toBeVisible();
    }
  });
}
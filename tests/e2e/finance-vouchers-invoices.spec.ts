import { test, expect, Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

if (!EMAIL || !PASSWORD) {
  throw new Error("Missing E2E_EMAIL / E2E_PASSWORD env vars (see .env.e2e.local)");
}

async function login(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 }),
    page.locator('form button[type="submit"]').first().click(),
  ]);
}

/**
 * Read-only E2E coverage of Receipt / Payment / Invoice forms.
 * Verifies the shared VoucherNavToolbar (new, prev/next, search, duplicate)
 * works on all three pages without writing any data.
 */
test.describe("Finance — Receipt / Payment / Invoice toolbar (real E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const cases = [
    {
      name: "Receipt",
      newPath: "/finance/receipt/new",
      editUrlRegex: /\/finance\/receipt\/[0-9a-f-]+\/edit/,
    },
    {
      name: "Payment",
      newPath: "/finance/payment/new",
      editUrlRegex: /\/finance\/payment\/[0-9a-f-]+\/edit/,
    },
    {
      name: "Invoice",
      newPath: "/invoices/new",
      editUrlRegex: /\/invoices\/new\?edit=/,
    },
  ];

  for (const c of cases) {
    test(`${c.name}: toolbar loads with New + Search buttons`, async ({ page }) => {
      await page.goto(c.newPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("voucher-nav-new")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("voucher-nav-search")).toBeVisible();
      // On a fresh "new" page there is no current ref => no delete / duplicate yet.
      await expect(page.getByTestId("voucher-nav-delete")).toHaveCount(0);
      await expect(page.getByTestId("voucher-nav-duplicate")).toHaveCount(0);
    });

    test(`${c.name}: prev navigates to an existing voucher on same shell`, async ({ page }) => {
      await page.goto(c.newPath, { waitUntil: "domcontentloaded" });
      const prev = page.getByTestId("voucher-nav-prev");
      // Skip gracefully if the account has no prior vouchers of this kind.
      if (!(await prev.isVisible().catch(() => false))) {
        test.skip(true, `no existing ${c.name} vouchers on this account`);
      }
      await prev.click();
      await page.waitForURL(c.editUrlRegex, { timeout: 20_000 });
      // No popup/modal swallowed the action.
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
      // Counter "x/y" should now be visible on the toolbar.
      await expect(page.getByTestId("voucher-nav-counter")).toBeVisible();
      // Once we're on an existing voucher, duplicate + delete buttons appear.
      await expect(page.getByTestId("voucher-nav-duplicate")).toBeVisible();
      await expect(page.getByTestId("voucher-nav-delete")).toBeVisible();
    });

    test(`${c.name}: search dialog opens and closes`, async ({ page }) => {
      await page.goto(c.newPath, { waitUntil: "domcontentloaded" });
      await page.getByTestId("voucher-nav-search").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText("استعلام عن سند")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });
  }
});
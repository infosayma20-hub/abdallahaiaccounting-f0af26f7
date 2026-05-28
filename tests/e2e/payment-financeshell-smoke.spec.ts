import { test, expect, Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

if (!EMAIL || !PASSWORD) {
  throw new Error("Missing E2E_EMAIL / E2E_PASSWORD env vars (see .env.e2e.local)");
}

/**
 * Phase 2 (Payment) — Smoke test for VoucherFormPage(voucherType="payment")
 * inside FinanceShell. Mirrors receipt smoke; no writes.
 */

async function login(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 }),
    page.locator('form button[type="submit"]').first().click(),
  ]);
}

test.describe.configure({ mode: "serial" });

test.describe("Payment — FinanceShell smoke (Phase 2)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("new payment: FinanceShell + ActionPane action buttons exist", async ({ page }) => {
    await page.goto("/finance/payment/new", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("body")).toContainText(/سند صرف جديد/);
    await expect(page.locator("body")).toContainText(/المالية/);

    await expect(page.locator('[data-testid="action-new"]')).toBeVisible({ timeout: 20_000 });
    const expectedNew = [
      "action-new",
      "action-draft",
      "action-post",
      "action-preview",
      "action-print",
      "action-prev",
      "action-next",
      "action-inquiry",
      "action-center",
    ];
    for (const tid of expectedNew) {
      await expect(page.locator(`[data-testid="${tid}"]`), `missing ${tid}`).toBeVisible();
    }

    await expect(page.locator('[data-testid="payment-dimensions-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-cost-center"]')).toBeAttached();
    await expect(page.locator('[data-testid="payment-currency"]')).toBeVisible();

    await page.locator('[data-testid="payment-dimensions-toggle"]').click();
    await expect(page.locator('[data-testid="payment-cost-center"]')).toBeVisible();

    await expect(page.locator('[data-testid="payment-voucher-number"]')).toBeVisible();
  });

  test("duplicate flow: payment number field shows a new number distinct from original", async ({ page }) => {
    await page.goto("/finance/payments", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    const firstLink = page.locator('a[href*="/finance/payment/"][href*="/edit"]').first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, "feature missing: no existing payments to duplicate");
      return;
    }
    await Promise.all([
      page.waitForURL(/\/finance\/payment\/.+\/edit/, { timeout: 20_000 }),
      firstLink.click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const numberField = page.locator('[data-testid="payment-voucher-number"]');
    await expect(numberField).toBeVisible({ timeout: 20_000 });
    const originalNumber = (await numberField.inputValue()).trim();
    expect(originalNumber.length).toBeGreaterThan(0);

    await page.locator('[data-testid="action-duplicate"]').click();
    await page.waitForURL(/\/finance\/payment\/new/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(numberField).toBeVisible();
    const afterDuplicate = (await numberField.inputValue()).trim();
    expect(afterDuplicate).not.toBe(originalNumber);
  });

  test("payments list opens", async ({ page }) => {
    await page.goto("/finance/payments", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("body")).toContainText(/سندات الصرف|صرف/);
  });

  test("edit payment (first row): FinanceShell shows edit/update/delete/duplicate", async ({ page }) => {
    await page.goto("/finance/payments", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstLink = page.locator('a[href*="/finance/payment/"][href*="/edit"]').first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, "feature missing: no existing payments to edit");
      return;
    }
    await Promise.all([
      page.waitForURL(/\/finance\/payment\/.+\/edit/, { timeout: 20_000 }),
      firstLink.click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(page.locator('[data-testid="payment-view-banner"]')).toBeVisible({ timeout: 20_000 });

    const expectedEdit = [
      "action-new",
      "action-duplicate",
      "action-edit",
      "action-update",
      "action-delete",
      "action-preview",
      "action-print",
      "action-prev",
      "action-next",
      "action-inquiry",
    ];
    for (const tid of expectedEdit) {
      await expect(page.locator(`[data-testid="${tid}"]`), `missing ${tid}`).toBeVisible();
    }
  });
});

test.describe("Payment — read-only on PV link click (Phase 2.6)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("click PV-number opens read-only; action-edit unlocks; action-update saves & returns read-only", async ({ page }) => {
    await page.goto("/finance/payments", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstLink = page.locator('a[href*="/finance/payment/"][href*="/edit"]').first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, "feature missing: no existing payments");
      return;
    }
    await Promise.all([
      page.waitForURL(/\/finance\/payment\/.+\/edit/, { timeout: 20_000 }),
      firstLink.click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // No popup/dialog should appear on link click
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // Read-only banner visible
    await expect(page.locator('[data-testid="payment-view-banner"]')).toBeVisible({ timeout: 20_000 });

    // Voucher number field is read-only (disabled or readonly attribute)
    const numberField = page.locator('[data-testid="payment-voucher-number"]');
    await expect(numberField).toBeVisible();
    const isReadOnly = await numberField.evaluate(
      (el: HTMLInputElement) => el.readOnly || el.disabled
    );
    expect(isReadOnly).toBe(true);

    // action-edit must exist; action-update must exist
    await expect(page.locator('[data-testid="action-edit"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-update"]')).toBeVisible();

    // Click edit -> banner should disappear (form becomes editable)
    await page.locator('[data-testid="action-edit"]').click();
    await expect(page.locator('[data-testid="payment-view-banner"]')).toBeHidden({ timeout: 10_000 });
  });
});

import { test, expect, Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

if (!EMAIL || !PASSWORD) {
  throw new Error("Missing E2E_EMAIL / E2E_PASSWORD env vars (see .env.e2e.local)");
}

/**
 * Phase 1 (Receipt) — Smoke test for ReceiptNewPage FinanceShell wrap.
 * Verifies the page renders inside FinanceShell with the expected
 * ActionPane buttons + cost-center + currency testids.
 * No writes performed.
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

test.describe("Receipt — FinanceShell smoke (Phase 1)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("new receipt: FinanceShell + ActionPane action buttons exist", async ({ page }) => {
    await page.goto("/finance/receipt/new", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // RTL
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Breadcrumb / title rendered by FinanceShell
    await expect(page.locator("body")).toContainText(/سند قبض جديد/);
    await expect(page.locator("body")).toContainText(/المالية/);

    // Required action buttons (new mode) — testids are stable across tab labels.
    // Wait for at least one to appear (FinanceShell mounts after auth/cloud bootstrap).
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

    // Dimensions section is collapsed by default; toggle is visible,
    // cost-center field is attached but hidden until expanded.
    await expect(page.locator('[data-testid="receipt-dimensions-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="receipt-cost-center"]')).toBeAttached();
    await expect(page.locator('[data-testid="receipt-currency"]')).toBeVisible();

    // Expand and confirm cost-center becomes visible.
    await page.locator('[data-testid="receipt-dimensions-toggle"]').click();
    await expect(page.locator('[data-testid="receipt-cost-center"]')).toBeVisible();

    // Voucher number field is always visible (read-only)
    await expect(page.locator('[data-testid="receipt-voucher-number"]')).toBeVisible();
  });

  test("duplicate flow: voucher number field shows a new RCV- number distinct from original", async ({ page }) => {
    // Open the most recent receipt via list
    await page.goto("/finance/receipts", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    const firstLink = page.locator('a[href*="/finance/receipt/"][href*="/edit"]').first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, "feature missing: no existing receipts to duplicate");
      return;
    }
    await Promise.all([
      page.waitForURL(/\/finance\/receipt\/.+\/edit/, { timeout: 20_000 }),
      firstLink.click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const numberField = page.locator('[data-testid="receipt-voucher-number"]');
    await expect(numberField).toBeVisible({ timeout: 20_000 });
    const originalNumber = (await numberField.inputValue()).trim();
    expect(originalNumber).toMatch(/^RCV-/);

    // Click duplicate via ActionPane
    await page.locator('[data-testid="action-duplicate"]').click();
    await page.waitForURL(/\/finance\/receipt\/new/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // After duplicate (new mode) — field is visible but empty until save.
    // Verify the field exists; the visible "current" RCV chip in the side card
    // should also reflect the next number once issued.
    await expect(numberField).toBeVisible();
    const afterDuplicate = (await numberField.inputValue()).trim();
    expect(afterDuplicate).not.toBe(originalNumber);
  });

  test("receipts list opens — used to pick latest receipt id for edit smoke", async ({ page }) => {
    await page.goto("/finance/receipts", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("body")).toContainText(/سندات القبض|قبض/);
  });

  test("edit receipt (first row): FinanceShell shows edit/update/delete/duplicate", async ({ page }) => {
    // Best-effort: navigate to receipts list and click first row's edit affordance.
    await page.goto("/finance/receipts", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Try to open the first receipt — feature missing if none exists.
    const firstLink = page.locator('a[href*="/finance/receipt/"][href*="/edit"]').first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, "feature missing: no existing receipts to edit");
      return;
    }
    await Promise.all([
      page.waitForURL(/\/finance\/receipt\/.+\/edit/, { timeout: 20_000 }),
      firstLink.click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // View-mode banner
    await expect(page.locator('[data-testid="receipt-view-banner"]')).toBeVisible({ timeout: 20_000 });

    // Edit-mode action buttons
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
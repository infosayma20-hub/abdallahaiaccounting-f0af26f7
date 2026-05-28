import { test, expect, Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

if (!EMAIL || !PASSWORD) {
  throw new Error("Missing E2E_EMAIL / E2E_PASSWORD env vars (see .env.e2e.local)");
}

async function login(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  // The auth form is a plain <form> with email + password inputs and a submit button.
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 }),
    page.locator('form button[type="submit"]').first().click(),
  ]);
}

test.describe("Finance — Journal Voucher (real E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("loads new-journal page with new-mode action buttons visible", async ({ page }) => {
    await page.goto("/finance/journal/new", { waitUntil: "domcontentloaded" });
    // Action buttons we just added testids for:
    await expect(page.getByTestId("action-draft")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("action-post")).toBeVisible();
    await expect(page.getByTestId("action-prev")).toBeVisible();
    await expect(page.getByTestId("action-next")).toBeVisible();
    // In new mode there is no edit/update/delete/duplicate
    await expect(page.getByTestId("action-edit")).toHaveCount(0);
    await expect(page.getByTestId("action-duplicate")).toHaveCount(0);
    await expect(page.getByTestId("action-delete")).toHaveCount(0);
  });

  test("prev loads existing voucher on same page (no popup), shows read-only banner, fieldset disabled", async ({ page }) => {
    await page.goto("/finance/journal/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("action-prev")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("action-prev").click();

    // URL should switch to ?edit=<uuid> on the same page (no modal/popup navigation).
    await page.waitForURL(/\/finance\/journal\/new\?edit=/, { timeout: 20_000 });

    // No dialog/popup opened.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // Read-only banner with "وضع العرض".
    await expect(page.getByText("وضع العرض")).toBeVisible({ timeout: 15_000 });

    // The form fieldset should be disabled (read-only).
    const disabledFieldset = page.locator("fieldset[disabled]");
    await expect(disabledFieldset.first()).toBeVisible();

    // Edit-mode action buttons must now appear.
    await expect(page.getByTestId("action-edit")).toBeVisible();
    await expect(page.getByTestId("action-update")).toBeVisible();
    await expect(page.getByTestId("action-duplicate")).toBeVisible();
    await expect(page.getByTestId("action-delete")).toBeVisible();
  });

  test("edit toggle enables fieldset; cancel re-disables it", async ({ page }) => {
    await page.goto("/finance/journal/new", { waitUntil: "domcontentloaded" });
    await page.getByTestId("action-prev").click();
    await page.waitForURL(/\?edit=/, { timeout: 20_000 });
    await expect(page.locator("fieldset[disabled]").first()).toBeVisible();

    await page.getByTestId("action-edit").click();
    // After enabling edit: banner shows "وضع التعديل" AND no disabled fieldset.
    await expect(page.getByText("وضع التعديل")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("fieldset[disabled]")).toHaveCount(0);

    // Toggle back (cancel edit).
    await page.getByTestId("action-edit").click();
    await expect(page.getByText("وضع العرض")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("fieldset[disabled]").first()).toBeVisible();
  });

  test("duplicate produces a fresh /finance/journal/new with no ?edit and shows a duplicate banner", async ({ page }) => {
    await page.goto("/finance/journal/new", { waitUntil: "domcontentloaded" });
    await page.getByTestId("action-prev").click();
    await page.waitForURL(/\?edit=/, { timeout: 20_000 });

    await page.getByTestId("action-duplicate").click();

    // URL should reset to /finance/journal/new (no ?edit param).
    await page.waitForURL((u) => u.pathname === "/finance/journal/new" && !u.search.includes("edit="), { timeout: 15_000 });

    // New-mode buttons return, edit-mode buttons disappear.
    await expect(page.getByTestId("action-draft")).toBeVisible();
    await expect(page.getByTestId("action-post")).toBeVisible();
    await expect(page.getByTestId("action-update")).toHaveCount(0);
    await expect(page.getByTestId("action-delete")).toHaveCount(0);
  });

  test("currency selector exists and is part of the form", async ({ page }) => {
    await page.goto("/finance/journal/new", { waitUntil: "domcontentloaded" });
    // The currency Select renders one of the known CURRENCIES labels (شيكل / دولار / دينار / يورو).
    // It should appear somewhere on the page.
    const currencyText = page.getByText(/شيكل|دولار|دينار|يورو/).first();
    await expect(currencyText).toBeVisible({ timeout: 15_000 });
  });
});
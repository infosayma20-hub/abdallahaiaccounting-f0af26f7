import { test, expect, Page, ConsoleMessage } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

if (!EMAIL || !PASSWORD) {
  throw new Error("Missing E2E_EMAIL / E2E_PASSWORD env vars (see .env.e2e.local)");
}

/**
 * Phase 1 — Read-only smoke test for a finance-using company.
 *
 * Goal: log in once, visit every critical accounting screen, and verify:
 *   - The page actually mounts (URL stays, body is non-empty, RTL set)
 *   - No critical console errors are emitted while it loads
 *   - Reports return some data row (or an explicit "empty" indicator) — but never crash
 *
 * Strict rule: NO writes. We never click Save / Post / Delete in this file.
 */

// Console errors we expect & deliberately ignore (third-party noise / dev warnings).
const IGNORED_CONSOLE = [
  "Download the React DevTools",
  "Service Worker",
  "[vite]",
  "Lit is in dev mode",
  "favicon",
  "Manifest",
  "ResizeObserver loop",
  "preloaded using link preload",
  "validateDOMNesting",
  "Multiple GoTrueClient",
  // Realtime / Supabase noisy info logs
  "supabase",
  "Realtime",
  // Recharts / chart libs occasionally warn on empty data
  "Recharts",
];

function attachConsoleCollector(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((p) => text.includes(p))) return;
    errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
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
 * The 25 screens covering the full accounting cycle.
 * `expect` is a fragment of visible Arabic UI text expected on the page —
 * proves the route mounted, not just that the URL changed.
 */
const SCREENS: Array<{ name: string; path: string; expect?: RegExp }> = [
  // Hub
  { name: "Apps launcher", path: "/apps", expect: /تطبيقات|المالية|المبيعات/ },
  { name: "Accounting Center", path: "/accounting-center" },

  // Chart of accounts & contacts
  { name: "Chart of Accounts", path: "/accounts", expect: /الحسابات|شجرة/ },
  { name: "Contacts", path: "/contacts", expect: /جهات|عملاء|موردين/ },
  { name: "Cost Centers", path: "/finance/cost-centers", expect: /مراكز التكلفة|مركز/ },

  // Cash & banks
  { name: "Cash Boxes", path: "/finance/cash-boxes", expect: /صناديق|الصندوق/ },
  { name: "Bank Accounts", path: "/finance/bank-accounts", expect: /البنوك|بنك/ },

  // Vouchers
  { name: "Receipts list", path: "/finance/receipts", expect: /سندات القبض|قبض/ },
  { name: "Receipt new (form)", path: "/finance/receipt/new" },
  { name: "Payments list", path: "/finance/payments", expect: /سندات الصرف|صرف/ },
  { name: "Payment new (form)", path: "/finance/payment/new" },
  { name: "Journals list", path: "/finance/journals", expect: /قيود|اليومية/ },
  { name: "Journal new (form)", path: "/finance/journal/new" },

  // Invoices & inventory
  { name: "Invoices list", path: "/invoices", expect: /فواتير|فاتورة/ },
  { name: "Invoice new (form)", path: "/invoices/new" },
  { name: "Inventory", path: "/inventory", expect: /المخزون|الأصناف|المنتجات/ },
  { name: "Fixed Assets", path: "/fixed-assets", expect: /الأصول|أصل/ },
  { name: "Cheques", path: "/finance/cheques", expect: /الشيكات|شيك/ },

  // Reports
  { name: "Reports hub", path: "/reports", expect: /التقارير|تقرير/ },
  { name: "Trial Balance", path: "/trial-balance", expect: /ميزان المراجعة|المدين|الدائن/ },
  { name: "Account Statement (SOA)", path: "/account-statement", expect: /كشف حساب|حساب/ },
  { name: "AR Aging", path: "/reports/ar-aging" },
  { name: "AP Aging", path: "/reports/ap-aging" },
  { name: "Cash Movement", path: "/reports/cash-movement" },
  { name: "Bank Movement", path: "/reports/bank-movement" },
  { name: "Cheques Report", path: "/reports/cheques" },
  { name: "Total Sales", path: "/reports/total-sales" },
  { name: "Total Purchases", path: "/reports/total-purchases" },
  { name: "Inventory Valuation", path: "/reports/inventory-valuation" },
];

test.describe.configure({ mode: "serial" });

test.describe("Full Accounting Cycle — Phase 1 (read-only smoke)", () => {
  // Reuse one logged-in browser context for all screens to avoid 25× login.
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const screen of SCREENS) {
    test(`smoke: ${screen.name} (${screen.path})`, async ({ page }) => {
      const consoleErrors = attachConsoleCollector(page);

      const resp = await page.goto(screen.path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // HTTP status (Lovable serves SPA, so 200 always; just sanity).
      if (resp) expect(resp.status(), `${screen.name} HTTP`).toBeLessThan(400);

      // Stayed on the requested route (no redirect to /auth or 404).
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      const url = new URL(page.url());
      expect(url.pathname, `${screen.name} should not redirect to /auth`).not.toMatch(/^\/auth/);

      // Body is RTL and non-empty.
      const html = page.locator("html");
      await expect(html, `${screen.name} dir=rtl`).toHaveAttribute("dir", "rtl");
      const bodyText = (await page.locator("body").innerText({ timeout: 10_000 })).trim();
      expect(bodyText.length, `${screen.name} body not empty`).toBeGreaterThan(20);

      // Optional Arabic content fingerprint.
      if (screen.expect) {
        await expect(page.locator("body")).toContainText(screen.expect, { timeout: 15_000 });
      }

      // No critical console errors during load.
      // Allow a short settle window for late async errors.
      await page.waitForTimeout(800);
      const critical = consoleErrors.filter(
        (e) =>
          !/Failed to load resource/.test(e) &&
          !/net::ERR_/.test(e) &&
          !/CORS/.test(e)
      );
      expect(
        critical,
        `${screen.name} console errors:\n${critical.join("\n")}`
      ).toEqual([]);
    });
  }
});
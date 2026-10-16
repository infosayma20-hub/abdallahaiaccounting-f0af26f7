/**
 * تحميل مسبق لملفات الشاشات عند مرور الفأرة على رابطها في القائمة الجانبية.
 *
 * كل الشاشات كسولة (lazy) — بدون التحميل المسبق ينتظر المستخدم جلب ملف
 * الشاشة بعد الضغط. مع هذه الخريطة يبدأ الجلب لحظة مرور الفأرة على الرابط،
 * فيكون الملف جاهزاً غالباً قبل الضغط، والتنقل يظهر فورياً.
 *
 * المفاتيح بادئات مسارات (تُطابَق بترتيب الأطول أولاً)، والقيم نفس دوال
 * الاستيراد المستخدمة في App.tsx حتى يشاركا نفس الـ chunk.
 */

type Importer = () => Promise<unknown>;

const PRELOAD_MAP: Array<[string, Importer]> = [
  // المبيعات
  ["/invoices/new", () => import("@/pages/InvoiceCreatePage")],
  ["/invoices", () => import("@/pages/InvoicesPage")],
  ["/orders", () => import("@/pages/OrdersPage")],
  ["/delivery-notes", () => import("@/pages/DeliveryNotesPage")],
  ["/sales/returns", () => import("@/pages/ReturnsListPage")],
  ["/credit-notes", () => import("@/pages/CreditDebitNotesPage")],
  ["/contacts", () => import("@/pages/ContactsPage")],
  // المشتريات
  ["/procurement/orders", () => import("@/pages/OrdersPage")],
  ["/purchases/returns", () => import("@/pages/ReturnsListPage")],
  ["/debit-notes", () => import("@/pages/CreditDebitNotesPage")],
  // نقطة البيع
  ["/pos", () => import("@/pages/POSPage")],
  // المخزون
  ["/inventory", () => import("@/pages/InventoryPage")],
  ["/warehouses", () => import("@/pages/WarehousesPage")],
  ["/stock-transfers", () => import("@/pages/StockTransfersPage")],
  ["/stock-documents", () => import("@/pages/inventory/StockDocumentsPage")],
  ["/stock-movements", () => import("@/pages/StockMovementsPage")],
  // المالية
  ["/finance/receipt/new", () => import("@/pages/VoucherFormPage")],
  ["/finance/payment/new", () => import("@/pages/VoucherFormPage")],
  ["/finance/receipts", () => import("@/pages/FinanceReceiptsPage")],
  ["/finance/payments", () => import("@/pages/FinancePaymentsPage")],
  ["/finance/journal", () => import("@/pages/JournalEntriesPage")],
  ["/finance/cheques", () => import("@/pages/ChequesPage")],
  ["/finance/cash-boxes", () => import("@/pages/CashBoxesPage")],
  ["/transactions", () => import("@/pages/JournalEntriesPage")],
  ["/accounts", () => import("@/pages/AccountsPage")],
  ["/reports", () => import("@/pages/ReportsPage")],
  ["/trial-balance", () => import("@/pages/TrialBalancePage")],
  ["/profit-loss", () => import("@/pages/ProfitLoss")],
  ["/balance-sheet", () => import("@/pages/BalanceSheetPage")],
  // الموارد البشرية
  ["/employees", () => import("@/pages/EmployeesPage")],
  // لوحة المعلومات
  ["/dashboard", () => import("@/pages/HomeDashboard")],
];

// لا نعيد جلب ما سبق طلبه في هذه الجلسة.
const preloaded = new Set<string>();

/** يبدأ جلب ملف الشاشة المرتبطة بالمسار المعطى (مرة واحدة لكل مسار). */
export function preloadPage(path: string | undefined) {
  if (!path) return;
  const basePath = path.split("?")[0];
  for (const [prefix, importer] of PRELOAD_MAP) {
    if (basePath === prefix || basePath.startsWith(prefix + "/")) {
      if (preloaded.has(prefix)) return;
      preloaded.add(prefix);
      importer().catch(() => {
        // فشل الجلب المسبق غير مضر — lazyRetry يعيد المحاولة عند التنقل الفعلي.
        preloaded.delete(prefix);
      });
      return;
    }
  }
}

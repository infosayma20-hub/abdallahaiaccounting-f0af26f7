import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth } from "date-fns";
import { ArrowRight, Printer, CalendarDays, FileSpreadsheet, Search } from "lucide-react";
import SortableReportTable, { ColumnDef, TotalsConfig } from "@/components/reports/SortableReportTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import { reportConfigs, fmtAmt, fmtNum, fmtAmtCell } from "@/lib/reports/report-helpers";
import { exportToExcel } from "@/lib/reports/report-export";
import { getPOSKPIs } from "@/lib/reports/report-kpis";
import {
  loadAgingReport, loadCashFlowReport, loadAccountMovement, loadChequesReport,
  loadTotalSales, loadDailySalesReport, loadInvoiceRegister, loadByCustomer,
  loadCollections, loadSalesReturns, loadSalesPerformance, loadSalesByProductReport,
  loadDeadStockReport, loadProductProfitability, loadFinancialKPIs, loadMonthComparison,
  loadForeignBalances, loadTotalPurchases, loadPurchaseInvoiceRegister, loadBySupplier,
  loadSupplierPayments, loadPurchaseReturns, loadSupplierComparison, loadInventoryValuation,
  loadStockMovement, loadBelowReorder, loadEmployeeDirectory, loadEmployeeWithdrawals, loadAssetRegister,
  loadMonthlyDepreciation, loadDepreciationSchedule, loadFullyDepreciated, loadAssetDisposal,
  loadAssetsByLocation, loadExchangeRates, loadCurrencyConversions, loadExchangeGainLoss,
  loadAllOrders, loadGenericTransactions,
  loadPurchasesByProduct, loadInventoryReconciliation, loadProductCard,
} from "@/lib/reports/report-loaders";
import {
  loadPOSDailySales, loadPOSCashReconciliation, loadPOSCashierPerformance,
  loadPOSCancelled, loadPOSPeakHours, loadPOSSalesByCategory, loadPOSPeriodComparison,
  loadPOSInvoiceRegister, loadPOSPendingOrders, loadPOSShiftOpenClose,
  loadPOSPaymentMethods, loadPOSProductMovement, loadPOSCategoryTotals,
  loadPOSInvoiceTiming, loadPOSCreditSales,
} from "@/lib/reports/pos-report-loaders";
import {
  loadARAgingDetail, loadDSOReport, loadChecksReceivable, loadCustomerProfitability,
  loadCustomerStatementAll, loadAPAgingDetail, loadDPOReport, loadChecksPayable,
  loadSupplierPurchaseAnalysis, loadSupplierStatementAll, loadInvoiceLifecycle,
  loadDSODetailed, loadARAgingAdvanced, loadCollectionEfficiency, loadPaymentAllocation,
  loadUnpaidInvoices,
} from "@/lib/reports/receivable-report-loaders";
import { loadVATReconciliation, loadPOSGLReconciliation } from "@/lib/reports/recon-loaders";

interface GenericReportPageProps {
  reportKey: string;
}

const GenericReportPage = ({ reportKey }: GenericReportPageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const config = reportConfigs[reportKey] || { title: "تقرير", description: "" };
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  // "نوع العملية" filter — applies to sales-driven reports only
  const [salesSource, setSalesSource] = useState<"all" | "rep" | "pos" | "invoice">("all");

  // Reports that support the source filter
  const SOURCE_FILTERED_REPORTS = new Set([
    "total-sales", "daily-sales", "invoice-register", "by-customer",
    "sales-performance", "sales-by-product", "order-performance", "product-profitability",
  ]);
  const showSourceFilter = SOURCE_FILTERED_REPORTS.has(reportKey);

  // Debug mode (persisted in localStorage; logs surface in browser console for every loader)
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("amwali:reports:debug") === "1"; }
    catch { return false; }
  });
  const toggleDebug = () => {
    const next = !debugMode;
    setDebugMode(next);
    try { localStorage.setItem("amwali:reports:debug", next ? "1" : "0"); } catch {}
    if (next) {
      // eslint-disable-next-line no-console
      console.log("%c[reports] Debug mode ON — counts & sources will be logged on each load.", "color:#0070F2;font-weight:bold");
    }
    loadReport();
  };

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => setOwnerId(data || user!.id));
  }, [user]);

  useEffect(() => {
    if (ownerId) loadReport();
  }, [ownerId, dateFrom, dateTo, reportKey, salesSource]);

  const uid = ownerId || user?.id || "";

  const loadReport = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      switch (reportKey) {
        case "ar-aging": case "ap-aging": await loadAgingReport(uid, reportKey === "ar-aging" ? "عميل" : "مورد", setData); break;
        case "cash-flow": await loadCashFlowReport(uid, dateFrom, dateTo, setData); break;
        case "daily-sales": await loadDailySalesReport(uid, dateFrom, dateTo, setData, salesSource); break;
        case "sales-by-product": case "order-performance": await loadSalesByProductReport(uid, dateFrom, dateTo, setData, salesSource); break;
        case "dead-stock": await loadDeadStockReport(uid, setData); break;
        case "product-profitability": await loadProductProfitability(uid, setData, dateFrom, dateTo, salesSource); break;
        case "financial-kpi": await loadFinancialKPIs(uid, dateFrom, dateTo, setData); break;
        case "month-comparison": await loadMonthComparison(uid, setData); break;
        case "foreign-balances": await loadForeignBalances(uid, setData); break;
        case "cash-movement": await loadAccountMovement(uid, "1110", dateFrom, dateTo, setData); break;
        case "bank-movement": await loadAccountMovement(uid, "1120", dateFrom, dateTo, setData); break;
        case "cheques": await loadChequesReport(uid, dateFrom, dateTo, setData); break;
        case "total-sales": await loadTotalSales(uid, dateFrom, dateTo, setData, salesSource); break;
        case "invoice-register": await loadInvoiceRegister(uid, dateFrom, dateTo, setData, salesSource); break;
        case "by-customer": await loadByCustomer(uid, dateFrom, dateTo, setData, salesSource); break;
        case "collections": await loadCollections(uid, dateFrom, dateTo, setData); break;
        case "sales-returns": await loadSalesReturns(uid, dateFrom, dateTo, setData); break;
        case "sales-performance": await loadSalesPerformance(uid, dateFrom, dateTo, setData, salesSource); break;
        case "total-purchases": await loadTotalPurchases(uid, dateFrom, dateTo, setData); break;
        case "purchase-invoice-register": await loadPurchaseInvoiceRegister(uid, dateFrom, dateTo, setData); break;
        case "by-supplier": await loadBySupplier(uid, dateFrom, dateTo, setData); break;
        case "supplier-payments": await loadSupplierPayments(uid, dateFrom, dateTo, setData); break;
        case "purchase-returns": await loadPurchaseReturns(uid, dateFrom, dateTo, setData); break;
        case "supplier-comparison": await loadSupplierComparison(uid, dateFrom, dateTo, setData); break;
        case "inventory-valuation": await loadInventoryValuation(uid, setData); break;
        case "stock-movement": await loadStockMovement(uid, dateFrom, dateTo, setData); break;
        case "purchases-by-product": await loadPurchasesByProduct(uid, dateFrom, dateTo, setData); break;
        case "inventory-reconciliation": await loadInventoryReconciliation(uid, setData); break;
        case "product-card": await loadProductCard(uid, dateFrom, dateTo, setData); break;
        case "below-reorder": await loadBelowReorder(uid, setData); break;
        case "employee-directory": await loadEmployeeDirectory(uid, setData); break;
        case "employee-withdrawals": await loadEmployeeWithdrawals(uid, dateFrom, dateTo, setData); break;
        case "asset-register": await loadAssetRegister(uid, setData); break;
        case "monthly-depreciation": await loadMonthlyDepreciation(uid, dateFrom, dateTo, setData); break;
        case "depreciation-schedule": await loadDepreciationSchedule(uid, setData); break;
        case "fully-depreciated": await loadFullyDepreciated(uid, setData); break;
        case "asset-disposal": await loadAssetDisposal(uid, setData); break;
        case "assets-by-location": await loadAssetsByLocation(uid, setData); break;
        case "exchange-rates": await loadExchangeRates(uid, dateFrom, dateTo, setData); break;
        case "currency-conversions": await loadCurrencyConversions(uid, dateFrom, dateTo, setData); break;
        case "exchange-gain-loss": await loadExchangeGainLoss(uid, dateFrom, dateTo, setData); break;
        case "all-orders": await loadAllOrders(uid, dateFrom, dateTo, setData); break;
        case "pos-daily-sales": await loadPOSDailySales(uid, dateFrom, dateTo, setData); break;
        case "pos-sales-by-category": await loadPOSSalesByCategory(uid, dateFrom, dateTo, setData); break;
        case "pos-period-comparison": await loadPOSPeriodComparison(uid, dateFrom, dateTo, setData); break;
        case "pos-invoice-register": await loadPOSInvoiceRegister(uid, dateFrom, dateTo, setData); break;
        case "pos-pending-orders": await loadPOSPendingOrders(uid, setData); break;
        case "pos-invoice-timing": await loadPOSInvoiceTiming(uid, dateFrom, dateTo, setData); break;
        case "pos-shift-open-close": await loadPOSShiftOpenClose(uid, dateFrom, dateTo, setData); break;
        case "pos-payment-methods": await loadPOSPaymentMethods(uid, dateFrom, dateTo, setData); break;
        case "pos-credit-sales": await loadPOSCreditSales(uid, dateFrom, dateTo, setData); break;
        case "pos-product-movement": await loadPOSProductMovement(uid, dateFrom, dateTo, setData); break;
        case "pos-category-totals": await loadPOSCategoryTotals(uid, dateFrom, dateTo, setData); break;
        case "pos-cash-reconciliation": await loadPOSCashReconciliation(uid, dateFrom, dateTo, setData); break;
        case "pos-cashier-performance": await loadPOSCashierPerformance(uid, dateFrom, dateTo, setData); break;
        case "pos-cancelled": await loadPOSCancelled(uid, dateFrom, dateTo, setData); break;
        case "pos-peak-hours": await loadPOSPeakHours(uid, dateFrom, dateTo, setData); break;
        case "ar-aging-detail": await loadARAgingDetail(uid, setData); break;
        case "dso-report": await loadDSOReport(uid, dateFrom, dateTo, setData); break;
        case "checks-receivable": await loadChecksReceivable(uid, setData); break;
        case "customer-profitability": await loadCustomerProfitability(uid, dateFrom, dateTo, setData); break;
        case "customer-statement-all": await loadCustomerStatementAll(uid, dateFrom, dateTo, setData); break;
        case "ap-aging-detail": await loadAPAgingDetail(uid, setData); break;
        case "dpo-report": await loadDPOReport(uid, dateFrom, dateTo, setData); break;
        case "checks-payable": await loadChecksPayable(uid, setData); break;
        case "supplier-purchase-analysis": await loadSupplierPurchaseAnalysis(uid, dateFrom, dateTo, setData); break;
        case "supplier-statement-all": await loadSupplierStatementAll(uid, dateFrom, dateTo, setData); break;
        case "invoice-lifecycle": await loadInvoiceLifecycle(uid, dateFrom, dateTo, setData); break;
        case "dso-detailed": await loadDSODetailed(uid, dateFrom, dateTo, setData); break;
        case "ar-aging-advanced": await loadARAgingAdvanced(uid, setData); break;
        case "collection-efficiency": await loadCollectionEfficiency(uid, setData); break;
        case "payment-allocation": await loadPaymentAllocation(uid, dateFrom, dateTo, setData); break;
        case "unpaid-invoices": await loadUnpaidInvoices(uid, dateFrom, dateTo, setData); break;
        case "vat-reconciliation": await loadVATReconciliation(uid, dateFrom, dateTo, setData); break;
        case "pos-gl-reconciliation": await loadPOSGLReconciliation(uid, dateFrom, dateTo, setData); break;
        default: await loadGenericTransactions(uid, dateFrom, dateTo, setData); break;
      }
    } catch (e: any) {
      console.error(`[Report][${reportKey}] Error:`, e);
      toast.error("حدث خطأ أثناء تحميل التقرير — حاول مرة أخرى");
    }
    setLoading(false);
  };

  // ── Column Definitions ──
  const getReportColumns = (): ColumnDef[] | null => {
    switch (reportKey) {
      case "ar-aging": case "ap-aging":
        return [
          { key: "name", label: reportKey === "ar-aging" ? "الزبون" : "المورد", type: "text" },
          { key: "cls", label: "التصنيف", type: "badge" },
          { key: "current", label: "جاري", type: "currency", format: v => <span className="text-emerald-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d30", label: "1-30", type: "currency", format: v => <span className="text-yellow-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d60", label: "31-60", type: "currency", format: v => <span className="text-orange-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d90", label: "61-90", type: "currency", format: v => <span className="text-red-500 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "over90", label: "+90", type: "currency", format: v => <span className="text-red-700 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "total", label: "الإجمالي", type: "currency" },
        ];
      case "daily-sales":
        return [
          { key: "date", label: "التاريخ", type: "date" },
          { key: "count", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "sales", label: "المبيعات", type: "currency" },
          { key: "returns", label: "المرتجعات", type: "currency", format: v => v > 0 ? <span className="text-destructive font-mono text-xs">({fmtAmtCell(v)})</span> : <span className="font-mono text-xs">—</span> },
          { key: "net", label: "الصافي", type: "currency" },
        ];
      case "cheques":
        return [
          { key: "cheque_number", label: "رقم الشيك", type: "text" },
          { key: "bank_name", label: "البنك", type: "text" },
          { key: "party_name", label: "الطرف", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency" },
          { key: "cheque_date", label: "تاريخ الاستحقاق", type: "date" },
          { key: "cheque_type", label: "النوع", type: "badge" },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["معلق", "محصل", "مرتجع", "ملغي"] },
        ];
      case "collections": case "supplier-payments":
        return [
          { key: "transaction_date", label: "التاريخ", type: "date" },
          { key: "description", label: "البيان", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency" },
          { key: "payment_method", label: "طريقة الدفع", type: "text" },
          { key: "reference", label: "المرجع", type: "text" },
        ];
      case "invoice-register": case "purchase-invoice-register":
        return [
          { key: "invoice_number", label: "رقم الفاتورة", type: "text" },
          { key: "invoice_date", label: "التاريخ", type: "date" },
          { key: "contact_name", label: reportKey === "invoice-register" ? "العميل" : "المورد", type: "text" },
          { key: "subtotal", label: "الصافي", type: "currency" },
          { key: "tax_amount", label: reportKey === "invoice-register" ? "ض.ق.م" : "ض.م المدخلات", type: "currency" },
          { key: "total_amount", label: "الإجمالي", type: "currency" },
          { key: "paid_amount", label: "المدفوع", type: "currency" },
          { key: "remaining_amount", label: "المتبقي", type: "currency" },
          { key: "payment_status", label: "حالة الدفع", type: "badge" },
        ];
      case "sales-returns": case "purchase-returns":
        return [
          { key: "transaction_date", label: "التاريخ", type: "date" },
          { key: "description", label: "البيان", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency" },
          { key: "reference", label: "المرجع", type: "text" },
        ];
      case "by-customer":
        return [
          { key: "name", label: "الزبون", type: "text" },
          { key: "cls", label: "التصنيف", type: "badge" },
          { key: "count", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "total", label: "الإجمالي", type: "currency" },
          { key: "lastDate", label: "آخر عملية", type: "date" },
        ];
      case "by-supplier":
        return [
          { key: "name", label: "المورد", type: "text" },
          { key: "count", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "total", label: "الإجمالي", type: "currency" },
        ];
      case "inventory-valuation":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية", type: "number", align: "center" },
          { key: "cost", label: "متوسط التكلفة", type: "currency" },
          { key: "value", label: "القيمة", type: "currency" },
          { key: "pct", label: "النسبة", type: "percent" },
        ];
      case "asset-register":
        return [
          { key: "asset_number", label: "رقم الأصل", type: "text" },
          { key: "name_ar", label: "الاسم", type: "text" },
          { key: "acquisition_cost", label: "التكلفة", type: "currency" },
          { key: "accumulated_depreciation", label: "مجمع الاستهلاك", type: "currency" },
          { key: "net_book_value", label: "القيمة الدفترية", type: "currency" },
          { key: "status", label: "الحالة", type: "badge" },
        ];
      case "employee-directory":
        return [
          { key: "full_name", label: "الاسم", type: "text" },
          { key: "department", label: "القسم", type: "text" },
          { key: "job_title", label: "المسمى", type: "text" },
          { key: "start_date", label: "تاريخ التعيين", type: "date" },
          { key: "salary", label: "الراتب", type: "currency" },
          { key: "employment_status", label: "الحالة", type: "badge" },
        ];
      case "employee-withdrawals":
        return [
          { key: "date", label: "التاريخ", type: "date" },
          { key: "ref_number", label: "رقم السند", type: "text" },
          { key: "employee_name", label: "الموظف", type: "text" },
          { key: "category", label: "نوع العملية", type: "badge", filterType: "select", filterOptions: ["سلفة", "رواتب", "أكل", "عجز", "مشتريات", "توصيل", "مخالفة", "أخرى"] },
          { key: "description", label: "الوصف", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency" },
        ];
      case "sales-by-product": case "order-performance":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية المباعة", type: "number", align: "center" },
          { key: "qty_returned", label: "المرتجعة", type: "number", align: "center", format: (v: number) => <span className={`font-mono text-xs ${v > 0 ? "text-destructive font-bold" : ""}`}>{v || 0}</span> },
          { key: "qty_net", label: "الصافي", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs font-bold">{v}</span> },
          { key: "revenue", label: "الإيرادات", type: "currency" },
          { key: "cost", label: "التكلفة", type: "currency" },
          { key: "profit", label: "الربح", type: "currency", format: (v, row) => { const p = (row.revenue || 0) - (row.cost || 0); return <span className={`font-mono text-xs ${p >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtAmtCell(p)}</span>; } },
          { key: "margin", label: "الهامش", type: "percent", format: (v, row) => { const m = row.revenue > 0 ? ((row.revenue - row.cost) / row.revenue * 100) : 0; return <span className="font-mono text-xs">{m.toFixed(1)}%</span>; } },
        ];
      case "purchases-by-product":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "كمية الشراء", type: "number", align: "center" },
          { key: "qty_returned", label: "المرتجعة", type: "number", align: "center", format: (v: number) => <span className={`font-mono text-xs ${v > 0 ? "text-destructive font-bold" : ""}`}>{v || 0}</span> },
          { key: "qty_net", label: "الصافي", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs font-bold">{v}</span> },
          { key: "cost", label: "إجمالي التكلفة", type: "currency" },
          { key: "avg_cost", label: "متوسط سعر الشراء", type: "currency" },
          { key: "lines", label: "عدد البنود", type: "number", align: "center" },
        ];
      case "inventory-reconciliation":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "live_qty", label: "الكمية الحالية (products.quantity)", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs">{v}</span> },
          { key: "derived_qty", label: "الكمية المحسوبة (Σ stock_movements)", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs">{v}</span> },
          { key: "diff", label: "الفرق", type: "number", align: "center",
            format: (v: number) => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.001 ? "text-emerald-600" : "text-red-600"}`}>{v}</span> },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["✅ مطابق", "⚠️ فرق"] },
        ];
      case "product-card":
        return [
          { key: "product", label: "الصنف", type: "text", filterType: "text", filterable: true },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "type", label: "النوع", type: "badge", filterType: "select", filterOptions: ["رصيد افتتاحي","شراء","بيع","بيع POS","مرتجع وارد","مرتجع صادر","تسوية","تحويل","تالف","مرتجع POS"] },
          { key: "in_qty", label: "وارد", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs text-emerald-600">{v ? v : "—"}</span> },
          { key: "out_qty", label: "صادر", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs text-red-600">{v ? v : "—"}</span> },
          { key: "balance", label: "الرصيد", type: "number", align: "center", format: (v: number) => <span className="font-mono text-xs font-bold">{v}</span> },
          { key: "ref", label: "المرجع", type: "text" },
        ];
      case "dead-stock":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية", type: "number", align: "center" },
          { key: "value", label: "القيمة المجمدة", type: "currency" },
          { key: "lastMove", label: "آخر حركة", type: "date", format: v => <span className="font-mono text-xs">{v?.split("T")[0] || "لا يوجد"}</span> },
          { key: "days", label: "الأيام", type: "number", format: v => <span className={`font-mono text-xs ${v > 180 ? "text-red-600 font-bold" : "text-orange-500"}`}>{v >= 999 ? "+999" : v}</span> },
        ];
      case "product-profitability":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "buyPrice", label: "سعر الشراء", type: "currency" },
          { key: "sellPrice", label: "سعر البيع", type: "currency" },
          { key: "profit", label: "الربح/وحدة", type: "currency", format: v => <span className={`font-mono text-xs ${v >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtAmtCell(v)}</span> },
          { key: "margin", label: "الهامش", type: "percent" },
          { key: "stock", label: "المخزون", type: "number", align: "center" },
        ];
      case "month-comparison":
        return [
          { key: "month", label: "الشهر", type: "text", sortable: false },
          { key: "revenue", label: "الإيرادات", type: "currency", format: v => <span className="text-green-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "expenses", label: "المصروفات", type: "currency", format: v => <span className="text-red-500 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "profit", label: "صافي الربح", type: "currency", format: v => <span className={`font-mono text-xs font-bold ${v >= 0 ? "text-green-600" : "text-red-500"}`}>{v < 0 ? `(${fmtAmtCell(v)})` : fmtAmtCell(v)}</span> },
        ];
      case "pos-daily-sales":
        return [
          { key: "order_number", label: "رقم الفاتورة", type: "text" },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "time", label: "الوقت", type: "text" },
          { key: "cashier", label: "الكاشير", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.cashier).filter(Boolean))] },
          { key: "customer_name", label: "الزبون", type: "text" },
          { key: "currency", label: "العملة", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.currency).filter(Boolean))] },
          { key: "discount", label: "الخصم", type: "currency" },
          { key: "total", label: "الإجمالي", type: "currency" },
        ];
      case "pos-cashier-performance":
        return [
          { key: "name", label: "الكاشير", type: "text" },
          { key: "count", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "total", label: "إجمالي المبيعات", type: "currency" },
          { key: "avg", label: "متوسط الفاتورة", type: "currency", format: (v, row) => <span className="font-mono text-xs">{row.count > 0 ? fmtAmtCell(row.total / row.count) : "—"}</span> },
          { key: "cancelled", label: "الملغية", type: "number", format: v => <span className={`font-mono text-xs ${v > 0 ? "text-red-500 font-bold" : ""}`}>{v}</span> },
        ];
      case "pos-sales-by-category":
        return [
          { key: "category", label: "الفئة", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.category).filter(Boolean))] },
          { key: "product", label: "المنتج", type: "text" },
          { key: "qty", label: "الكمية المباعة", type: "number", align: "center" },
          { key: "revenue", label: "إجمالي المبيعات", type: "currency" },
          { key: "cost", label: "التكلفة", type: "currency" },
          { key: "profit", label: "الربح", type: "currency", format: (v: number) => <span className={`font-mono text-xs font-bold ${v >= 0 ? "text-green-600" : "text-destructive"}`}>{fmtAmtCell(v)}</span> },
          { key: "pct", label: "% من الإجمالي", type: "number", format: (v: number) => <span className="font-mono text-xs">{v.toFixed(1)}%</span> },
        ];
      case "pos-period-comparison":
        return [
          { key: "period", label: "الفترة", type: "date" },
          { key: "orders", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "sales", label: "المبيعات", type: "currency" },
          { key: "discounts", label: "الخصومات", type: "currency" },
          { key: "avg", label: "متوسط الفاتورة", type: "currency" },
          { key: "growth", label: "نمو %", type: "number", format: (v: number) => <span className={`font-mono text-xs font-bold ${v > 0 ? "text-green-600" : v < 0 ? "text-destructive" : ""}`}>{v > 0 ? "+" : ""}{v.toFixed(1)}%</span> },
        ];
      case "pos-invoice-register":
        return [
          { key: "order_number", label: "رقم الفاتورة", type: "text", filterable: true, filterType: "text",
            format: (v: string, row: any) => row.id ? (
              <button
                onClick={(e) => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) window.open(`/pos/invoice/${row.id}`, "_blank"); else navigate(`/pos/invoice/${row.id}`); }}
                className="text-primary hover:underline font-mono text-xs font-semibold"
                title="فتح تفاصيل الفاتورة (Ctrl+Click للفتح في تبويب جديد)"
              >{v}</button>
            ) : <span className="font-mono text-xs">{v}</span>
          },
          { key: "date", label: "التاريخ", type: "date", filterable: true, format: (v: string) => <span className="font-mono text-xs">{fmtDateDisplay(v)}</span> },
          { key: "time", label: "الوقت", type: "text", filterable: true },
          { key: "cashier", label: "الكاشير", type: "text", filterable: true, filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.cashier).filter(Boolean))] },
          { key: "customer", label: "العميل", type: "text", filterable: true, filterType: "text" },
          { key: "subtotal", label: "المبلغ", type: "currency", filterable: true },
          { key: "discount", label: "الخصم", type: "currency", filterable: true },
          { key: "tax", label: "الضريبة", type: "currency", filterable: true },
          { key: "total", label: "الصافي", type: "currency", filterable: true },
          { key: "currency", label: "العملة", type: "text", filterable: true, filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.currency).filter(Boolean))] },
          { key: "state", label: "الحالة", type: "badge", filterable: true, filterType: "select", filterOptions: ["paid", "cancelled", "draft"],
            format: (v: string) => {
              const colors: Record<string, string> = { paid: "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400", cancelled: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400", draft: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-400" };
              const labels: Record<string, string> = { paid: "مكتمل", cancelled: "ملغي", draft: "معلق" };
              return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[v] || ""}`}>{labels[v] || v}</span>;
            }
          },
          { key: "actions", label: "إجراءات", type: "text", sortable: false, filterable: false,
            format: (_: any, row: any) => row.id ? (
              <button
                onClick={(e) => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) window.open(`/pos/invoice/${row.id}`, "_blank"); else navigate(`/pos/invoice/${row.id}`); }}
                className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 font-semibold transition-colors"
              >فتح / إلغاء</button>
            ) : null
          },
        ];
      case "pos-pending-orders":
        return [
          { key: "order_number", label: "رقم الطلب", type: "text" },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "time", label: "الوقت", type: "text" },
          { key: "cashier", label: "الكاشير", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.cashier).filter(Boolean))] },
          { key: "customer", label: "العميل", type: "text" },
          { key: "total", label: "الإجمالي", type: "currency" },
          { key: "wait_minutes", label: "مدة الانتظار (دقيقة)", type: "number", format: (v: number) => <span className={`font-mono text-xs font-bold ${v > 60 ? "text-destructive" : v > 30 ? "text-yellow-600" : ""}`}>{v}</span> },
        ];
      case "pos-shift-open-close":
        return [
          { key: "cashier", label: "الكاشير", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.cashier).filter(Boolean))] },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "open_time", label: "وقت الفتح", type: "text" },
          { key: "close_time", label: "وقت الإغلاق", type: "text" },
          { key: "opening", label: "مبلغ الافتتاح", type: "currency" },
          { key: "closing", label: "مبلغ الإغلاق", type: "currency" },
          { key: "duration_hrs", label: "المدة (ساعة)", type: "number", format: (v: number) => <span className="font-mono text-xs">{v.toFixed(1)}</span> },
          { key: "state", label: "الحالة", type: "badge", format: (v: string) => <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${v === "open" ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"}`}>{v === "open" ? "مفتوحة" : "مغلقة"}</span> },
        ];
      case "pos-payment-methods":
        return [
          { key: "method", label: "طريقة الدفع", type: "text" },
          { key: "count", label: "عدد المعاملات", type: "number", align: "center" },
          { key: "total", label: "الإجمالي", type: "currency" },
          { key: "avg", label: "المتوسط", type: "currency" },
          { key: "max", label: "الأعلى", type: "currency" },
          { key: "min", label: "الأقل", type: "currency" },
          { key: "pct", label: "%", type: "number", format: (v: number) => <span className="font-mono text-xs">{v.toFixed(1)}%</span> },
        ];
      case "pos-product-movement":
        return [
          { key: "product", label: "الصنف", type: "text" },
          { key: "sold_qty", label: "الكمية المباعة", type: "number", align: "center" },
          { key: "return_qty", label: "المرتجعة", type: "number", align: "center", format: (v: number) => <span className={`font-mono text-xs ${v > 0 ? "text-destructive font-bold" : ""}`}>{v}</span> },
          { key: "net_qty", label: "صافي الكمية", type: "number", align: "center" },
          { key: "revenue", label: "إجمالي المبيعات", type: "currency" },
          { key: "avg_price", label: "متوسط السعر", type: "currency" },
        ];
      case "pos-category-totals":
        return [
          { key: "category", label: "الفئة", type: "text" },
          { key: "items", label: "عدد الأصناف", type: "number", align: "center" },
          { key: "qty", label: "إجمالي الكميات", type: "number", align: "center" },
          { key: "revenue", label: "إجمالي المبيعات", type: "currency" },
          { key: "pct", label: "% من الإجمالي", type: "number", format: (v: number) => <span className="font-mono text-xs">{v.toFixed(1)}%</span> },
        ];
      case "pos-cancelled":
        return [
          { key: "order_number", label: "رقم الطلب", type: "text" },
          { key: "created_at", label: "التاريخ", type: "date", format: (v: string) => <span className="font-mono text-xs">{v?.split("T")[0]}</span> },
          { key: "customer_name", label: "الزبون", type: "text" },
          { key: "total", label: "المبلغ", type: "currency" },
          { key: "return_reason", label: "السبب", type: "text", format: (v: string) => <span className="text-xs text-destructive">{v || "-"}</span> },
        ];
      case "pos-invoice-timing":
        return [
          { key: "order_number", label: "رقم الفاتورة", type: "text" },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "open_time", label: "وقت الفتح", type: "text" },
          { key: "close_time", label: "وقت الإغلاق", type: "text" },
          { key: "duration_min", label: "مدة الخدمة (دقيقة)", type: "number", format: (v: number) => <span className={`font-mono text-xs font-bold ${v > 30 ? "text-destructive" : v > 15 ? "text-yellow-600" : "text-green-600"}`}>{v}</span> },
          { key: "cashier", label: "الكاشير", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.cashier).filter(Boolean))] },
          { key: "customer", label: "العميل", type: "text" },
          { key: "total", label: "الإجمالي", type: "currency" },
        ];
      case "pos-credit-sales":
        return [
          { key: "customer", label: "العميل", type: "text" },
          { key: "orders", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "credit_total", label: "المبلغ الآجل", type: "currency" },
        ];
      case "all-orders":
        return [
          { key: "order_number", label: "رقم الطلب", type: "text" },
          { key: "created_at", label: "التاريخ", type: "date", format: v => <span className="font-mono text-xs">{v?.split("T")[0]}</span> },
          { key: "customer_name", label: "الزبون", type: "text" },
          { key: "total", label: "المبلغ", type: "currency" },
          { key: "state", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["paid", "cancelled", "draft"],
            format: v => {
              const colors: Record<string, string> = { paid: "bg-green-50 text-green-600", cancelled: "bg-red-50 text-red-600", draft: "bg-yellow-50 text-yellow-600" };
              const labels: Record<string, string> = { paid: "مكتمل", cancelled: "ملغي", draft: "مسودة" };
              return <span className={`px-2 py-1 rounded-full text-xs ${colors[v] || "bg-muted"}`}>{labels[v] || v}</span>;
            }},
        ];
      case "ar-aging-detail": case "ap-aging-detail":
        return [
          { key: "name", label: reportKey === "ar-aging-detail" ? "الزبون" : "المورد", type: "text" },
          { key: "total", label: "الإجمالي", type: "currency", format: v => <span className="font-mono text-xs font-bold">{fmtAmtCell(v)}</span> },
          { key: "current", label: "0-30", type: "currency", format: v => <span className="text-emerald-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d31_60", label: "31-60", type: "currency", format: v => <span className="text-amber-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d61_90", label: "61-90", type: "currency", format: v => <span className="text-orange-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "over90", label: "+90", type: "currency", format: v => <span className="text-red-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          ...(reportKey === "ar-aging-detail" ? [{ key: "cls", label: "التصنيف", type: "badge" as const }] : [{ key: "priority", label: "الأولوية", type: "text" as const }]),
        ];
      case "dso-report":
        return [
          { key: "name", label: "الزبون", type: "text" },
          { key: "invCount", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "avgDays", label: "متوسط أيام السداد", type: "number", format: v => <span className={`font-mono text-xs ${v < 30 ? "text-emerald-600" : v <= 45 ? "text-amber-600" : "text-red-600"}`}>{v} يوم</span> },
          { key: "avgLate", label: "متوسط التأخر", type: "number", format: v => <span className={`font-mono text-xs ${v === 0 ? "text-emerald-600" : "text-red-600"}`}>{v} يوم</span> },
          { key: "bestPayment", label: "أفضل سداد", type: "number", format: v => <span className="font-mono text-xs">{v} يوم</span> },
          { key: "worstPayment", label: "أسوأ سداد", type: "number", format: v => <span className="font-mono text-xs">{v} يوم</span> },
          { key: "grade", label: "التصنيف", type: "badge", filterType: "select", filterOptions: ["A", "B", "C", "D"] },
        ];
      case "checks-receivable": case "checks-payable":
        return [
          { key: "party", label: reportKey === "checks-receivable" ? "الزبون" : "المورد", type: "text" },
          { key: "number", label: "رقم الشيك", type: "text" },
          { key: "chequeDate", label: "تاريخ الشيك", type: "date" },
          { key: "amount", label: "المبلغ", type: "currency" },
          { key: "daysUntilDue", label: "أيام حتى الاستحقاق", type: "number", format: v => <span className={`font-mono text-xs ${v < 0 ? "text-red-600 font-bold" : v <= 7 ? "text-amber-600" : "text-emerald-600"}`}>{v} يوم</span> },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["برسم التحصيل", "محصل", "مرتجع", "صادر", "مدفوع"],
            format: v => {
              const c: Record<string, string> = { "محصل": "bg-emerald-50 text-emerald-600", "مدفوع": "bg-emerald-50 text-emerald-600", "برسم التحصيل": "bg-amber-50 text-amber-600", "صادر": "bg-blue-50 text-blue-600", "مرتجع": "bg-red-50 text-red-600" };
              return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c[v] || "bg-muted"}`}>{v}</span>;
            }},
        ];
      case "customer-profitability":
        return [
          { key: "name", label: "الزبون", type: "text" },
          { key: "revenue", label: "الإيرادات", type: "currency" },
          { key: "cogs", label: "تكلفة المبيعات", type: "currency" },
          { key: "returns", label: "المرتجعات", type: "currency" },
          { key: "profit", label: "الربح", type: "currency", format: v => <span className={`font-mono text-xs font-bold ${v >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "margin", label: "هامش %", type: "percent" },
          { key: "invCount", label: "عدد الفواتير", type: "number", align: "center" },
        ];
      case "customer-statement-all": case "supplier-statement-all":
        return [
          { key: "contactName", label: reportKey === "customer-statement-all" ? "الزبون" : "المورد", type: "text" },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "ref", label: "المرجع", type: "text" },
          { key: "desc", label: "البيان", type: "text" },
          { key: "debit", label: "مدين", type: "currency", format: v => v > 0 ? <span className="font-mono text-xs">{fmtAmtCell(v)}</span> : <span className="font-mono text-xs">—</span> },
          { key: "credit", label: "دائن", type: "currency", format: v => v > 0 ? <span className="font-mono text-xs">{fmtAmtCell(v)}</span> : <span className="font-mono text-xs">—</span> },
          { key: "balance", label: "الرصيد", type: "currency", format: v => <span className={`font-mono text-xs font-bold ${v > 0 ? "text-red-600" : v < 0 ? "text-emerald-600" : ""}`}>{fmtAmtCell(v)}</span> },
        ];
      case "dpo-report":
        return [
          { key: "name", label: "المورد", type: "text" },
          { key: "totalPurchases", label: "إجمالي المشتريات", type: "currency" },
          { key: "invCount", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "avgDays", label: "متوسط أيام الدفع", type: "number", format: v => <span className="font-mono text-xs">{v} يوم</span> },
          { key: "compliance", label: "الالتزام %", type: "percent" },
        ];
      case "supplier-purchase-analysis":
        return [
          { key: "name", label: "المورد", type: "text" },
          { key: "total", label: "إجمالي المشتريات", type: "currency" },
          { key: "invCount", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "avgInv", label: "متوسط الفاتورة", type: "currency" },
          { key: "pct", label: "% من الإجمالي", type: "percent" },
        ];
      case "invoice-lifecycle":
        return [
          { key: "invoiceNumber", label: "رقم الفاتورة", type: "text" },
          { key: "customer", label: "الزبون", type: "text" },
          { key: "issueDate", label: "تاريخ الإصدار", type: "date" },
          { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
          { key: "total", label: "الإجمالي", type: "currency" },
          { key: "paid", label: "المسدَّد", type: "currency", format: v => <span className="text-emerald-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "remaining", label: "المتبقي", type: "currency", format: v => <span className={`font-mono text-xs ${v > 0 ? "text-red-600 font-bold" : "text-emerald-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "closureStatus", label: "الحالة", type: "text", filterType: "select", filterOptions: ["✅ في الموعد", "⚠️ متأخر", "⏳ جارية", "🔴 متأخرة"] },
          { key: "daysToClose", label: "أيام الإغلاق", type: "text", format: v => <span className="font-mono text-xs">{v === "—" ? "—" : `${v} يوم`}</span> },
        ];
      case "dso-detailed":
        return [
          { key: "name", label: "الزبون", type: "text" },
          { key: "invCount", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "avgDSO", label: "متوسط أيام التحصيل", type: "number", format: v => <span className={`font-mono text-xs ${v < 30 ? "text-emerald-600" : v < 45 ? "text-amber-600" : "text-red-600"}`}>{v} يوم</span> },
          { key: "fastest", label: "أسرع دفعة", type: "number", format: v => <span className="font-mono text-xs text-emerald-600">{v} يوم</span> },
          { key: "slowest", label: "أبطأ دفعة", type: "number", format: v => <span className="font-mono text-xs text-red-600">{v} يوم</span> },
          { key: "grade", label: "التصنيف الائتماني", type: "text", filterType: "select", filterOptions: ["🟢 A ممتاز", "🟡 B جيد", "🟠 C مقبول", "🔴 D خطر"] },
        ];
      case "ar-aging-advanced":
        return [
          { key: "name", label: "الزبون", type: "text" },
          { key: "current", label: "جارية", type: "currency", format: v => <span className="text-emerald-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d1_30", label: "1-30 يوم", type: "currency", format: v => <span className="text-amber-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d31_60", label: "31-60 يوم", type: "currency", format: v => <span className="text-orange-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d61_90", label: "61-90 يوم", type: "currency", format: v => <span className="text-red-500 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "over90", label: "+90 يوم", type: "currency", format: v => <span className="text-red-700 font-mono text-xs font-bold">{fmtAmtCell(v)}</span> },
          { key: "total", label: "الإجمالي", type: "currency", format: v => <span className="font-mono text-xs font-bold">{fmtAmtCell(v)}</span> },
        ];
      case "collection-efficiency":
        return [
          { key: "month", label: "الشهر", type: "text", sortable: false },
          { key: "issued", label: "صادر ₪", type: "currency" },
          { key: "collected", label: "محصَّل ₪", type: "currency", format: v => <span className="text-emerald-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "collectionRate", label: "معدل التحصيل %", type: "percent", format: v => <span className={`font-mono text-xs font-bold ${v >= 80 ? "text-emerald-600" : v >= 50 ? "text-amber-600" : "text-red-600"}`}>{v}%</span> },
          { key: "onTime", label: "في الموعد", type: "number", align: "center", format: v => <span className="text-emerald-600 font-mono text-xs">{v}</span> },
          { key: "late", label: "متأخر", type: "number", align: "center", format: v => <span className={`font-mono text-xs ${v > 0 ? "text-red-600 font-bold" : ""}`}>{v}</span> },
          { key: "avgDaysLate", label: "متوسط أيام التأخير", type: "number", format: v => <span className="font-mono text-xs">{v > 0 ? `${v} يوم` : "—"}</span> },
        ];
      case "payment-allocation":
        return [
          { key: "receiptNumber", label: "رقم السند", type: "text" },
          { key: "paymentDate", label: "التاريخ", type: "date" },
          { key: "customer", label: "الزبون", type: "text" },
          { key: "paymentMethod", label: "طريقة الدفع", type: "badge", filterType: "select", filterOptions: ["نقدي", "بنك", "شيك"] },
          { key: "invoiceNumber", label: "الفاتورة المرتبطة", type: "text" },
          { key: "allocated", label: "المبلغ المخصص", type: "currency" },
        ];
      case "unpaid-invoices":
        return [
          { key: "invoiceNumber", label: "الفاتورة", type: "text" },
          { key: "customer", label: "الزبون", type: "text" },
          { key: "issueDate", label: "تاريخ الإصدار", type: "date" },
          { key: "total", label: "المبلغ", type: "currency" },
          { key: "daysSinceIssue", label: "أيام منذ الإصدار", type: "number",
            format: v => <span className={`font-mono text-xs font-bold ${v > 60 ? "text-red-600" : v > 30 ? "text-amber-600" : ""}`}>{v} يوم {v > 60 ? "🔴" : ""}</span> },
        ];
      case "vat-reconciliation":
        return [
          { key: "period", label: "الشهر", type: "text" },
          { key: "vat_output_ledger", label: "ضريبة المبيعات (سجل)", type: "currency" },
          { key: "vat_output_gl", label: "ضريبة المبيعات (أستاذ)", type: "currency" },
          { key: "diff_output", label: "الفرق", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "vat_input_ledger", label: "ضريبة المدخلات (سجل)", type: "currency" },
          { key: "vat_input_gl", label: "ضريبة المدخلات (أستاذ)", type: "currency" },
          { key: "diff_input", label: "الفرق", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["✅ مطابق", "⚠️ فرق"] },
        ];
      case "pos-gl-reconciliation":
        return [
          { key: "date", label: "التاريخ", type: "date" },
          { key: "pos_revenue", label: "إيرادات POS", type: "currency" },
          { key: "gl_revenue", label: "إيرادات الأستاذ", type: "currency" },
          { key: "diff_revenue", label: "فرق الإيرادات", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "pos_vat", label: "ضريبة POS", type: "currency" },
          { key: "gl_vat", label: "ضريبة الأستاذ", type: "currency" },
          { key: "diff_vat", label: "فرق الضريبة", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "pos_cash", label: "نقد POS", type: "currency" },
          { key: "gl_cash", label: "نقد الأستاذ", type: "currency" },
          { key: "diff_cash", label: "فرق النقد", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "pos_bank", label: "بنك/بطاقات POS", type: "currency" },
          { key: "gl_bank", label: "بنك الأستاذ", type: "currency" },
          { key: "diff_bank", label: "فرق البنك", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${Math.abs(Number(v)) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>{fmtAmtCell(v)}</span> },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["✅ مطابق", "⚠️ فرق"] },
        ];
      default:
        return null;
    }
  };

  const getReportTotals = (): TotalsConfig | undefined => {
    switch (reportKey) {
      case "ar-aging": case "ap-aging": return { current: "sum", d30: "sum", d60: "sum", d90: "sum", over90: "sum", total: "sum" };
      case "daily-sales": return { count: "sum", sales: "sum", returns: "sum", net: "sum" };
      case "inventory-valuation": return { value: "sum" };
      case "purchases-by-product": return { qty: "sum", qty_returned: "sum", qty_net: "sum", cost: "sum", lines: "sum" };
      case "inventory-reconciliation": return { live_qty: "sum", derived_qty: "sum", diff: "sum" };
      case "product-card": return { in_qty: "sum", out_qty: "sum" };
      case "collections": case "supplier-payments": return { amount: "sum" };
      case "invoice-register": case "purchase-invoice-register": return { subtotal: "sum", tax_amount: "sum", total_amount: "sum", paid_amount: "sum", remaining_amount: "sum" };
      case "sales-returns": case "purchase-returns": return { amount: "sum" };
      case "by-customer": case "by-supplier": return { count: "sum", total: "sum" };
      case "pos-daily-sales": return { discount: "sum", total: "sum" };
      case "pos-sales-by-category": return { qty: "sum", revenue: "sum", cost: "sum", profit: "sum" };
      case "pos-period-comparison": return { orders: "sum", sales: "sum", discounts: "sum" };
      case "pos-invoice-register": return { subtotal: "sum", discount: "sum", tax: "sum", total: "sum" };
      case "pos-pending-orders": return { total: "sum" };
      case "pos-shift-open-close": return { opening: "sum", closing: "sum" };
      case "pos-payment-methods": return { count: "sum", total: "sum" };
      case "pos-product-movement": return { sold_qty: "sum", return_qty: "sum", net_qty: "sum", revenue: "sum" };
      case "pos-category-totals": return { items: "sum", qty: "sum", revenue: "sum" };
      case "pos-invoice-timing": return { total: "sum" };
      case "pos-credit-sales": return { orders: "sum", credit_total: "sum" };
      case "ar-aging-detail": case "ap-aging-detail": return { current: "sum", d31_60: "sum", d61_90: "sum", over90: "sum", total: "sum" };
      case "customer-profitability": return { revenue: "sum", cogs: "sum", returns: "sum", profit: "sum", invCount: "sum" };
      case "supplier-purchase-analysis": return { totalSales: "sum", total: "sum", invCount: "sum" };
      case "checks-receivable": case "checks-payable": return { amount: "sum" };
      case "employee-withdrawals": return { amount: "sum" };
      case "customer-statement-all": case "supplier-statement-all": return { debit: "sum", credit: "sum" };
      case "dpo-report": return { totalPurchases: "sum", invCount: "sum" };
      case "invoice-lifecycle": return { total: "sum", paid: "sum", remaining: "sum" };
      case "dso-detailed": return { invCount: "sum" };
      case "ar-aging-advanced": return { current: "sum", d1_30: "sum", d31_60: "sum", d61_90: "sum", over90: "sum", total: "sum" };
      case "collection-efficiency": return { issued: "sum", collected: "sum", onTime: "sum", late: "sum" };
      case "payment-allocation": return { allocated: "sum" };
      case "unpaid-invoices": return { total: "sum" };
      case "vat-reconciliation": return { vat_output_ledger: "sum", vat_output_gl: "sum", diff_output: "sum", vat_input_ledger: "sum", vat_input_gl: "sum", diff_input: "sum" };
      case "pos-gl-reconciliation": return { pos_revenue: "sum", gl_revenue: "sum", diff_revenue: "sum", pos_vat: "sum", gl_vat: "sum", diff_vat: "sum", pos_cash: "sum", gl_cash: "sum", diff_cash: "sum", pos_bank: "sum", gl_bank: "sum", diff_bank: "sum" };
      default: return undefined;
    }
  };

  const getDefaultSort = (): { key: string; dir: "asc" | "desc" }[] => {
    switch (reportKey) {
      case "ar-aging": case "ap-aging": return [{ key: "total", dir: "desc" }];
      case "daily-sales": return [{ key: "date", dir: "desc" }];
      case "cheques": return [{ key: "cheque_date", dir: "asc" }];
      case "inventory-valuation": return [{ key: "value", dir: "desc" }];
      case "by-customer": case "by-supplier": return [{ key: "total", dir: "desc" }];
      case "pos-cashier-performance": return [{ key: "total", dir: "desc" }];
      case "asset-register": return [{ key: "asset_number", dir: "asc" }];
      default: return [];
    }
  };

  // ── Fallback renderers for special layouts ──
  const monoClass = "font-mono text-xs";
  const thClass = "text-right px-3 py-3 font-semibold text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]";
  const tdClass = "px-3 py-2.5 text-sm";
  const trClass = "border-b border-border/30 hover:bg-accent/30 transition-colors";

  const renderCashFlow = () => (
    <div className="max-w-xl mx-auto space-y-3 py-4">
      {data.map((r, i) => <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${i === data.length - 1 ? "bg-primary/5 border-primary/30 font-bold" : "border-border/50"}`}>
        <span className="text-sm">{r.section}</span>
        <span className={`${monoClass} font-bold ${r.amount >= 0 ? "text-green-600" : "text-red-500"}`}>{r.amount < 0 ? `(${fmtAmt(r.amount)})` : fmtAmt(r.amount)}</span>
      </div>)}
    </div>
  );

  const renderKPIs = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
      {data.map((r, i) => <Card key={i} className="p-5 flex flex-col gap-2 border-border/50">
        <span className="text-xs text-muted-foreground">{r.label}</span>
        <span className="text-lg font-bold font-mono" style={{ color: r.color }}>{r.value}</span>
      </Card>)}
    </div>
  );

  const renderAccountMovement = () => {
    if (!data.length) return null;
    const opening = data[0]?.openingBalance ?? 0;
    const rows = data.slice(1);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/30 border border-border/50">
          <span className="text-sm text-muted-foreground">الرصيد الافتتاحي:</span>
          <span className={`${monoClass} font-bold`}>{fmtAmt(opening)}</span>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
          <th className={thClass}>التاريخ</th><th className={thClass}>البيان</th><th className={thClass}>وارد</th><th className={thClass}>صادر</th><th className={thClass}>الرصيد</th>
        </tr></thead><tbody>
          {rows.map((r: any, i: number) => <tr key={i} className={trClass}>
            <td className={`${tdClass} ${monoClass}`}>{r.date}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
            <td className={`${tdClass} ${monoClass} text-green-600`}>{r.inflow > 0 ? fmtAmt(r.inflow) : ""}</td>
            <td className={`${tdClass} ${monoClass} text-red-500`}>{r.outflow > 0 ? fmtAmt(r.outflow) : ""}</td>
            <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.balance)}</td>
          </tr>)}
        </tbody></table></div>
      </div>
    );
  };

  const renderForeignBalances = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الحساب</th><th className={thClass}>الكود</th><th className={thClass}>العملة</th><th className={thClass}>الرصيد</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.account}</td><td className={`${tdClass} ${monoClass}`}>{r.code}</td>
        <td className={tdClass}>{r.currency}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtNum(r.balance)}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderExchangeRates = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>العملة</th><th className={thClass}>شراء</th><th className={thClass}>بيع</th><th className={thClass}>متوسط</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.date}</td><td className={`${tdClass} font-medium`}>{r.currency} ({r.code})</td>
        <td className={`${tdClass} ${monoClass}`}>{r.buy?.toFixed(4) || "-"}</td><td className={`${tdClass} ${monoClass}`}>{r.sell?.toFixed(4) || "-"}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{r.mid?.toFixed(4) || "-"}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderCurrencyTransactions = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>البيان</th><th className={thClass}>المبلغ</th>
      {reportKey === "exchange-gain-loss" && <th className={thClass}>النوع</th>}
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.transaction_date || r.date}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.amount)}</td>
        {reportKey === "exchange-gain-loss" && <td className={tdClass}><span className={`px-2 py-1 rounded-full text-xs ${r.type === "ربح" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>{r.type}</span></td>}
      </tr>)}
    </tbody></table></div>
  );

  const renderPOSCashReconciliation = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>الكاشير</th><th className={thClass}>الافتتاحي</th><th className={thClass}>الختامي</th><th className={thClass}>المتوقع</th><th className={thClass}>الفرق</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.date}</td><td className={`${tdClass} font-medium`}>{r.cashier}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.opening)}</td><td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.closing)}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.expected)}</td>
        <td className={`${tdClass} ${monoClass} font-bold ${r.variance === 0 ? "text-green-600" : r.variance > 0 ? "text-yellow-600" : "text-red-600"}`}>
          {r.variance === 0 ? "متطابق" : r.variance > 0 ? `+${fmtNum(r.variance)}` : fmtNum(r.variance)}
        </td>
      </tr>)}
    </tbody></table></div>
  );

  const renderPOSPeakHours = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الساعة</th><th className={thClass}>اليوم</th><th className={thClass}>عدد الطلبات</th><th className={thClass}>الإجمالي</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.hour}:00</td><td className={tdClass}>{r.dayName}</td>
        <td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderDepreciation = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>رقم الأصل</th><th className={thClass}>الاسم</th><th className={thClass}>الفترة</th><th className={thClass}>الاستهلاك</th><th className={thClass}>المجمع</th><th className={thClass}>القيمة المتبقية</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.assetNumber}</td><td className={`${tdClass} font-medium`}>{r.assetName}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.period}</td><td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.amount)}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.accumulated)}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.nbv)}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderFullyDepreciated = () => (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">⚠️ هذه الأصول يجب مراجعتها للاستبعاد — القيمة الدفترية = صفر</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
        <th className={thClass}>رقم الأصل</th><th className={thClass}>الاسم</th><th className={thClass}>التكلفة الأصلية</th><th className={thClass}>تاريخ الشراء</th><th className={thClass}>الموقع</th>
      </tr></thead><tbody>
        {data.map((r: any, i) => <tr key={i} className={trClass}>
          <td className={`${tdClass} ${monoClass}`}>{r.asset_number}</td><td className={`${tdClass} font-medium`}>{r.name_ar}</td>
          <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.acquisition_cost || 0)}</td><td className={`${tdClass} ${monoClass}`}>{r.acquisition_date}</td>
          <td className={tdClass}>{r.location || "-"}</td>
        </tr>)}
      </tbody></table></div>
    </div>
  );

  const renderAssetDisposal = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الأصل</th><th className={thClass}>التاريخ</th><th className={thClass}>القيمة الدفترية</th><th className={thClass}>سعر البيع</th><th className={thClass}>الربح/الخسارة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.assetName} ({r.assetNumber})</td><td className={`${tdClass} ${monoClass}`}>{r.date}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.nbv)}</td><td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.proceeds)}</td>
        <td className={`${tdClass} ${monoClass} font-bold ${r.gainLoss >= 0 ? "text-green-600" : "text-red-500"}`}>{r.gainLoss < 0 ? `(${fmtAmt(r.gainLoss)})` : fmtAmt(r.gainLoss)}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderAssetsByLocation = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الموقع</th><th className={thClass}>عدد الأصول</th><th className={thClass}>إجمالي التكلفة</th><th className={thClass}>القيمة الدفترية</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.location}</td><td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.cost)}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.nbv)}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderSupplierComparison = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>المورد</th><th className={thClass}>البيان</th><th className={thClass}>المبلغ</th><th className={thClass}>التاريخ</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.supplier}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.amount)}</td><td className={`${tdClass} ${monoClass}`}>{r.date}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderDailyTotalsTable = () => {
    const isPurchases = reportKey === "total-purchases";
    const sum = (k: string) => data.reduce((s: number, r: any) => s + (Number(r[k]) || 0), 0);
    const countTotal = sum("count");
    const netTotal = sum("net");
    const vatTotal = sum("vat");
    const grossTotal = sum("total");
    const paidTotal = sum("paid");
    const remainingTotal = sum("remaining");
    const returnsNetTotal = sum("returns_net");
    return (
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
        <th className={thClass}>التاريخ</th>
        <th className={thClass}>العدد</th>
        <th className={thClass}>الصافي</th>
        <th className={thClass}>{isPurchases ? "ض.م المدخلات" : "ض.ق.م"}</th>
        <th className={thClass}>الإجمالي</th>
        <th className={thClass}>المدفوع</th>
        <th className={thClass}>المتبقي</th>
        <th className={thClass}>{isPurchases ? "مرتجعات (صافي)" : "مرتجعات (صافي)"}</th>
      </tr></thead><tbody>
        {data.map((r: any, i) => (
          <tr key={i} className={trClass}>
            <td className={`${tdClass} ${monoClass}`}>{r.date}</td>
            <td className={`${tdClass} text-center ${monoClass}`}>{r.count}</td>
            <td className={`${tdClass} ${monoClass} font-bold text-emerald-600`}>{fmtAmt(r.net)}</td>
            <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.vat)}</td>
            <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
            <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.paid)}</td>
            <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.remaining)}</td>
            <td className={`${tdClass} ${monoClass} text-destructive`}>{r.returns_net ? `(${fmtAmt(r.returns_net)})` : "—"}</td>
          </tr>
        ))}
        <tr className="bg-muted/40 border-t-2 border-foreground/30 font-bold">
          <td className={`${tdClass} font-bold`}>الإجمالي</td>
          <td className={`${tdClass} text-center ${monoClass} font-bold`}>{countTotal}</td>
          <td className={`${tdClass} ${monoClass} font-bold text-emerald-600`}>{fmtAmt(netTotal)}</td>
          <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(vatTotal)}</td>
          <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(grossTotal)}</td>
          <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(paidTotal)}</td>
          <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(remainingTotal)}</td>
          <td className={`${tdClass} ${monoClass} font-bold text-destructive`}>{returnsNetTotal ? `(${fmtAmt(returnsNetTotal)})` : "—"}</td>
        </tr>
      </tbody></table></div>
    );
  };

  const renderGenericTable = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>البيان</th><th className={thClass}>مدين</th><th className={thClass}>دائن</th><th className={thClass}>المبلغ</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{fmtDateDisplay(r.transaction_date)}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.debit_account_code}</td><td className={`${tdClass} ${monoClass}`}>{r.credit_account_code}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.amount || 0)}</td>
      </tr>)}
    </tbody></table></div>
  );

  // ── Main render ──
  const renderContent = () => {
    if (loading) return (
      <div className="space-y-3 py-8">
        {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />)}
      </div>
    );
    if (!data.length) return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4"><Search className="h-6 w-6 text-muted-foreground" /></div>
        <p className="text-sm font-medium text-foreground mb-1">لا توجد بيانات للفترة المحددة</p>
        <p className="text-xs text-muted-foreground">جرّب تغيير نطاق التاريخ أو الفلاتر</p>
      </div>
    );

    const cols = getReportColumns();
    if (cols) {
      return (
        <SortableReportTable
          columns={cols}
          data={data}
          totalsRow={getReportTotals()}
          reportTitle={config.title}
          reportSubtitle={config.description}
          storageKey={reportKey}
          defaultSort={getDefaultSort()}
          rowClassName={reportKey === "inventory-valuation"
            ? (row) => row.qty < 0 ? "!bg-red-50 dark:!bg-red-950/20" : ""
            : undefined}
        />
      );
    }

    switch (reportKey) {
      case "cash-flow": return renderCashFlow();
      case "financial-kpi": case "sales-performance": return renderKPIs();
      case "cash-movement": case "bank-movement": return renderAccountMovement();
      case "foreign-balances": return renderForeignBalances();
      case "exchange-rates": return renderExchangeRates();
      case "currency-conversions": case "exchange-gain-loss": return renderCurrencyTransactions();
      case "pos-cash-reconciliation": return renderPOSCashReconciliation();
      case "pos-peak-hours": return renderPOSPeakHours();
      case "monthly-depreciation": case "depreciation-schedule": return renderDepreciation();
      case "fully-depreciated": return renderFullyDepreciated();
      case "asset-disposal": return renderAssetDisposal();
      case "assets-by-location": return renderAssetsByLocation();
      case "supplier-comparison": return renderSupplierComparison();
      case "total-sales": case "total-purchases": return renderDailyTotalsTable();
      default: return renderGenericTable();
    }
  };

  const handleExportExcel = () => {
    exportToExcel(data, getReportColumns(), getReportTotals(), config.title, dateFrom, dateTo);
  };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{config.title}</h1>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5 text-xs">
            <FileSpreadsheet className="h-3.5 w-3.5" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />طباعة
          </Button>
        </div>
      </div>

      {/* Date filters */}
      <Card className="p-3 flex flex-wrap items-center gap-3 border-border/50">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
        </div>
        {showSourceFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">نوع العملية</span>
            <Select value={salesSource} onValueChange={(v) => setSalesSource(v as any)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="rep">مبيعات مندوب</SelectItem>
                <SelectItem value="pos">نقطة بيع</SelectItem>
                <SelectItem value="invoice">فواتير عادية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={loadReport} className="text-xs h-8">تحديث</Button>
        <Button
          variant={debugMode ? "default" : "ghost"}
          size="sm"
          onClick={toggleDebug}
          className="text-xs h-8 gap-1"
          title="تشغيل/إيقاف وضع التشخيص (يطبع تفاصيل المصدر والعدد في console المتصفح)"
        >
          <Bug className="h-3.5 w-3.5" />
          {debugMode ? "Debug ON" : "Debug"}
        </Button>
      </Card>

      {/* KPI Summary Cards for POS reports */}
      {!loading && data.length > 0 && reportKey.startsWith("pos-") && (() => {
        const kpis = getPOSKPIs(reportKey, data);
        if (!kpis.length) return null;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
            {kpis.map((kpi, i) => (
              <Card key={i} className="p-3 border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">{kpi.label}</p>
                <p className="text-lg font-bold font-mono text-foreground">{kpi.value}</p>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* Content */}
      <Card className="overflow-hidden border-border/50">
        {renderContent()}
      </Card>
    </div>
  );
};

export default GenericReportPage;

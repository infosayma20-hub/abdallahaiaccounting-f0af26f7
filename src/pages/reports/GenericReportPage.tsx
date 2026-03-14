import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInDays, getHours, getDay } from "date-fns";
import { ArrowRight, Download, Printer, CalendarDays, FileSpreadsheet, Filter, Search } from "lucide-react";
import SortableReportTable, { ColumnDef, TotalsConfig } from "@/components/reports/SortableReportTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { fmtDateDisplay } from "@/lib/utils";

interface GenericReportPageProps {
  reportKey: string;
}

const reportConfigs: Record<string, { title: string; description: string }> = {
  "ar-aging": { title: "أعمار الذمم المدينة", description: "أرصدة الزبائن المستحقة مصنفة حسب العمر" },
  "ap-aging": { title: "أعمار الذمم الدائنة", description: "أرصدة الموردين المستحقة مصنفة حسب العمر" },
  "cash-flow": { title: "التدفقات النقدية", description: "التدفقات التشغيلية والاستثمارية والتمويلية (IAS 7)" },
  "daily-sales": { title: "المبيعات اليومية", description: "ملخص المبيعات يوماً بيوم" },
  "sales-returns": { title: "مرتجعات المبيعات", description: "جميع مردودات المبيعات وإشعارات الدائن" },
  "sales-by-product": { title: "المبيعات حسب الصنف", description: "كمية وقيمة المبيعات لكل منتج" },
  "sales-performance": { title: "أداء المبيعات", description: "مؤشرات الأداء ونسبة النمو" },
  "purchase-returns": { title: "مرتجعات المشتريات", description: "مردودات الشراء وإشعارات المدين" },
  "supplier-comparison": { title: "مقارنة أسعار الموردين", description: "مقارنة أسعار نفس الصنف بين الموردين" },
  "dead-stock": { title: "أصناف راكدة", description: "منتجات بدون حركة لأكثر من 90 يوم" },
  "product-profitability": { title: "ربحية الأصناف", description: "هامش الربح لكل منتج" },
  "foreign-balances": { title: "أرصدة العملات الأجنبية", description: "الأرصدة بالعملة الأجنبية ومعادلها بالشيكل" },
  "exchange-gain-loss": { title: "أرباح وخسائر العملة", description: "فروقات محققة وغير محققة" },
  "order-performance": { title: "أداء المنتجات", description: "الأكثر طلباً والأكثر ربحية" },
  "financial-kpi": { title: "المؤشرات المالية", description: "نسب التداول والربحية والدوران" },
  "month-comparison": { title: "المقارنة الشهرية", description: "مقارنة الإيرادات والمصروفات شهر بشهر" },
  "cash-movement": { title: "حركة الصندوق", description: "جميع حركات النقد الوارد والصادر من الصندوق" },
  "bank-movement": { title: "حركة البنوك", description: "حركات الحسابات البنكية" },
  "cheques": { title: "تقرير الشيكات", description: "شيكات واردة وصادرة ومستحقة مع الحالة" },
  "total-sales": { title: "المبيعات الإجمالية", description: "إجمالي المبيعات حسب الفترة" },
  "invoice-register": { title: "سجل الفواتير", description: "جميع فواتير البيع مع حالة الدفع" },
  "by-customer": { title: "المبيعات حسب الزبون", description: "تحليل مبيعات كل زبون" },
  "collections": { title: "التحصيلات", description: "المبالغ المحصلة من الزبائن" },
  "total-purchases": { title: "المشتريات الإجمالية", description: "إجمالي المشتريات حسب الفترة" },
  "purchase-invoice-register": { title: "فواتير المشتريات", description: "سجل فواتير الشراء" },
  "by-supplier": { title: "المشتريات حسب المورد", description: "تحليل مشتريات كل مورد" },
  "supplier-payments": { title: "المدفوعات للموردين", description: "جميع المبالغ المدفوعة" },
  "inventory-valuation": { title: "جرد وتقييم المخزون", description: "الكميات والقيم الحالية لجميع الأصناف" },
  "stock-movement": { title: "حركة المخزون", description: "حركات الوارد والصادر" },
  "below-reorder": { title: "أصناف تحت الحد الأدنى", description: "منتجات تحتاج إعادة طلب" },
  "employee-directory": { title: "بيانات الموظفين", description: "دليل شامل لجميع الموظفين" },
  "asset-register": { title: "سجل الأصول الثابتة", description: "جميع الأصول مع القيمة الدفترية" },
  "monthly-depreciation": { title: "الاستهلاك الشهري", description: "قيمة الاستهلاك المحسوبة لكل أصل" },
  "depreciation-schedule": { title: "جدول الاستهلاك التفصيلي", description: "جدول زمني كامل لاستهلاك كل أصل" },
  "fully-depreciated": { title: "أصول مستهلكة بالكامل", description: "أصول وصلت لنهاية عمرها الإنتاجي" },
  "asset-disposal": { title: "أرباح وخسائر بيع الأصول", description: "عمليات الاستبعاد والبيع" },
  "assets-by-location": { title: "الأصول حسب الموقع", description: "تجميع حسب الفرع والقسم" },
  "exchange-rates": { title: "أسعار الصرف", description: "تاريخ أسعار الصرف" },
  "currency-conversions": { title: "تحويلات العملات", description: "عمليات تحويل العملات" },
  "all-orders": { title: "تقرير الطلبات", description: "جميع الطلبات مع حالتها" },
  "pos-daily-sales": { title: "مبيعات نقطة البيع اليومية", description: "مبيعات POS حسب الكاشير" },
  "pos-sales-by-category": { title: "مبيعات حسب الفئة والصنف", description: "تحليل المبيعات حسب فئة المنتج" },
  "pos-period-comparison": { title: "مقارنة زمنية للمبيعات", description: "مقارنة يومية / أسبوعية / شهرية" },
  "pos-invoice-register": { title: "كشف فواتير POS", description: "جميع فواتير نقطة البيع مع التفاصيل" },
  "pos-pending-orders": { title: "فواتير معلقة", description: "الطلبات المفتوحة غير المكتملة" },
  "pos-invoice-timing": { title: "كشف أوقات الفواتير", description: "مدة الخدمة لكل فاتورة من الفتح للإغلاق" },
  "pos-shift-open-close": { title: "تقرير فتح/إغلاق الصندوق", description: "أوقات فتح وإغلاق الورديات" },
  "pos-payment-methods": { title: "طرق الدفع", description: "توزيع المبيعات حسب طريقة الدفع" },
  "pos-credit-sales": { title: "بطاقات الائتمان والمديونيات", description: "المبيعات الآجلة ومديونيات العملاء" },
  "pos-product-movement": { title: "حركة أصناف POS", description: "الكميات المباعة والمرتجعة لكل صنف" },
  "pos-category-totals": { title: "مجاميع حركات الأصناف", description: "إجماليات المبيعات حسب الفئة" },
  "pos-cash-reconciliation": { title: "تسوية الصندوق", description: "المتوقع مقابل الفعلي" },
  "pos-cashier-performance": { title: "أداء الكاشيرين", description: "أداء كل كاشير بالأرقام" },
  "pos-cancelled": { title: "الفواتير الملغية", description: "الفواتير الملغاة مع الأسباب" },
  "pos-peak-hours": { title: "ساعات الذروة", description: "توزيع المبيعات حسب الساعة" },
  // Receivables & Payables reports
  "ar-aging-detail": { title: "تعمير ذمم الزبائن", description: "تصنيف جميع الذمم المستحقة من الزبائن حسب عمر الدين" },
  "dso-report": { title: "أيام التحصيل والأداء (DSO)", description: "متوسط أيام التحصيل لكل زبون مع التصنيف" },
  "checks-receivable": { title: "تقرير الشيكات الواردة", description: "شيكات الزبائن مصنفة حسب الحالة والاستحقاق" },
  "customer-profitability": { title: "ربحية الزبائن", description: "المبيعات والهوامش لكل زبون" },
  "customer-statement-all": { title: "كشف حساب موحد للزبائن", description: "كشف حساب شامل لجميع الزبائن" },
  "ap-aging-detail": { title: "تعمير ذمم الموردين", description: "المبالغ المستحقة للموردين حسب عمر الدين" },
  "dpo-report": { title: "أيام سداد الموردين (DPO)", description: "متوسط أيام السداد لكل مورد" },
  "checks-payable": { title: "تقرير الشيكات الصادرة", description: "شيكات الموردين مع تواريخ الاستحقاق" },
  "supplier-purchase-analysis": { title: "تحليل المشتريات والموردين", description: "حجم المشتريات من كل مورد" },
  "supplier-statement-all": { title: "كشف حساب موحد للموردين", description: "كشف حساب شامل لجميع الموردين" },
  // Invoice Tracking & Collection
  "invoice-lifecycle": { title: "دورة حياة الفاتورة", description: "تتبع كل فاتورة من الإنشاء حتى الإغلاق" },
  "dso-detailed": { title: "متوسط أيام التحصيل (DSO) المتقدم", description: "كم يوماً يستغرق كل زبون للسداد" },
  "ar-aging-advanced": { title: "تعمير الذمم المدينة المتقدم", description: "توزيع الذمم على شرائح زمنية مع تفصيل كل فاتورة" },
  "collection-efficiency": { title: "كفاءة التحصيل", description: "نسبة الفواتير المسدّدة في موعدها وتطورها شهرياً" },
  "payment-allocation": { title: "سجل المدفوعات المرتبطة", description: "كل سند قبض مرتبط بأي فاتورة وبأي مبلغ" },
  "unpaid-invoices": { title: "فواتير بدون نشاط دفع", description: "فواتير لم يُسجَّل عليها أي سند قبض" },
};

// ─── Helpers ───
const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmt = (n: number) => `₪${fmtNum(Math.abs(n))}`;

const GenericReportPage = ({ reportKey }: GenericReportPageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const config = reportConfigs[reportKey] || { title: "تقرير", description: "" };
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);

  // Get team owner for multi-tenant
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => setOwnerId(data || user!.id));
  }, [user]);

  useEffect(() => {
    if (ownerId) loadReport();
  }, [ownerId, dateFrom, dateTo, reportKey]);

  const uid = ownerId || user?.id || "";

  const loadReport = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      switch (reportKey) {
        case "ar-aging": case "ap-aging": await loadAgingReport(reportKey === "ar-aging" ? "عميل" : "مورد"); break;
        case "cash-flow": await loadCashFlowReport(); break;
        case "daily-sales": await loadDailySalesReport(); break;
        case "sales-by-product": case "order-performance": await loadSalesByProductReport(); break;
        case "dead-stock": await loadDeadStockReport(); break;
        case "product-profitability": await loadProductProfitability(); break;
        case "financial-kpi": await loadFinancialKPIs(); break;
        case "month-comparison": await loadMonthComparison(); break;
        case "foreign-balances": await loadForeignBalances(); break;
        case "cash-movement": await loadAccountMovement("1110"); break;
        case "bank-movement": await loadAccountMovement("1120"); break;
        case "cheques": await loadChequesReport(); break;
        case "total-sales": await loadTotalSales(); break;
        case "invoice-register": await loadInvoiceRegister(); break;
        case "by-customer": await loadByCustomer(); break;
        case "collections": await loadCollections(); break;
        case "sales-returns": await loadSalesReturns(); break;
        case "sales-performance": await loadSalesPerformance(); break;
        case "total-purchases": await loadTotalPurchases(); break;
        case "purchase-invoice-register": await loadPurchaseInvoiceRegister(); break;
        case "by-supplier": await loadBySupplier(); break;
        case "supplier-payments": await loadSupplierPayments(); break;
        case "purchase-returns": await loadPurchaseReturns(); break;
        case "supplier-comparison": await loadSupplierComparison(); break;
        case "inventory-valuation": await loadInventoryValuation(); break;
        case "stock-movement": await loadStockMovement(); break;
        case "below-reorder": await loadBelowReorder(); break;
        case "employee-directory": await loadEmployeeDirectory(); break;
        case "asset-register": await loadAssetRegister(); break;
        case "monthly-depreciation": await loadMonthlyDepreciation(); break;
        case "depreciation-schedule": await loadDepreciationSchedule(); break;
        case "fully-depreciated": await loadFullyDepreciated(); break;
        case "asset-disposal": await loadAssetDisposal(); break;
        case "assets-by-location": await loadAssetsByLocation(); break;
        case "exchange-rates": await loadExchangeRates(); break;
        case "currency-conversions": await loadCurrencyConversions(); break;
        case "exchange-gain-loss": await loadExchangeGainLoss(); break;
        case "all-orders": await loadAllOrders(); break;
        case "pos-daily-sales": await loadPOSDailySales(); break;
        case "pos-sales-by-category": await loadPOSSalesByCategory(); break;
        case "pos-period-comparison": await loadPOSPeriodComparison(); break;
        case "pos-invoice-register": await loadPOSInvoiceRegister(); break;
        case "pos-pending-orders": await loadPOSPendingOrders(); break;
        case "pos-invoice-timing": await loadPOSInvoiceTiming(); break;
        case "pos-shift-open-close": await loadPOSShiftOpenClose(); break;
        case "pos-payment-methods": await loadPOSPaymentMethods(); break;
        case "pos-credit-sales": await loadPOSCreditSales(); break;
        case "pos-product-movement": await loadPOSProductMovement(); break;
        case "pos-category-totals": await loadPOSCategoryTotals(); break;
        case "pos-cash-reconciliation": await loadPOSCashReconciliation(); break;
        case "pos-cashier-performance": await loadPOSCashierPerformance(); break;
        case "pos-cancelled": await loadPOSCancelled(); break;
        case "pos-peak-hours": await loadPOSPeakHours(); break;
        // Receivables & Payables
        case "ar-aging-detail": await loadARAgingDetail(); break;
        case "dso-report": await loadDSOReport(); break;
        case "checks-receivable": await loadChecksReceivable(); break;
        case "customer-profitability": await loadCustomerProfitability(); break;
        case "customer-statement-all": await loadCustomerStatementAll(); break;
        case "ap-aging-detail": await loadAPAgingDetail(); break;
        case "dpo-report": await loadDPOReport(); break;
        case "checks-payable": await loadChecksPayable(); break;
        case "supplier-purchase-analysis": await loadSupplierPurchaseAnalysis(); break;
        case "supplier-statement-all": await loadSupplierStatementAll(); break;
        // Invoice Tracking
        case "invoice-lifecycle": await loadInvoiceLifecycle(); break;
        case "dso-detailed": await loadDSODetailed(); break;
        case "ar-aging-advanced": await loadARAgingAdvanced(); break;
        case "collection-efficiency": await loadCollectionEfficiency(); break;
        case "payment-allocation": await loadPaymentAllocation(); break;
        case "unpaid-invoices": await loadUnpaidInvoices(); break;
        default: await loadGenericTransactions(); break;
      }
    } catch (e: any) {
      console.error(e);
      toast.error("حدث خطأ أثناء تحميل التقرير");
    }
    setLoading(false);
  };

  // ═══════════════════════════════════
  // DATA LOADERS
  // ═══════════════════════════════════

  const loadAgingReport = async (contactType: string) => {
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name, current_balance, contact_class, last_transaction_date").eq("user_id", uid).eq("contact_type", contactType).gt("current_balance", 0);
    if (!contacts?.length) { setData([]); return; }
    const today = new Date();
    setData(contacts.map(c => {
      const days = c.last_transaction_date ? differenceInDays(today, new Date(c.last_transaction_date)) : 999;
      return {
        name: c.contact_name, cls: c.contact_class || "-",
        current: days <= 0 ? c.current_balance : 0,
        d30: days > 0 && days <= 30 ? c.current_balance : 0,
        d60: days > 30 && days <= 60 ? c.current_balance : 0,
        d90: days > 60 && days <= 90 ? c.current_balance : 0,
        over90: days > 90 ? c.current_balance : 0,
        total: c.current_balance || 0,
      };
    }).sort((a, b) => b.total - a.total));
  };

  const loadCashFlowReport = async () => {
    const { data: txns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    if (!txns?.length) { setData([]); return; }
    let operating = 0, investing = 0, financing = 0;
    txns.forEach(tx => {
      const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
      if (dc.startsWith("4") || cc.startsWith("4") || dc.startsWith("5") || cc.startsWith("5")) {
        if (cc.startsWith("4")) operating += tx.amount; else if (dc.startsWith("5")) operating -= tx.amount; else operating += tx.amount;
      } else if (dc.startsWith("12") || cc.startsWith("12")) {
        if (dc.startsWith("12")) investing -= tx.amount; else investing += tx.amount;
      } else if (dc.startsWith("3") || cc.startsWith("3") || dc.startsWith("22") || cc.startsWith("22")) {
        if (cc.startsWith("3") || cc.startsWith("22")) financing += tx.amount; else financing -= tx.amount;
      }
    });
    setData([
      { section: "أنشطة تشغيلية", amount: operating },
      { section: "أنشطة استثمارية", amount: investing },
      { section: "أنشطة تمويلية", amount: financing },
      { section: "صافي التغير في النقد", amount: operating + investing + financing },
    ]);
  };

  const loadAccountMovement = async (accountCode: string) => {
    // Opening balance
    const { data: openTxns } = await supabase.from("transactions").select("amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).lt("transaction_date", dateFrom).or(`debit_account_code.eq.${accountCode},credit_account_code.eq.${accountCode}`);
    let openBal = 0;
    (openTxns || []).forEach(tx => { if (tx.debit_account_code === accountCode) openBal += tx.amount; if (tx.credit_account_code === accountCode) openBal -= tx.amount; });

    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or(`debit_account_code.eq.${accountCode},credit_account_code.eq.${accountCode}`).order("transaction_date", { ascending: true });

    let running = openBal;
    const rows = (txns || []).map(tx => {
      const inflow = tx.debit_account_code === accountCode ? tx.amount : 0;
      const outflow = tx.credit_account_code === accountCode ? tx.amount : 0;
      running += inflow - outflow;
      return { date: tx.transaction_date, description: tx.description, inflow, outflow, balance: running, ref: tx.reference };
    });
    setData([{ openingBalance: openBal }, ...rows]);
  };

  const loadChequesReport = async () => {
    const { data: cheques } = await supabase.from("cheques").select("*").eq("user_id", uid).gte("cheque_date", dateFrom).lte("cheque_date", dateTo).order("cheque_date", { ascending: false });
    setData(cheques || []);
  };

  const loadTotalSales = async () => {
    const { data: txns } = await supabase.from("transactions").select("transaction_date, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
    const dayMap: Record<string, { date: string; count: number; total: number }> = {};
    (txns || []).forEach(tx => { const d = tx.transaction_date; if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0 }; dayMap[d].count++; dayMap[d].total += tx.amount; });
    setData(Object.values(dayMap));
  };

  const loadDailySalesReport = async () => {
    const { data: txns } = await supabase.from("transactions").select("transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
    const dayMap: Record<string, { date: string; count: number; sales: number; returns: number }> = {};
    (txns || []).forEach(tx => {
      const d = tx.transaction_date;
      if (!dayMap[d]) dayMap[d] = { date: d, count: 0, sales: 0, returns: 0 };
      if (tx.transaction_type?.startsWith("sale") || tx.transaction_type === "pos_sale") { dayMap[d].count++; dayMap[d].sales += tx.amount; }
      if (tx.transaction_type === "return") dayMap[d].returns += tx.amount;
    });
    setData(Object.values(dayMap).map(d => ({ ...d, net: d.sales - d.returns })));
  };

  const loadInvoiceRegister = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, transaction_type, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadByCustomer = async () => {
    const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name, contact_class").eq("user_id", uid).eq("contact_type", "عميل");
    const cMap = new Map((contacts || []).map(c => [c.id, c]));
    const custMap: Record<string, { name: string; cls: string; count: number; total: number; lastDate: string }> = {};
    (txns || []).forEach(tx => {
      if (!tx.contact_id) return;
      const c = cMap.get(tx.contact_id);
      const key = tx.contact_id;
      if (!custMap[key]) custMap[key] = { name: c?.contact_name || "غير محدد", cls: c?.contact_class || "-", count: 0, total: 0, lastDate: "" };
      custMap[key].count++; custMap[key].total += tx.amount;
      if (tx.transaction_date > custMap[key].lastDate) custMap[key].lastDate = tx.transaction_date;
    });
    setData(Object.values(custMap).sort((a, b) => b.total - a.total));
  };

  const loadCollections = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "receipt").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadSalesReturns = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("transaction_type.eq.return,description.ilike.%مرتجع%").order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadSalesPerformance = async () => {
    const { data: txns } = await supabase.from("transactions").select("amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    // Previous period
    const daysDiff = differenceInDays(new Date(dateTo), new Date(dateFrom));
    const prevFrom = format(subDays(new Date(dateFrom), daysDiff + 1), "yyyy-MM-dd");
    const prevTo = format(subDays(new Date(dateFrom), 1), "yyyy-MM-dd");
    const { data: prevTxns } = await supabase.from("transactions").select("amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", prevFrom).lte("transaction_date", prevTo);

    const total = (txns || []).reduce((s, t) => s + t.amount, 0);
    const prevTotal = (prevTxns || []).reduce((s, t) => s + t.amount, 0);
    const growth = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : 0;
    const count = (txns || []).length;
    const avgTicket = count > 0 ? total / count : 0;
    const dayMap: Record<string, number> = {};
    (txns || []).forEach(t => { dayMap[t.transaction_date] = (dayMap[t.transaction_date] || 0) + t.amount; });
    const bestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];

    setData([
      { label: "إجمالي المبيعات", value: fmtAmt(total), color: "#059669" },
      { label: "عدد الفواتير", value: count.toString(), color: "#0070F2" },
      { label: "متوسط قيمة الفاتورة", value: fmtAmt(avgTicket), color: "#6366F1" },
      { label: "معدل النمو", value: `${growth.toFixed(1)}%`, color: growth >= 0 ? "#059669" : "#DC2626" },
      { label: "أعلى يوم مبيعات", value: bestDay ? `${bestDay[0]}: ${fmtAmt(bestDay[1])}` : "-", color: "#C9A84C" },
      { label: "مبيعات الفترة السابقة", value: fmtAmt(prevTotal), color: "#8B9BB4" },
    ]);
  };

  const loadSalesByProductReport = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    if (!orders?.length) { setData([]); return; }
    const orderIds = orders.map(o => o.id);
    const { data: lines } = await supabase.from("pos_order_lines").select("product_name, qty, total, cost_price, order_id").in("order_id", orderIds);
    const pm: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
    (lines || []).forEach(l => {
      if (!pm[l.product_name]) pm[l.product_name] = { name: l.product_name, qty: 0, revenue: 0, cost: 0 };
      pm[l.product_name].qty += l.qty; pm[l.product_name].revenue += l.total; pm[l.product_name].cost += (l.cost_price || 0) * l.qty;
    });
    setData(Object.values(pm).sort((a, b) => b.revenue - a.revenue));
  };

  const loadDeadStockReport = async () => {
    const { data: products } = await supabase.from("products").select("id, name, quantity, buy_price").eq("user_id", uid);
    // Get last sale date from POS
    const { data: lastSales } = await supabase.from("pos_order_lines").select("product_id, order_id").eq("user_id", uid);
    const { data: paidOrders } = await supabase.from("pos_orders").select("id, created_at").eq("user_id", uid).eq("state", "paid");
    const orderDateMap = new Map((paidOrders || []).map(o => [o.id, o.created_at]));
    const productLastSale: Record<string, string> = {};
    (lastSales || []).forEach(l => {
      if (!l.product_id) return;
      const d = orderDateMap.get(l.order_id);
      if (d && (!productLastSale[l.product_id] || d > productLastSale[l.product_id])) productLastSale[l.product_id] = d;
    });
    const today = new Date();
    setData((products || []).map(p => {
      const lastSaleDate = productLastSale[p.id];
      const days = lastSaleDate ? differenceInDays(today, new Date(lastSaleDate)) : 999;
      return { name: p.name, qty: p.quantity || 0, value: (p.quantity || 0) * (p.buy_price || 0), lastMove: lastSaleDate || null, days };
    }).filter(p => p.days >= 90 && p.qty > 0).sort((a, b) => b.value - a.value));
  };

  const loadProductProfitability = async () => {
    const { data: products } = await supabase.from("products").select("id, name, buy_price, sell_price, quantity").eq("user_id", uid);
    setData((products || []).map(p => ({
      name: p.name, buyPrice: p.buy_price || 0, sellPrice: p.sell_price || 0,
      margin: p.sell_price && p.buy_price ? ((p.sell_price - p.buy_price) / p.sell_price * 100) : 0,
      profit: (p.sell_price || 0) - (p.buy_price || 0), stock: p.quantity || 0,
    })).sort((a, b) => b.margin - a.margin));
  };

  const loadFinancialKPIs = async () => {
    const { data: txns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    let revenue = 0, cogs = 0, expenses = 0;
    (txns || []).forEach(tx => {
      const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
      if (cc.startsWith("4")) revenue += tx.amount;
      if (dc.startsWith("51")) cogs += tx.amount;
      if (dc.startsWith("5") && !dc.startsWith("51")) expenses += tx.amount;
    });
    const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue * 100) : 0;
    const netMargin = revenue > 0 ? ((revenue - cogs - expenses) / revenue * 100) : 0;
    setData([
      { label: "إجمالي الإيرادات", value: fmtAmt(revenue), color: "#059669" },
      { label: "هامش الربح الإجمالي", value: `${grossMargin.toFixed(1)}%`, color: grossMargin >= 30 ? "#059669" : grossMargin >= 15 ? "#C9A84C" : "#DC2626" },
      { label: "هامش الربح الصافي", value: `${netMargin.toFixed(1)}%`, color: netMargin >= 10 ? "#059669" : netMargin >= 5 ? "#C9A84C" : "#DC2626" },
      { label: "صافي الربح", value: fmtAmt(revenue - cogs - expenses), color: revenue - cogs - expenses >= 0 ? "#059669" : "#DC2626" },
      { label: "تكلفة المبيعات", value: fmtAmt(cogs), color: "#6366F1" },
      { label: "المصروفات التشغيلية", value: fmtAmt(expenses), color: "#DC2626" },
    ]);
  };

  const loadMonthComparison = async () => {
    const months = [];
    for (let i = 5; i >= 0; i--) { const m = subMonths(new Date(), i); months.push({ label: format(m, "yyyy-MM"), from: format(startOfMonth(m), "yyyy-MM-dd"), to: format(endOfMonth(m), "yyyy-MM-dd") }); }
    const { data: txns } = await supabase.from("transactions").select("transaction_date, debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", months[0].from).lte("transaction_date", months[5].to);
    setData(months.map(m => {
      let rev = 0, exp = 0;
      (txns || []).forEach(tx => { if (tx.transaction_date >= m.from && tx.transaction_date <= m.to) { if ((tx.credit_account_code || "").startsWith("4")) rev += tx.amount; if ((tx.debit_account_code || "").startsWith("5")) exp += tx.amount; } });
      return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp };
    }));
  };

  const loadForeignBalances = async () => {
    const { data: accounts } = await supabase.from("accounts").select("account_code, account_name").eq("user_id", uid).in("account_code", ["1111", "1112", "1113", "1114"]);
    if (!accounts?.length) { setData([]); return; }
    const result = [];
    for (const acc of accounts) {
      const { data: txns } = await supabase.from("transactions").select("amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).or(`debit_account_code.eq.${acc.account_code},credit_account_code.eq.${acc.account_code}`);
      let balance = 0;
      (txns || []).forEach(tx => { if (tx.debit_account_code === acc.account_code) balance += tx.amount; if (tx.credit_account_code === acc.account_code) balance -= tx.amount; });
      const currencyMap: Record<string, string> = { "1111": "USD", "1112": "JOD", "1113": "EUR", "1114": "EGP" };
      result.push({ account: acc.account_name, code: acc.account_code, currency: currencyMap[acc.account_code] || "—", balance });
    }
    setData(result);
  };

  const loadTotalPurchases = async () => {
    const { data: txns } = await supabase.from("transactions").select("transaction_date, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
    const dayMap: Record<string, { date: string; count: number; total: number }> = {};
    (txns || []).forEach(tx => { const d = tx.transaction_date; if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0 }; dayMap[d].count++; dayMap[d].total += tx.amount; });
    setData(Object.values(dayMap));
  };

  const loadPurchaseInvoiceRegister = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, transaction_type, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadBySupplier = async () => {
    const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
    const cMap = new Map((contacts || []).map(c => [c.id, c.contact_name]));
    const supMap: Record<string, { name: string; count: number; total: number }> = {};
    (txns || []).forEach(tx => {
      if (!tx.contact_id) return;
      const key = tx.contact_id;
      if (!supMap[key]) supMap[key] = { name: cMap.get(key) || "غير محدد", count: 0, total: 0 };
      supMap[key].count++; supMap[key].total += tx.amount;
    });
    setData(Object.values(supMap).sort((a, b) => b.total - a.total));
  };

  const loadSupplierPayments = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "payment").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadPurchaseReturns = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("transaction_type.eq.purchase_return,description.ilike.%مرتجع مشتريات%").order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadSupplierComparison = async () => {
    // Approximate from transactions grouped by contact + description
    const { data: txns } = await supabase.from("transactions").select("description, amount, contact_id, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
    const cMap = new Map((contacts || []).map(c => [c.id, c.contact_name]));
    setData((txns || []).map(tx => ({
      supplier: cMap.get(tx.contact_id || "") || "غير محدد",
      description: tx.description, amount: tx.amount, date: tx.transaction_date,
    })).sort((a, b) => a.description.localeCompare(b.description)));
  };

  const loadInventoryValuation = async () => {
    const { data: products } = await supabase.from("products").select("name, quantity, buy_price, sell_price, category").eq("user_id", uid).order("name");
    const totalValue = (products || []).reduce((s, p) => s + (p.quantity || 0) * (p.buy_price || 0), 0);
    setData((products || []).map(p => ({
      name: p.name, qty: p.quantity || 0, cost: p.buy_price || 0, sellPrice: p.sell_price || 0,
      value: (p.quantity || 0) * (p.buy_price || 0), pct: totalValue > 0 ? ((p.quantity || 0) * (p.buy_price || 0)) / totalValue * 100 : 0,
      category: p.category || "-",
    })));
  };

  const loadStockMovement = async () => {
    // POS sales movements
    const { data: orders } = await supabase.from("pos_orders").select("id, created_at, order_number").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false }).limit(500);
    const orderIds = (orders || []).map(o => o.id);
    const { data: lines } = orderIds.length ? await supabase.from("pos_order_lines").select("product_name, qty, order_id").in("order_id", orderIds) : { data: [] };
    const orderMap = new Map((orders || []).map(o => [o.id, o]));
    setData((lines || []).map(l => {
      const o = orderMap.get(l.order_id);
      return { date: o?.created_at?.split("T")[0] || "", product: l.product_name, type: "بيع", qty: -l.qty, ref: o?.order_number || "" };
    }));
  };

  const loadBelowReorder = async () => {
    const { data: products } = await supabase.from("products").select("name, quantity, min_quantity, buy_price").eq("user_id", uid);
    setData((products || []).filter(p => (p.quantity || 0) < (p.min_quantity || 0)).map(p => ({
      name: p.name, qty: p.quantity || 0, min: p.min_quantity || 0, shortage: (p.min_quantity || 0) - (p.quantity || 0),
      cost: p.buy_price || 0, reorderCost: ((p.min_quantity || 0) - (p.quantity || 0)) * (p.buy_price || 0),
    })).sort((a, b) => b.shortage - a.shortage));
  };

  const loadEmployeeDirectory = async () => {
    const { data: emps } = await supabase.from("employees").select("id, full_name, department, job_title, hire_date, salary, employment_status").eq("user_id", uid).order("department");
    setData(emps || []);
  };

  const loadAssetRegister = async () => {
    const { data: assets } = await supabase.from("assets").select("asset_number, name_ar, acquisition_cost, accumulated_depreciation, net_book_value, status, location, acquisition_date").eq("user_id", uid).order("asset_number");
    setData(assets || []);
  };

  const loadMonthlyDepreciation = async () => {
    const { data: entries } = await supabase.from("asset_depreciation_entries").select("*, assets(asset_number, name_ar)").eq("user_id", uid).gte("period_start", dateFrom).lte("period_end", dateTo).order("period_start");
    setData((entries || []).map((e: any) => ({
      assetNumber: e.assets?.asset_number || "", assetName: e.assets?.name_ar || "",
      amount: e.depreciation_amount, accumulated: e.accumulated_total, nbv: e.net_book_value, method: e.method_used || "-", period: e.period_start,
    })));
  };

  const loadDepreciationSchedule = async () => {
    const { data: entries } = await supabase.from("asset_depreciation_entries").select("*, assets(asset_number, name_ar, acquisition_cost, useful_life_years)").eq("user_id", uid).order("period_start");
    setData((entries || []).map((e: any) => ({
      assetNumber: e.assets?.asset_number || "", assetName: e.assets?.name_ar || "",
      originalCost: e.assets?.acquisition_cost || 0, amount: e.depreciation_amount,
      accumulated: e.accumulated_total, nbv: e.net_book_value, period: e.period_start,
    })));
  };

  const loadFullyDepreciated = async () => {
    const { data: assets } = await supabase.from("assets").select("asset_number, name_ar, acquisition_cost, acquisition_date, net_book_value, status, location").eq("user_id", uid).eq("status", "active").lte("net_book_value", 0).order("acquisition_cost", { ascending: false });
    setData(assets || []);
  };

  const loadAssetDisposal = async () => {
    const { data: disposals } = await supabase.from("asset_disposals").select("*, assets(asset_number, name_ar)").eq("user_id", uid).gte("disposal_date", dateFrom).lte("disposal_date", dateTo).order("disposal_date", { ascending: false });
    setData((disposals || []).map((d: any) => ({
      assetNumber: d.assets?.asset_number || "", assetName: d.assets?.name_ar || "",
      date: d.disposal_date, nbv: d.net_book_value_at_disposal || 0, proceeds: d.disposal_proceeds || 0,
      gainLoss: (d.disposal_proceeds || 0) - (d.net_book_value_at_disposal || 0), method: d.disposal_method,
    })));
  };

  const loadAssetsByLocation = async () => {
    const { data: assets } = await supabase.from("assets").select("location, acquisition_cost, net_book_value, branch_id").eq("user_id", uid).eq("status", "active");
    const locMap: Record<string, { location: string; count: number; cost: number; nbv: number }> = {};
    (assets || []).forEach(a => {
      const loc = a.location || "غير محدد";
      if (!locMap[loc]) locMap[loc] = { location: loc, count: 0, cost: 0, nbv: 0 };
      locMap[loc].count++; locMap[loc].cost += a.acquisition_cost || 0; locMap[loc].nbv += a.net_book_value || 0;
    });
    setData(Object.values(locMap).sort((a, b) => b.cost - a.cost));
  };

  const loadExchangeRates = async () => {
    const { data: rates } = await supabase.from("exchange_rates").select("*, currencies(code, name_ar, symbol)").gte("rate_date", dateFrom).lte("rate_date", dateTo).order("rate_date", { ascending: false });
    setData((rates || []).map((r: any) => ({
      date: r.rate_date, currency: r.currencies?.name_ar || "", code: r.currencies?.code || "",
      buy: r.buy_rate, sell: r.sell_rate, mid: r.mid_rate,
    })));
  };

  const loadCurrencyConversions = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, reference").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "exchange_diff").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
    setData(txns || []);
  };

  const loadExchangeGainLoss = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("debit_account_code.eq.7100,credit_account_code.eq.7100").order("transaction_date", { ascending: false });
    setData((txns || []).map(tx => ({
      date: tx.transaction_date, description: tx.description, amount: tx.amount,
      type: tx.credit_account_code === "7100" ? "خسارة" : "ربح",
    })));
  };

  const loadAllOrders = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, customer_name, total, state").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
    setData(orders || []);
  };

  const loadPOSDailySales = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, session_id, customer_name, discount_amount, payment_currency, currency").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
    const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
    setData((orders || []).map(o => ({
      order_number: o.order_number || "—",
      date: o.created_at.split("T")[0],
      time: o.created_at.split("T")[1]?.substring(0, 5) || "",
      cashier: sessMap.get(o.session_id) || "غير محدد",
      customer_name: o.customer_name || "—",
      currency: o.payment_currency || o.currency || "ILS",
      discount: o.discount_amount || 0,
      total: o.total,
    })));
  };

  const loadPOSCashReconciliation = async () => {
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_variance, state").eq("user_id", uid).eq("is_deleted", false).gte("opened_at", dateFrom).lte("opened_at", dateTo + "T23:59:59").order("opened_at", { ascending: false });
    setData((sessions || []).map(s => ({
      date: s.opened_at?.split("T")[0] || "", cashier: s.cashier_name || "غير محدد",
      opening: s.opening_cash || 0, closing: s.closing_cash || 0,
      expected: s.expected_cash || 0, variance: s.cash_variance || 0,
      state: s.state,
    })));
  };

  const loadPOSCashierPerformance = async () => {
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid).eq("is_deleted", false).gte("opened_at", dateFrom).lte("opened_at", dateTo + "T23:59:59");
    const sessIds = (sessions || []).map(s => s.id);
    if (!sessIds.length) { setData([]); return; }
    const { data: orders } = await supabase.from("pos_orders").select("id, total, state, session_id").eq("user_id", uid).in("session_id", sessIds);
    const cashierMap: Record<string, { name: string; count: number; total: number; cancelled: number }> = {};
    const sessNameMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
    (orders || []).forEach(o => {
      const name = sessNameMap.get(o.session_id) || "غير محدد";
      if (!cashierMap[name]) cashierMap[name] = { name, count: 0, total: 0, cancelled: 0 };
      if (o.state === "paid") { cashierMap[name].count++; cashierMap[name].total += o.total; }
      if (o.state === "cancelled") cashierMap[name].cancelled++;
    });
    setData(Object.values(cashierMap).sort((a, b) => b.total - a.total));
  };

  const loadPOSCancelled = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, customer_name, total, state, return_reason").eq("user_id", uid).in("state", ["cancelled"]).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
    setData(orders || []);
  };

  const loadPOSPeakHours = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("created_at, total").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    const heatmap: Record<string, { hour: number; dayName: string; count: number; total: number }> = {};
    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    (orders || []).forEach(o => {
      const d = new Date(o.created_at);
      const hour = getHours(d);
      const day = getDay(d);
      const key = `${day}-${hour}`;
      if (!heatmap[key]) heatmap[key] = { hour, dayName: dayNames[day], count: 0, total: 0 };
      heatmap[key].count++; heatmap[key].total += o.total;
    });
    setData(Object.values(heatmap).sort((a, b) => b.total - a.total));
  };

  // ═══════════════════════════════════
  // NEW POS REPORT LOADERS
  // ═══════════════════════════════════

  const loadPOSSalesByCategory = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    if (!orders?.length) { setData([]); return; }
    const orderIds = orders.map(o => o.id);
    // Fetch in batches of 500
    const allLines: any[] = [];
    for (let i = 0; i < orderIds.length; i += 500) {
      const batch = orderIds.slice(i, i + 500);
      const { data: lines } = await supabase.from("pos_order_lines").select("product_id, product_name, qty, total, cost_price, unit_price").in("order_id", batch);
      if (lines) allLines.push(...lines);
    }
    // Get product categories
    const prodIds = [...new Set(allLines.filter(l => l.product_id).map(l => l.product_id))];
    const prodCatMap = new Map<string, string>();
    if (prodIds.length) {
      for (let i = 0; i < prodIds.length; i += 500) {
        const batch = prodIds.slice(i, i + 500);
        const { data: prods } = await supabase.from("products").select("id, category").in("id", batch);
        (prods || []).forEach(p => prodCatMap.set(p.id, p.category || "بدون فئة"));
      }
    }
    const catMap: Record<string, { category: string; product: string; qty: number; revenue: number; cost: number }> = {};
    allLines.forEach(l => {
      const cat = l.product_id ? (prodCatMap.get(l.product_id) || "بدون فئة") : "بدون فئة";
      const key = `${cat}||${l.product_name}`;
      if (!catMap[key]) catMap[key] = { category: cat, product: l.product_name, qty: 0, revenue: 0, cost: 0 };
      catMap[key].qty += l.qty;
      catMap[key].revenue += l.total;
      catMap[key].cost += l.cost_price * l.qty;
    });
    const totalRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);
    setData(Object.values(catMap).map(c => ({
      ...c, profit: c.revenue - c.cost,
      pct: totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue));
  };

  const loadPOSPeriodComparison = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("created_at, total, discount_amount").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    // Group by day
    const dayMap: Record<string, { period: string; sales: number; orders: number; discounts: number }> = {};
    (orders || []).forEach(o => {
      const d = o.created_at.split("T")[0];
      if (!dayMap[d]) dayMap[d] = { period: d, sales: 0, orders: 0, discounts: 0 };
      dayMap[d].sales += o.total;
      dayMap[d].orders++;
      dayMap[d].discounts += o.discount_amount || 0;
    });
    const sorted = Object.values(dayMap).sort((a, b) => a.period.localeCompare(b.period));
    // Calculate growth
    const result = sorted.map((d, i) => ({
      ...d,
      avg: d.orders > 0 ? Math.round(d.sales / d.orders) : 0,
      growth: i > 0 && sorted[i - 1].sales > 0
        ? (((d.sales - sorted[i - 1].sales) / sorted[i - 1].sales) * 100)
        : 0,
    }));
    setData(result);
  };

  const loadPOSInvoiceRegister = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, discount_amount, tax_amount, subtotal, state, customer_name, session_id, payment_currency, currency").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
    const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
    setData((orders || []).map(o => ({
      order_number: o.order_number || "—",
      date: o.created_at.split("T")[0],
      time: o.created_at.split("T")[1]?.substring(0, 5) || "",
      cashier: sessMap.get(o.session_id) || "غير محدد",
      customer: o.customer_name || "—",
      subtotal: o.subtotal,
      discount: o.discount_amount || 0,
      tax: o.tax_amount || 0,
      total: o.total,
      currency: o.payment_currency || o.currency || "ILS",
      state: o.state,
    })));
  };

  const loadPOSPendingOrders = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, customer_name, session_id, table_id, guest_count").eq("user_id", uid).eq("state", "draft").order("created_at", { ascending: false });
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
    const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
    setData((orders || []).map(o => {
      const mins = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
      return {
        order_number: o.order_number || "—",
        date: o.created_at.split("T")[0],
        time: o.created_at.split("T")[1]?.substring(0, 5) || "",
        cashier: sessMap.get(o.session_id) || "غير محدد",
        customer: o.customer_name || "—",
        total: o.total,
        wait_minutes: mins,
      };
    }));
  };

  const loadPOSShiftOpenClose = async () => {
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name, opened_at, closed_at, opening_cash, closing_cash, state").eq("user_id", uid).eq("is_deleted", false).gte("opened_at", dateFrom).lte("opened_at", dateTo + "T23:59:59").order("opened_at", { ascending: false });
    setData((sessions || []).map(s => {
      const dur = s.closed_at ? Math.round((new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 3600000 * 10) / 10 : 0;
      return {
        cashier: s.cashier_name || "غير محدد",
        date: s.opened_at.split("T")[0],
        open_time: s.opened_at.split("T")[1]?.substring(0, 5) || "",
        close_time: s.closed_at ? s.closed_at.split("T")[1]?.substring(0, 5) || "" : "مفتوحة",
        opening: s.opening_cash || 0,
        closing: s.closing_cash ?? 0,
        duration_hrs: dur,
        state: s.state,
      };
    }));
  };

  const loadPOSPaymentMethods = async () => {
    const { data: payments } = await supabase.from("pos_payments").select("payment_method, amount, currency").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    const methodMap: Record<string, { method: string; count: number; total: number; max: number; min: number }> = {};
    (payments || []).forEach(p => {
      const m = p.payment_method === "cash" ? "نقدي" : p.payment_method === "card" ? "بطاقة" : p.payment_method === "credit" ? "آجل" : p.payment_method || "نقدي";
      if (!methodMap[m]) methodMap[m] = { method: m, count: 0, total: 0, max: 0, min: Infinity };
      methodMap[m].count++;
      methodMap[m].total += p.amount;
      methodMap[m].max = Math.max(methodMap[m].max, p.amount);
      methodMap[m].min = Math.min(methodMap[m].min, p.amount);
    });
    const totalAll = Object.values(methodMap).reduce((s, m) => s + m.total, 0);
    setData(Object.values(methodMap).map(m => ({
      ...m,
      avg: m.count > 0 ? Math.round(m.total / m.count) : 0,
      min: m.min === Infinity ? 0 : m.min,
      pct: totalAll > 0 ? ((m.total / totalAll) * 100) : 0,
    })).sort((a, b) => b.total - a.total));
  };

  const loadPOSProductMovement = async () => {
    // Paid orders
    const { data: paidOrders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    // Return orders
    const { data: returnOrders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("is_return", true).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    const paidIds = (paidOrders || []).map(o => o.id);
    const returnIds = (returnOrders || []).map(o => o.id);
    const allIds = [...paidIds, ...returnIds];
    if (!allIds.length) { setData([]); return; }
    const allLines: any[] = [];
    for (let i = 0; i < allIds.length; i += 500) {
      const batch = allIds.slice(i, i + 500);
      const { data: lines } = await supabase.from("pos_order_lines").select("product_name, product_id, qty, total, unit_price, order_id").in("order_id", batch);
      if (lines) allLines.push(...lines);
    }
    const returnIdSet = new Set(returnIds);
    const prodMap: Record<string, { product: string; sold_qty: number; return_qty: number; revenue: number; avg_price: number }> = {};
    allLines.forEach(l => {
      const key = l.product_name;
      if (!prodMap[key]) prodMap[key] = { product: key, sold_qty: 0, return_qty: 0, revenue: 0, avg_price: 0 };
      if (returnIdSet.has(l.order_id)) {
        prodMap[key].return_qty += l.qty;
      } else {
        prodMap[key].sold_qty += l.qty;
        prodMap[key].revenue += l.total;
      }
    });
    setData(Object.values(prodMap).map(p => ({
      ...p,
      net_qty: p.sold_qty - p.return_qty,
      avg_price: p.sold_qty > 0 ? Math.round(p.revenue / p.sold_qty) : 0,
    })).sort((a, b) => b.revenue - a.revenue));
  };

  const loadPOSCategoryTotals = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    if (!orders?.length) { setData([]); return; }
    const orderIds = orders.map(o => o.id);
    const allLines: any[] = [];
    for (let i = 0; i < orderIds.length; i += 500) {
      const batch = orderIds.slice(i, i + 500);
      const { data: lines } = await supabase.from("pos_order_lines").select("product_id, qty, total").in("order_id", batch);
      if (lines) allLines.push(...lines);
    }
    const prodIds = [...new Set(allLines.filter(l => l.product_id).map(l => l.product_id))];
    const prodCatMap = new Map<string, string>();
    if (prodIds.length) {
      for (let i = 0; i < prodIds.length; i += 500) {
        const batch = prodIds.slice(i, i + 500);
        const { data: prods } = await supabase.from("products").select("id, category").in("id", batch);
        (prods || []).forEach(p => prodCatMap.set(p.id, p.category || "بدون فئة"));
      }
    }
    const catMap: Record<string, { category: string; items: number; qty: number; revenue: number }> = {};
    const seenProducts = new Map<string, Set<string>>();
    allLines.forEach(l => {
      const cat = l.product_id ? (prodCatMap.get(l.product_id) || "بدون فئة") : "بدون فئة";
      if (!catMap[cat]) { catMap[cat] = { category: cat, items: 0, qty: 0, revenue: 0 }; seenProducts.set(cat, new Set()); }
      catMap[cat].qty += l.qty;
      catMap[cat].revenue += l.total;
      if (l.product_id) seenProducts.get(cat)!.add(l.product_id);
    });
    const totalRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);
    setData(Object.values(catMap).map(c => ({
      ...c,
      items: seenProducts.get(c.category)?.size || 0,
      pct: totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue));
  };

  const loadPOSInvoiceTiming = async () => {
    const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, paid_at, total, session_id, customer_name").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
    const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
    const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
    setData((orders || []).map(o => {
      const openTime = new Date(o.created_at);
      const closeTime = o.paid_at ? new Date(o.paid_at) : openTime;
      const durationMin = Math.round((closeTime.getTime() - openTime.getTime()) / 60000);
      return {
        order_number: o.order_number || "—",
        date: o.created_at.split("T")[0],
        open_time: o.created_at.split("T")[1]?.substring(0, 5) || "",
        close_time: o.paid_at ? o.paid_at.split("T")[1]?.substring(0, 5) || "" : "—",
        duration_min: durationMin,
        cashier: sessMap.get(o.session_id) || "غير محدد",
        customer: o.customer_name || "—",
        total: o.total,
      };
    }));
  };

  const loadPOSCreditSales = async () => {
    const { data: payments } = await supabase.from("pos_payments").select("order_id, amount, payment_method, created_at").eq("user_id", uid).eq("payment_method", "credit").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
    if (!payments?.length) { setData([]); return; }
    const orderIds = [...new Set(payments.map(p => p.order_id))];
    const allOrders: any[] = [];
    for (let i = 0; i < orderIds.length; i += 500) {
      const batch = orderIds.slice(i, i + 500);
      const { data: ords } = await supabase.from("pos_orders").select("id, order_number, created_at, total, customer_name, customer_id").in("id", batch);
      if (ords) allOrders.push(...ords);
    }
    const orderMap = new Map(allOrders.map(o => [o.id, o]));
    // Group by customer
    const custMap: Record<string, { customer: string; orders: number; credit_total: number; invoices: string[] }> = {};
    payments.forEach(p => {
      const order = orderMap.get(p.order_id);
      const custName = order?.customer_name || "عميل غير مسمى";
      if (!custMap[custName]) custMap[custName] = { customer: custName, orders: 0, credit_total: 0, invoices: [] };
      custMap[custName].orders++;
      custMap[custName].credit_total += p.amount;
      if (order?.order_number) custMap[custName].invoices.push(order.order_number);
    });
    setData(Object.values(custMap).sort((a, b) => b.credit_total - a.credit_total));
  };


    const contactTypes = ["عميل", "customer", "زبون"];
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name, current_balance, contact_class").eq("user_id", uid).in("contact_type", contactTypes).gt("current_balance", 0);
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_credit", "sale_cash", "sale_bank", "sale_cheque"]);
    const today = new Date();
    setData(contacts.map(c => {
      const cTxns = (txns || []).filter(t => t.contact_id === c.id);
      const oldestUnpaid = cTxns.length > 0 ? new Date(cTxns[cTxns.length - 1].transaction_date) : today;
      const days = differenceInDays(today, oldestUnpaid);
      return {
        name: c.contact_name, cls: c.contact_class || "C", total: c.current_balance || 0,
        current: days <= 30 ? c.current_balance : 0, d31_60: days > 30 && days <= 60 ? c.current_balance : 0,
        d61_90: days > 60 && days <= 90 ? c.current_balance : 0, over90: days > 90 ? c.current_balance : 0,
      };
    }).sort((a, b) => b.total - a.total));
  };

  const loadDSOReport = async () => {
    const contactTypes = ["عميل", "customer", "زبون"];
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name, contact_class").eq("user_id", uid).in("contact_type", contactTypes);
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    const today = new Date();
    setData(contacts.map(c => {
      const sales = (txns || []).filter(t => t.contact_id === c.id && (t.transaction_type?.includes("sale")));
      const receipts = (txns || []).filter(t => t.contact_id === c.id && (t.transaction_type?.includes("receipt")));
      const invCount = sales.length;
      const paidCount = receipts.length;
      const collDays: number[] = [];
      sales.forEach((s, i) => { if (receipts[i]) collDays.push(differenceInDays(new Date(receipts[i].transaction_date), new Date(s.transaction_date))); });
      const avgDays = collDays.length > 0 ? Math.round(collDays.reduce((a, b) => a + b, 0) / collDays.length) : 0;
      const lateDays = collDays.filter(d => d > 30);
      const avgLate = lateDays.length > 0 ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
      const bestPayment = collDays.length > 0 ? Math.min(...collDays) : 0;
      const worstPayment = collDays.length > 0 ? Math.max(...collDays) : 0;
      const grade = avgDays < 30 && paidCount / Math.max(invCount, 1) > 0.8 ? "A" : avgDays <= 45 ? "B" : avgDays <= 60 ? "C" : "D";
      return { name: c.contact_name, invCount, avgDays, avgLate, bestPayment, worstPayment, grade };
    }).filter(r => r.invCount > 0).sort((a, b) => b.avgLate - a.avgLate));
  };

  const loadChecksReceivable = async () => {
    const { data: cheques } = await supabase.from("cheques").select("*").eq("user_id", uid).eq("cheque_type", "وارد").order("cheque_date", { ascending: true });
    const today = new Date();
    setData((cheques || []).map(c => ({
      party: c.party_name, number: c.cheque_number || "—", chequeDate: c.cheque_date,
      amount: c.amount, daysUntilDue: differenceInDays(new Date(c.cheque_date), today),
      status: c.status, bank: c.bank_name || "—",
    })));
  };

  const loadCustomerProfitability = async () => {
    const contactTypes = ["عميل", "customer", "زبون"];
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).in("contact_type", contactTypes);
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    setData(contacts.map(c => {
      const sales = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type?.includes("sale"));
      const totalSales = sales.reduce((s, t) => s + (t.amount || 0), 0);
      const invCount = sales.length;
      const avgInv = invCount > 0 ? Math.round(totalSales / invCount) : 0;
      return { name: c.contact_name, totalSales, invCount, avgInv };
    }).filter(r => r.totalSales > 0).sort((a, b) => b.totalSales - a.totalSales));
  };

  const loadCustomerStatementAll = async () => {
    const contactTypes = ["عميل", "customer", "زبون"];
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).in("contact_type", contactTypes);
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, description, amount, debit_account_code, credit_account_code, reference, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
    const rows: any[] = [];
    contacts.forEach(c => {
      const cTxns = (txns || []).filter(t => t.contact_id === c.id);
      if (!cTxns.length) return;
      let balance = 0;
      cTxns.forEach(tx => {
        const isDebit = tx.debit_account_code === "1130";
        const debit = isDebit ? tx.amount : 0;
        const credit = !isDebit ? tx.amount : 0;
        balance += debit - credit;
        rows.push({ contactName: c.contact_name, date: tx.transaction_date, ref: tx.reference || "—", desc: tx.description, debit, credit, balance });
      });
    });
    setData(rows);
  };

  const loadAPAgingDetail = async () => {
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name, current_balance, contact_class").eq("user_id", uid).eq("contact_type", "مورد").lt("current_balance", 0);
    if (!contacts?.length) { setData([]); return; }
    const today = new Date();
    setData(contacts.map(c => {
      const bal = Math.abs(c.current_balance || 0);
      return {
        name: c.contact_name, total: bal,
        current: bal, d31_60: 0, d61_90: 0, over90: 0,
        priority: "🟢 مريح",
      };
    }).sort((a, b) => b.total - a.total));
  };

  const loadDPOReport = async () => {
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    setData(contacts.map(c => {
      const purchases = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type?.includes("purchase"));
      const payments = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type?.includes("payment"));
      const totalPurchases = purchases.reduce((s, t) => s + (t.amount || 0), 0);
      const payDays: number[] = [];
      purchases.forEach((p, i) => { if (payments[i]) payDays.push(differenceInDays(new Date(payments[i].transaction_date), new Date(p.transaction_date))); });
      const avgDays = payDays.length > 0 ? Math.round(payDays.reduce((a, b) => a + b, 0) / payDays.length) : 0;
      const compliance = purchases.length > 0 ? Math.round((payments.length / purchases.length) * 100) : 0;
      return { name: c.contact_name, totalPurchases, avgDays, compliance, invCount: purchases.length };
    }).filter(r => r.totalPurchases > 0).sort((a, b) => b.totalPurchases - a.totalPurchases));
  };

  const loadChecksPayable = async () => {
    const { data: cheques } = await supabase.from("cheques").select("*").eq("user_id", uid).eq("cheque_type", "صادر").order("cheque_date", { ascending: true });
    const today = new Date();
    setData((cheques || []).map(c => ({
      party: c.party_name, number: c.cheque_number || "—", chequeDate: c.cheque_date,
      amount: c.amount, daysUntilDue: differenceInDays(new Date(c.cheque_date), today),
      status: c.status, bank: c.bank_name || "—",
    })));
  };

  const loadSupplierPurchaseAnalysis = async () => {
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
    const totalAllPurchases = (txns || []).filter(t => t.transaction_type?.includes("purchase")).reduce((s, t) => s + (t.amount || 0), 0);
    setData(contacts.map(c => {
      const purchases = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type?.includes("purchase"));
      const total = purchases.reduce((s, t) => s + (t.amount || 0), 0);
      const invCount = purchases.length;
      const avgInv = invCount > 0 ? Math.round(total / invCount) : 0;
      const pct = totalAllPurchases > 0 ? Math.round((total / totalAllPurchases) * 100) : 0;
      return { name: c.contact_name, total, invCount, avgInv, pct };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total));
  };

  const loadSupplierStatementAll = async () => {
    const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
    if (!contacts?.length) { setData([]); return; }
    const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, description, amount, debit_account_code, credit_account_code, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
    const rows: any[] = [];
    contacts.forEach(c => {
      const cTxns = (txns || []).filter(t => t.contact_id === c.id);
      if (!cTxns.length) return;
      let balance = 0;
      cTxns.forEach(tx => {
        const isCredit = tx.credit_account_code === "2100";
        const debit = !isCredit ? tx.amount : 0;
        const credit = isCredit ? tx.amount : 0;
        balance += credit - debit;
        rows.push({ contactName: c.contact_name, date: tx.transaction_date, ref: tx.reference || "—", desc: tx.description, debit, credit, balance });
      });
    });
    setData(rows);
  };

  const loadGenericTransactions = async () => {
    const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code, transaction_type, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false }).limit(200);
    setData(txns || []);
  };

  // ═══════════════════════════════════
  // INVOICE TRACKING LOADERS
  // ═══════════════════════════════════

  const loadInvoiceLifecycle = async () => {
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status, payment_status, contact_name").eq("user_id", uid).eq("invoice_type", "sale").gte("invoice_date", dateFrom).lte("invoice_date", dateTo).order("invoice_date", { ascending: false });
    if (!invoices?.length) { setData([]); return; }
    const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id, allocated_amount");
    const { data: voucherData } = await supabase.from("receipt_vouchers").select("id, payment_date").eq("user_id", uid);
    const vMap = new Map((voucherData || []).map(v => [v.id, v.payment_date]));
    const invLinks = new Map<string, string[]>();
    (linkData || []).forEach(l => { if (!invLinks.has(l.invoice_id)) invLinks.set(l.invoice_id, []); invLinks.get(l.invoice_id)!.push(l.payment_id); });
    const today = new Date();
    setData(invoices.map(inv => {
      const paid = inv.paid_amount || 0;
      const remaining = inv.remaining_amount ?? (inv.total_amount - paid);
      const isPaid = inv.payment_status === "paid" || paid >= inv.total_amount;
      const paymentIds = invLinks.get(inv.id) || [];
      const lastPayDate = paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
      let daysToClose: number | null = null;
      let closureStatus = "جارية";
      if (isPaid && lastPayDate) {
        daysToClose = differenceInDays(new Date(lastPayDate), new Date(inv.invoice_date));
        closureStatus = inv.due_date && lastPayDate <= inv.due_date ? "✅ في الموعد" : "⚠️ متأخر";
      } else if (!isPaid && inv.due_date && today > new Date(inv.due_date)) {
        closureStatus = "🔴 متأخرة";
      } else if (!isPaid) {
        closureStatus = "⏳ جارية";
      }
      return {
        invoiceNumber: inv.invoice_number || "—", customer: inv.contact_name || "—",
        issueDate: inv.invoice_date, dueDate: inv.due_date || "—",
        total: inv.total_amount, paid, remaining,
        daysToClose: daysToClose ?? "—", closureStatus,
      };
    }));
  };

  const loadDSODetailed = async () => {
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_date, due_date, total_amount, paid_amount, payment_status, contact_name, contact_id").eq("user_id", uid).eq("invoice_type", "sale").gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
    if (!invoices?.length) { setData([]); return; }
    const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id");
    const { data: voucherData } = await supabase.from("receipt_vouchers").select("id, payment_date").eq("user_id", uid);
    const vMap = new Map((voucherData || []).map(v => [v.id, v.payment_date]));
    const invLinks = new Map<string, string[]>();
    (linkData || []).forEach(l => { if (!invLinks.has(l.invoice_id)) invLinks.set(l.invoice_id, []); invLinks.get(l.invoice_id)!.push(l.payment_id); });
    const customerMap: Record<string, { name: string; days: number[]; invCount: number }> = {};
    invoices.forEach(inv => {
      const isPaid = inv.payment_status === "paid" || (inv.paid_amount || 0) >= inv.total_amount;
      if (!isPaid) return;
      const paymentIds = invLinks.get(inv.id) || [];
      const lastPayDate = paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
      if (!lastPayDate) return;
      const d = differenceInDays(new Date(lastPayDate), new Date(inv.invoice_date));
      const key = inv.contact_name || "غير محدد";
      if (!customerMap[key]) customerMap[key] = { name: key, days: [], invCount: 0 };
      customerMap[key].days.push(d);
      customerMap[key].invCount++;
    });
    setData(Object.values(customerMap).map(c => {
      const avg = Math.round(c.days.reduce((a, b) => a + b, 0) / c.days.length);
      const fastest = Math.min(...c.days);
      const slowest = Math.max(...c.days);
      const grade = avg < 30 ? "🟢 A ممتاز" : avg < 45 ? "🟡 B جيد" : avg < 60 ? "🟠 C مقبول" : "🔴 D خطر";
      return { name: c.name, invCount: c.invCount, avgDSO: avg, fastest, slowest, grade };
    }).sort((a, b) => a.avgDSO - b.avgDSO));
  };

  const loadARAgingAdvanced = async () => {
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, contact_name, payment_status").eq("user_id", uid).eq("invoice_type", "sale");
    if (!invoices?.length) { setData([]); return; }
    const today = new Date();
    const customerMap: Record<string, { name: string; current: number; d1_30: number; d31_60: number; d61_90: number; over90: number; total: number }> = {};
    invoices.forEach(inv => {
      const remaining = inv.remaining_amount ?? (inv.total_amount - (inv.paid_amount || 0));
      if (remaining <= 0) return;
      const key = inv.contact_name || "غير محدد";
      if (!customerMap[key]) customerMap[key] = { name: key, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0 };
      const overdue = inv.due_date ? differenceInDays(today, new Date(inv.due_date)) : 0;
      if (overdue <= 0) customerMap[key].current += remaining;
      else if (overdue <= 30) customerMap[key].d1_30 += remaining;
      else if (overdue <= 60) customerMap[key].d31_60 += remaining;
      else if (overdue <= 90) customerMap[key].d61_90 += remaining;
      else customerMap[key].over90 += remaining;
      customerMap[key].total += remaining;
    });
    setData(Object.values(customerMap).sort((a, b) => b.total - a.total));
  };

  const loadCollectionEfficiency = async () => {
    const months = [];
    for (let i = 11; i >= 0; i--) { const m = subMonths(new Date(), i); months.push({ label: format(m, "yyyy-MM"), from: format(startOfMonth(m), "yyyy-MM-dd"), to: format(endOfMonth(m), "yyyy-MM-dd") }); }
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_date, due_date, total_amount, paid_amount, payment_status, contact_name").eq("user_id", uid).eq("invoice_type", "sale").gte("invoice_date", months[0].from).lte("invoice_date", months[11].to);
    const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id, allocated_amount");
    const { data: voucherData } = await supabase.from("receipt_vouchers").select("id, payment_date").eq("user_id", uid);
    const vMap = new Map((voucherData || []).map(v => [v.id, v.payment_date]));
    const invLinks = new Map<string, { paymentIds: string[]; totalAllocated: number }>();
    (linkData || []).forEach(l => {
      if (!invLinks.has(l.invoice_id)) invLinks.set(l.invoice_id, { paymentIds: [], totalAllocated: 0 });
      invLinks.get(l.invoice_id)!.paymentIds.push(l.payment_id);
      invLinks.get(l.invoice_id)!.totalAllocated += l.allocated_amount;
    });
    setData(months.map(m => {
      const mInvoices = (invoices || []).filter(i => i.invoice_date >= m.from && i.invoice_date <= m.to);
      const issued = mInvoices.reduce((s, i) => s + i.total_amount, 0);
      const collected = mInvoices.reduce((s, i) => { const link = invLinks.get(i.id); return s + (link?.totalAllocated || 0); }, 0);
      const collectionRate = issued > 0 ? Math.round((collected / issued) * 100) : 0;
      let onTime = 0, late = 0, avgDaysLate = 0;
      const lateDays: number[] = [];
      mInvoices.forEach(inv => {
        const isPaid = inv.payment_status === "paid" || (inv.paid_amount || 0) >= inv.total_amount;
        if (!isPaid) return;
        const link = invLinks.get(inv.id);
        if (!link) return;
        const lastPayDate = link.paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
        if (!lastPayDate || !inv.due_date) return;
        if (lastPayDate <= inv.due_date) onTime++;
        else { late++; lateDays.push(differenceInDays(new Date(lastPayDate), new Date(inv.due_date))); }
      });
      avgDaysLate = lateDays.length > 0 ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
      return { month: m.label, issued, collected, collectionRate, onTime, late, avgDaysLate };
    }));
  };

  const loadPaymentAllocation = async () => {
    const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id, allocated_amount");
    if (!linkData?.length) { setData([]); return; }
    const invIds = [...new Set(linkData.map(l => l.invoice_id))];
    const payIds = [...new Set(linkData.map(l => l.payment_id))];
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number").in("id", invIds);
    const { data: vouchers } = await supabase.from("receipt_vouchers").select("id, receipt_number, payment_date, contact_name, payment_method").eq("user_id", uid).in("id", payIds);
    const invMap = new Map((invoices || []).map(i => [i.id, i.invoice_number]));
    const vMap = new Map((vouchers || []).map(v => [v.id, v]));
    setData(linkData.filter(l => {
      const v = vMap.get(l.payment_id);
      return v && v.payment_date >= dateFrom && v.payment_date <= dateTo;
    }).map(l => {
      const v = vMap.get(l.payment_id)!;
      return {
        receiptNumber: v.receipt_number || "—",
        paymentDate: v.payment_date,
        customer: v.contact_name || "—",
        paymentMethod: v.payment_method || "—",
        invoiceNumber: invMap.get(l.invoice_id) || "—",
        allocated: l.allocated_amount,
      };
    }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)));
  };

  const loadUnpaidInvoices = async () => {
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total_amount, contact_name, contact_id, payment_status, paid_amount, remaining_amount").eq("user_id", uid).eq("invoice_type", "sale").gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
    if (!invoices?.length) { setData([]); return; }
    const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id");
    const linkedIds = new Set((linkData || []).map(l => l.invoice_id));
    const today = new Date();
    setData(invoices.filter(inv => {
      const remaining = inv.remaining_amount ?? (inv.total_amount - (inv.paid_amount || 0));
      return remaining > 0 && !linkedIds.has(inv.id);
    }).map(inv => ({
      invoiceNumber: inv.invoice_number || "—",
      customer: inv.contact_name || "—",
      issueDate: inv.invoice_date,
      total: inv.total_amount,
      daysSinceIssue: differenceInDays(today, new Date(inv.invoice_date)),
    })).sort((a, b) => b.daysSinceIssue - a.daysSinceIssue));
  };


  const exportExcel = () => {
    if (!data.length) return;
    const cols = getReportColumns();
    const colLabels = cols ? cols.map(c => c.label) : Object.keys(data[0]);
    const colKeys = cols ? cols.map(c => c.key) : Object.keys(data[0]);
    
    // Build header rows
    const headerRows = [
      [config.title],
      [`الفترة: ${dateFrom} إلى ${dateTo}`],
      [`تاريخ التصدير: ${format(new Date(), "yyyy-MM-dd HH:mm")}`],
      [],
      colLabels,
    ];
    
    // Build data rows
    const dataRows = data.map(row => colKeys.map(k => {
      const v = row[k];
      return typeof v === "number" ? v : (v ?? "");
    }));
    
    // Build totals row
    const totalsConfig = getReportTotals();
    if (totalsConfig) {
      const totalsRow = colKeys.map(k => {
        if (totalsConfig[k] === "sum") return data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
        return "";
      });
      totalsRow[0] = "الإجمالي";
      dataRows.push(totalsRow);
    }
    
    const allRows = [...headerRows, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    
    // Set column widths
    ws['!cols'] = colKeys.map(() => ({ wch: 18 }));
    
    // Merge title row
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colKeys.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colKeys.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: colKeys.length - 1 } },
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.title.substring(0, 31));
    XLSX.writeFile(wb, `${config.title}-${dateFrom}.xlsx`);
    toast.success("تم تصدير التقرير بنجاح");
  };

  // ═══════════════════════════════════
  // COLUMN DEFINITIONS FOR SORTABLE TABLE
  // ═══════════════════════════════════
  const fmtAmtCell = (v: any) => v != null && v !== 0 ? `₪${Math.abs(Number(v)).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  const getReportColumns = (): ColumnDef[] | null => {
    switch (reportKey) {
      case "ar-aging": case "ap-aging":
        return [
          { key: "name", label: reportKey === "ar-aging" ? "الزبون" : "المورد", type: "text" },
          { key: "cls", label: "التصنيف", type: "badge", filterType: "select", filterOptions: ["A", "B", "C", "D", "-"] },
          { key: "current", label: "جاري", type: "currency", format: v => <span className="text-green-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d30", label: "1-30", type: "currency", format: v => <span className="text-yellow-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d60", label: "31-60", type: "currency", format: v => <span className="text-orange-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "d90", label: "61-90", type: "currency", format: v => <span className="text-red-500 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "over90", label: "+90", type: "currency", format: v => <span className="text-red-700 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "total", label: "الإجمالي", type: "currency", format: v => <span className="font-mono text-xs font-bold">{fmtAmtCell(v)}</span> },
        ];
      case "daily-sales":
        return [
          { key: "date", label: "التاريخ", type: "date" },
          { key: "count", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "sales", label: "المبيعات", type: "currency" },
          { key: "returns", label: "المرتجعات", type: "currency", format: v => v > 0 ? <span className="text-red-500 font-mono text-xs">({fmtAmtCell(v)})</span> : <span className="font-mono text-xs">—</span> },
          { key: "net", label: "الصافي", type: "currency" },
        ];
      case "cheques":
        return [
          { key: "cheque_number", label: "رقم الشيك", type: "text" },
          { key: "bank_name", label: "البنك", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.bank_name).filter(Boolean))] },
          { key: "party_name", label: "الطرف", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency" },
          { key: "cheque_date", label: "تاريخ الاستحقاق", type: "date" },
          { key: "cheque_type", label: "النوع", type: "badge", filterType: "select", filterOptions: ["وارد", "صادر"] },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["معلق", "محصل", "مرتجع", "ملغي"],
            format: (v) => {
              const colors: Record<string, string> = { "معلق": "text-yellow-600 bg-yellow-50", "محصل": "text-green-600 bg-green-50", "مرتجع": "text-red-600 bg-red-50", "ملغي": "text-muted-foreground bg-muted/50" };
              return <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[v] || ""}`}>{v}</span>;
            }},
        ];
      case "inventory-valuation":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية", type: "number", align: "center",
            format: (v) => <span className={`font-mono text-xs ${v < 0 ? "text-red-600 font-bold" : v === 0 ? "text-muted-foreground" : ""}`}>{v < 0 ? `⚠️ ${v}` : v}</span> },
          { key: "cost", label: "متوسط التكلفة", type: "currency" },
          { key: "value", label: "القيمة", type: "currency" },
          { key: "pct", label: "النسبة", type: "percent" },
        ];
      case "stock-movement":
        return [
          { key: "date", label: "التاريخ", type: "date" },
          { key: "product", label: "الصنف", type: "text" },
          { key: "type", label: "النوع", type: "badge", filterType: "select", filterOptions: ["شراء", "بيع", "تعديل", "إرجاع"] },
          { key: "qty", label: "الكمية", type: "number", format: (v) => <span className={`font-mono text-xs ${v < 0 ? "text-red-500" : "text-green-600"}`}>{v}</span> },
          { key: "ref", label: "المرجع", type: "text" },
        ];
      case "below-reorder":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية الحالية", type: "number", align: "center", format: v => <span className="text-red-500 font-bold font-mono text-xs">{v}</span> },
          { key: "min", label: "الحد الأدنى", type: "number", align: "center" },
          { key: "shortage", label: "النقص", type: "number", format: v => <span className="text-red-600 font-bold font-mono text-xs">{v}</span> },
          { key: "reorderCost", label: "تكلفة الطلب", type: "currency" },
        ];
      case "by-customer": case "by-supplier":
        return [
          { key: "name", label: reportKey === "by-customer" ? "الزبون" : "المورد", type: "text" },
          ...(reportKey === "by-customer" ? [{ key: "cls", label: "التصنيف", type: "badge" as const, filterType: "select" as const, filterOptions: ["A", "B", "C", "D", "-"] }] : []),
          { key: "count", label: "عدد الفواتير", type: "number", align: "center" as const },
          { key: "total", label: "الإجمالي", type: "currency" as const },
          ...(reportKey === "by-customer" ? [{ key: "lastDate", label: "آخر عملية", type: "date" as const }] : []),
        ];
      case "invoice-register": case "purchase-invoice-register": case "collections": case "supplier-payments":
        return [
          { key: "transaction_date", label: "التاريخ", type: "date" },
          { key: "description", label: "البيان", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency" },
          { key: "payment_method", label: "طريقة الدفع", type: "badge", filterType: "select", filterOptions: ["نقدي", "بنك", "شيك", "آجل"] },
          { key: "reference", label: "المرجع", type: "text" },
        ];
      case "sales-returns": case "purchase-returns":
        return [
          { key: "transaction_date", label: "التاريخ", type: "date" },
          { key: "description", label: "البيان", type: "text" },
          { key: "amount", label: "المبلغ", type: "currency", format: v => <span className="text-red-500 font-bold font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "reference", label: "المرجع", type: "text" },
        ];
      case "asset-register":
        return [
          { key: "asset_number", label: "رقم الأصل", type: "text" },
          { key: "name_ar", label: "الاسم", type: "text" },
          { key: "acquisition_cost", label: "التكلفة", type: "currency" },
          { key: "accumulated_depreciation", label: "مجمع الاستهلاك", type: "currency" },
          { key: "net_book_value", label: "القيمة الدفترية", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${v === 0 ? "text-red-600" : ""}`}>{fmtAmtCell(v)}</span> },
          { key: "status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["نشط", "مباع", "مستبعد"] },
        ];
      case "employee-directory":
        return [
          { key: "full_name", label: "الاسم", type: "text" },
          { key: "department", label: "القسم", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.department).filter(Boolean))] },
          { key: "job_title", label: "المسمى", type: "text" },
          { key: "hire_date", label: "تاريخ التعيين", type: "date" },
          { key: "salary", label: "الراتب", type: "currency" },
          { key: "employment_status", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["active", "inactive"],
            format: v => <span className={`px-2 py-1 rounded-full text-xs ${v === "active" ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"}`}>{v === "active" ? "نشط" : v || "-"}</span> },
        ];
      case "sales-by-product": case "order-performance":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية", type: "number", align: "center" },
          { key: "revenue", label: "الإيرادات", type: "currency" },
          { key: "cost", label: "التكلفة", type: "currency" },
          { key: "profit", label: "الربح", type: "currency",
            format: (v, row) => { const p = (row.revenue || 0) - (row.cost || 0); return <span className={`font-mono text-xs ${p >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtAmtCell(p)}</span>; } },
          { key: "margin", label: "الهامش", type: "percent",
            format: (v, row) => { const m = row.revenue > 0 ? ((row.revenue - row.cost) / row.revenue * 100) : 0; return <span className="font-mono text-xs">{m.toFixed(1)}%</span>; } },
        ];
      case "dead-stock":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "qty", label: "الكمية", type: "number", align: "center" },
          { key: "value", label: "القيمة المجمدة", type: "currency" },
          { key: "lastMove", label: "آخر حركة", type: "date", format: v => <span className="font-mono text-xs">{v?.split("T")[0] || "لا يوجد"}</span> },
          { key: "days", label: "الأيام", type: "number",
            format: v => <span className={`font-mono text-xs ${v > 180 ? "text-red-600 font-bold" : "text-orange-500"}`}>{v >= 999 ? "+999" : v}</span> },
        ];
      case "product-profitability":
        return [
          { key: "name", label: "الصنف", type: "text" },
          { key: "buyPrice", label: "سعر الشراء", type: "currency" },
          { key: "sellPrice", label: "سعر البيع", type: "currency" },
          { key: "profit", label: "الربح/وحدة", type: "currency",
            format: v => <span className={`font-mono text-xs ${v >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtAmtCell(v)}</span> },
          { key: "margin", label: "الهامش", type: "percent" },
          { key: "stock", label: "المخزون", type: "number", align: "center" },
        ];
      case "month-comparison":
        return [
          { key: "month", label: "الشهر", type: "text", sortable: false },
          { key: "revenue", label: "الإيرادات", type: "currency", format: v => <span className="text-green-600 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "expenses", label: "المصروفات", type: "currency", format: v => <span className="text-red-500 font-mono text-xs">{fmtAmtCell(v)}</span> },
          { key: "profit", label: "صافي الربح", type: "currency",
            format: v => <span className={`font-mono text-xs font-bold ${v >= 0 ? "text-green-600" : "text-red-500"}`}>{v < 0 ? `(${fmtAmtCell(v)})` : fmtAmtCell(v)}</span> },
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
          { key: "avg", label: "متوسط الفاتورة", type: "currency",
            format: (v, row) => <span className="font-mono text-xs">{row.count > 0 ? fmtAmtCell(row.total / row.count) : "—"}</span> },
          { key: "cancelled", label: "الملغية", type: "number",
            format: v => <span className={`font-mono text-xs ${v > 0 ? "text-red-500 font-bold" : ""}`}>{v}</span> },
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
          { key: "order_number", label: "رقم الفاتورة", type: "text" },
          { key: "date", label: "التاريخ", type: "date" },
          { key: "time", label: "الوقت", type: "text" },
          { key: "cashier", label: "الكاشير", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.cashier).filter(Boolean))] },
          { key: "customer", label: "العميل", type: "text" },
          { key: "subtotal", label: "المبلغ", type: "currency" },
          { key: "discount", label: "الخصم", type: "currency" },
          { key: "tax", label: "الضريبة", type: "currency" },
          { key: "total", label: "الصافي", type: "currency" },
          { key: "currency", label: "العملة", type: "text", filterType: "select", filterOptions: [...new Set(data.map((r: any) => r.currency).filter(Boolean))] },
          { key: "state", label: "الحالة", type: "badge", filterType: "select", filterOptions: ["paid", "cancelled", "draft"],
            format: (v: string) => {
              const colors: Record<string, string> = { paid: "bg-green-50 text-green-600", cancelled: "bg-red-50 text-red-600", draft: "bg-yellow-50 text-yellow-600" };
              const labels: Record<string, string> = { paid: "مكتمل", cancelled: "ملغي", draft: "معلق" };
              return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[v] || ""}`}>{labels[v] || v}</span>;
            }
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
          { key: "wait_minutes", label: "مدة الانتظار (دقيقة)", type: "number",
            format: (v: number) => <span className={`font-mono text-xs font-bold ${v > 60 ? "text-destructive" : v > 30 ? "text-yellow-600" : ""}`}>{v}</span> },
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
          { key: "duration_min", label: "مدة الخدمة (دقيقة)", type: "number",
            format: (v: number) => <span className={`font-mono text-xs font-bold ${v > 30 ? "text-destructive" : v > 15 ? "text-yellow-600" : "text-green-600"}`}>{v}</span> },
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
          { key: "totalSales", label: "إجمالي المبيعات", type: "currency" },
          { key: "invCount", label: "عدد الفواتير", type: "number", align: "center" },
          { key: "avgInv", label: "متوسط الفاتورة", type: "currency" },
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
      default:
        return null;
    }
  };

  const getReportTotals = (): TotalsConfig | undefined => {
    switch (reportKey) {
      case "ar-aging": case "ap-aging":
        return { current: "sum", d30: "sum", d60: "sum", d90: "sum", over90: "sum", total: "sum" };
      case "daily-sales":
        return { count: "sum", sales: "sum", returns: "sum", net: "sum" };
      case "inventory-valuation":
        return { value: "sum" };
      case "invoice-register": case "purchase-invoice-register": case "collections": case "supplier-payments":
        return { amount: "sum" };
      case "sales-returns": case "purchase-returns":
        return { amount: "sum" };
      case "by-customer": case "by-supplier":
        return { count: "sum", total: "sum" };
      case "pos-daily-sales":
        return { discount: "sum", total: "sum" };
      case "pos-sales-by-category":
        return { qty: "sum", revenue: "sum", cost: "sum", profit: "sum" };
      case "pos-period-comparison":
        return { orders: "sum", sales: "sum", discounts: "sum" };
      case "pos-invoice-register":
        return { subtotal: "sum", discount: "sum", tax: "sum", total: "sum" };
      case "pos-pending-orders":
        return { total: "sum" };
      case "pos-shift-open-close":
        return { opening: "sum", closing: "sum" };
      case "pos-payment-methods":
        return { count: "sum", total: "sum" };
      case "pos-product-movement":
        return { sold_qty: "sum", return_qty: "sum", net_qty: "sum", revenue: "sum" };
      case "pos-category-totals":
        return { items: "sum", qty: "sum", revenue: "sum" };
      case "pos-invoice-timing":
        return { total: "sum" };
      case "pos-credit-sales":
        return { orders: "sum", credit_total: "sum" };
      case "ar-aging-detail": case "ap-aging-detail":
        return { current: "sum", d31_60: "sum", d61_90: "sum", over90: "sum", total: "sum" };
      case "customer-profitability": case "supplier-purchase-analysis":
        return { totalSales: "sum", total: "sum", invCount: "sum" };
      case "checks-receivable": case "checks-payable":
        return { amount: "sum" };
      case "customer-statement-all": case "supplier-statement-all":
        return { debit: "sum", credit: "sum" };
      case "dpo-report":
        return { totalPurchases: "sum", invCount: "sum" };
      case "invoice-lifecycle":
        return { total: "sum", paid: "sum", remaining: "sum" };
      case "dso-detailed":
        return { invCount: "sum" };
      case "ar-aging-advanced":
        return { current: "sum", d1_30: "sum", d31_60: "sum", d61_90: "sum", over90: "sum", total: "sum" };
      case "collection-efficiency":
        return { issued: "sum", collected: "sum", onTime: "sum", late: "sum" };
      case "payment-allocation":
        return { allocated: "sum" };
      case "unpaid-invoices":
        return { total: "sum" };
      default:
        return undefined;
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

  // ═══════════════════════════════════
  // RENDERERS
  // ═══════════════════════════════════

  const thClass = "text-right px-3 py-3 font-semibold text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]";
  const tdClass = "px-3 py-2.5 text-sm";
  const trClass = "border-b border-border/30 hover:bg-accent/30 transition-colors";
  const totalRowClass = "bg-accent/50 font-bold border-t-2 border-primary";
  const monoClass = "font-mono text-xs";

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

    // Try to use SortableReportTable for defined reports
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

    // Fallback to custom renderers for special layouts
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

  // ─── Render functions ───

  const renderAgingTable = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>{reportKey === "ar-aging" ? "الزبون" : "المورد"}</th>
      <th className={thClass}>التصنيف</th>
      <th className={`${thClass} !bg-green-700`}>جاري</th>
      <th className={`${thClass} !bg-yellow-600`}>1-30</th>
      <th className={`${thClass} !bg-orange-600`}>31-60</th>
      <th className={`${thClass} !bg-red-600`}>61-90</th>
      <th className={`${thClass} !bg-red-800`}>+90</th>
      <th className={thClass}>الإجمالي</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td>
        <td className={tdClass}>{r.cls}</td>
        <td className={`${tdClass} ${monoClass} text-green-600`}>{fmtAmt(r.current)}</td>
        <td className={`${tdClass} ${monoClass} text-yellow-600`}>{fmtAmt(r.d30)}</td>
        <td className={`${tdClass} ${monoClass} text-orange-600`}>{fmtAmt(r.d60)}</td>
        <td className={`${tdClass} ${monoClass} text-red-500`}>{fmtAmt(r.d90)}</td>
        <td className={`${tdClass} ${monoClass} text-red-700`}>{fmtAmt(r.over90)}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}>
      <td className={tdClass} colSpan={2}>الإجمالي</td>
      <td className={`${tdClass} ${monoClass}`}>{fmtAmt(data.reduce((s, r) => s + r.current, 0))}</td>
      <td className={`${tdClass} ${monoClass}`}>{fmtAmt(data.reduce((s, r) => s + r.d30, 0))}</td>
      <td className={`${tdClass} ${monoClass}`}>{fmtAmt(data.reduce((s, r) => s + r.d60, 0))}</td>
      <td className={`${tdClass} ${monoClass}`}>{fmtAmt(data.reduce((s, r) => s + r.d90, 0))}</td>
      <td className={`${tdClass} ${monoClass}`}>{fmtAmt(data.reduce((s, r) => s + r.over90, 0))}</td>
      <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s, r) => s + r.total, 0))}</td>
    </tr></tfoot></table></div>
  );

  const renderCashFlow = () => (
    <div className="max-w-xl mx-auto space-y-3 py-4">
      {data.map((r, i) => <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${i === data.length - 1 ? "bg-primary/5 border-primary/30 font-bold" : "border-border/50"}`}>
        <span className="text-sm">{r.section}</span>
        <span className={`${monoClass} font-bold ${r.amount >= 0 ? "text-green-600" : "text-red-500"}`}>{r.amount < 0 ? `(${fmtAmt(r.amount)})` : fmtAmt(r.amount)}</span>
      </div>)}
    </div>
  );

  const renderDailySalesTable = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>عدد الفواتير</th><th className={thClass}>المبيعات</th><th className={thClass}>المرتجعات</th><th className={thClass}>الصافي</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.date}</td>
        <td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.sales)}</td>
        <td className={`${tdClass} ${monoClass} text-red-500`}>{r.returns > 0 ? `(${fmtAmt(r.returns)})` : "-"}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.net)}</td>
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}>
      <td className={tdClass}>الإجمالي</td>
      <td className={`${tdClass} text-center ${monoClass}`}>{data.reduce((s, r) => s + r.count, 0)}</td>
      <td className={`${tdClass} ${monoClass}`}>{fmtAmt(data.reduce((s, r) => s + r.sales, 0))}</td>
      <td className={`${tdClass} ${monoClass} text-red-500`}>{fmtAmt(data.reduce((s, r) => s + r.returns, 0))}</td>
      <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s, r) => s + r.net, 0))}</td>
    </tr></tfoot></table></div>
  );

  const renderDailyTotalsTable = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>العدد</th><th className={thClass}>الإجمالي</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}><td className={`${tdClass} ${monoClass}`}>{r.date}</td><td className={`${tdClass} text-center ${monoClass}`}>{r.count}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td></tr>)}
    </tbody><tfoot><tr className={totalRowClass}><td className={tdClass}>الإجمالي</td><td className={`${tdClass} text-center ${monoClass}`}>{data.reduce((s, r) => s + r.count, 0)}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s, r) => s + r.total, 0))}</td></tr></tfoot></table></div>
  );

  const renderSalesByProduct = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الصنف</th><th className={thClass}>الكمية</th><th className={thClass}>الإيرادات</th><th className={thClass}>التكلفة</th><th className={thClass}>الربح</th><th className={thClass}>الهامش</th>
    </tr></thead><tbody>
      {data.map((r, i) => { const margin = r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue * 100) : 0; return <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td><td className={`${tdClass} ${monoClass} text-center`}>{r.qty}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.revenue)}</td><td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.cost)}</td>
        <td className={`${tdClass} ${monoClass} ${r.revenue - r.cost >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtAmt(r.revenue - r.cost)}</td>
        <td className={`${tdClass} ${monoClass}`}>{margin.toFixed(1)}%</td>
      </tr>; })}
    </tbody></table></div>
  );

  const renderDeadStock = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الصنف</th><th className={thClass}>الكمية</th><th className={thClass}>القيمة المجمدة</th><th className={thClass}>آخر حركة</th><th className={thClass}>الأيام</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td><td className={`${tdClass} ${monoClass} text-center`}>{r.qty}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.value)}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.lastMove?.split("T")[0] || "لا يوجد"}</td>
        <td className={`${tdClass} ${monoClass} ${r.days > 180 ? "text-red-600 font-bold" : "text-orange-500"}`}>{r.days >= 999 ? "+999" : r.days}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderProductProfitability = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الصنف</th><th className={thClass}>سعر الشراء</th><th className={thClass}>سعر البيع</th><th className={thClass}>الربح/وحدة</th><th className={thClass}>الهامش</th><th className={thClass}>المخزون</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.buyPrice)}</td><td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.sellPrice)}</td>
        <td className={`${tdClass} ${monoClass} ${r.profit >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtAmt(r.profit)}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.margin.toFixed(1)}%</td><td className={`${tdClass} ${monoClass} text-center`}>{r.stock}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderKPIs = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
      {data.map((r, i) => <Card key={i} className="p-5 flex flex-col gap-2 border-border/50">
        <span className="text-xs text-muted-foreground">{r.label}</span>
        <span className="text-lg font-bold font-mono" style={{ color: r.color }}>{r.value}</span>
      </Card>)}
    </div>
  );

  const renderMonthComparison = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الشهر</th><th className={thClass}>الإيرادات</th><th className={thClass}>المصروفات</th><th className={thClass}>صافي الربح</th>
    </tr></thead><tbody>
      {data.map((r, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.month}</td>
        <td className={`${tdClass} ${monoClass} text-green-600`}>{fmtAmt(r.revenue)}</td>
        <td className={`${tdClass} ${monoClass} text-red-500`}>{fmtAmt(r.expenses)}</td>
        <td className={`${tdClass} ${monoClass} font-bold ${r.profit >= 0 ? "text-green-600" : "text-red-500"}`}>{r.profit < 0 ? `(${fmtAmt(r.profit)})` : fmtAmt(r.profit)}</td>
      </tr>)}
    </tbody></table></div>
  );

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

  const renderCheques = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>رقم الشيك</th><th className={thClass}>البنك</th><th className={thClass}>الطرف</th><th className={thClass}>المبلغ</th><th className={thClass}>تاريخ الاستحقاق</th><th className={thClass}>النوع</th><th className={thClass}>الحالة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => {
        const statusColors: Record<string, string> = { "معلق": "text-yellow-600 bg-yellow-50", "محصل": "text-green-600 bg-green-50", "مرتجع": "text-red-600 bg-red-50", "ملغي": "text-muted-foreground bg-muted/50" };
        return <tr key={i} className={trClass}>
          <td className={`${tdClass} ${monoClass}`}>{r.cheque_number || "-"}</td><td className={tdClass}>{r.bank_name || "-"}</td>
          <td className={`${tdClass} font-medium`}>{r.party_name}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.amount)}</td>
          <td className={`${tdClass} ${monoClass}`}>{fmtDateDisplay(r.cheque_date)}</td><td className={tdClass}>{r.cheque_type}</td>
          <td className={tdClass}><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || ""}`}>{r.status}</span></td>
        </tr>;
      })}
    </tbody></table></div>
  );

  const renderTransactionList = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>البيان</th><th className={thClass}>المبلغ</th><th className={thClass}>طريقة الدفع</th><th className={thClass}>المرجع</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
         <td className={`${tdClass} ${monoClass}`}>{fmtDateDisplay(r.transaction_date)}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.amount)}</td>
        <td className={tdClass}>{r.payment_method || "-"}</td><td className={`${tdClass} ${monoClass}`}>{r.reference || "-"}</td>
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}><td className={tdClass} colSpan={2}>الإجمالي ({data.length})</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s: number, r: any) => s + (r.amount || 0), 0))}</td><td colSpan={2} /></tr></tfoot></table></div>
  );

  const renderGroupedByContact = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>{reportKey === "by-customer" ? "الزبون" : "المورد"}</th>
      {reportKey === "by-customer" && <th className={thClass}>التصنيف</th>}
      <th className={thClass}>عدد الفواتير</th><th className={thClass}>الإجمالي</th>
      {reportKey === "by-customer" && <th className={thClass}>آخر عملية</th>}
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td>
        {reportKey === "by-customer" && <td className={tdClass}>{r.cls}</td>}
        <td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
        {reportKey === "by-customer" && <td className={`${tdClass} ${monoClass}`}>{r.lastDate || "-"}</td>}
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}>
      <td className={tdClass} colSpan={reportKey === "by-customer" ? 2 : 1}>الإجمالي</td>
      <td className={`${tdClass} ${monoClass} text-center`}>{data.reduce((s: number, r: any) => s + r.count, 0)}</td>
      <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s: number, r: any) => s + r.total, 0))}</td>
      {reportKey === "by-customer" && <td />}
    </tr></tfoot></table></div>
  );

  const renderReturns = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>البيان</th><th className={thClass}>المبلغ</th><th className={thClass}>المرجع</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
         <td className={`${tdClass} ${monoClass}`}>{fmtDateDisplay(r.transaction_date)}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
        <td className={`${tdClass} ${monoClass} font-bold text-red-500`}>{fmtAmt(r.amount)}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.reference || "-"}</td>
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}><td className={tdClass} colSpan={2}>إجمالي المرتجعات ({data.length})</td><td className={`${tdClass} ${monoClass} font-bold text-red-500`}>{fmtAmt(data.reduce((s: number, r: any) => s + (r.amount || 0), 0))}</td><td /></tr></tfoot></table></div>
  );

  const renderSupplierComparison = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>المورد</th><th className={thClass}>البيان</th><th className={thClass}>المبلغ</th><th className={thClass}>التاريخ</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.supplier}</td><td className={`${tdClass} text-xs`}>{r.description}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.amount)}</td><td className={`${tdClass} ${monoClass}`}>{r.date}</td>
      </tr>)}
    </tbody></table>
    <p className="text-[10px] text-muted-foreground mt-2 text-center">⚠️ بيانات تقريبية — سيتم تحسين الدقة عند إضافة تفاصيل أسطر فواتير الشراء</p></div>
  );

  const renderInventoryValuation = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الصنف</th><th className={thClass}>الكمية</th><th className={thClass}>متوسط التكلفة</th><th className={thClass}>القيمة</th><th className={thClass}>النسبة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td><td className={`${tdClass} ${monoClass} text-center`}>{r.qty}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.cost)}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.value)}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.pct.toFixed(1)}%</td>
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}><td className={tdClass} colSpan={3}>إجمالي قيمة المخزون</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s: number, r: any) => s + r.value, 0))}</td><td /></tr></tfoot></table></div>
  );

  const renderStockMovement = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>الصنف</th><th className={thClass}>النوع</th><th className={thClass}>الكمية</th><th className={thClass}>المرجع</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.date}</td><td className={`${tdClass} font-medium`}>{r.product}</td>
        <td className={tdClass}>{r.type}</td><td className={`${tdClass} ${monoClass} ${r.qty < 0 ? "text-red-500" : "text-green-600"}`}>{r.qty}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.ref}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderBelowReorder = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الصنف</th><th className={thClass}>الكمية الحالية</th><th className={thClass}>الحد الأدنى</th><th className={thClass}>النقص</th><th className={thClass}>تكلفة الطلب</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={`${trClass} bg-red-50/30`}>
        <td className={`${tdClass} font-medium`}>{r.name}</td><td className={`${tdClass} ${monoClass} text-center text-red-500 font-bold`}>{r.qty}</td>
        <td className={`${tdClass} ${monoClass} text-center`}>{r.min}</td><td className={`${tdClass} ${monoClass} text-center text-red-600 font-bold`}>{r.shortage}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.reorderCost)}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderEmployeeDirectory = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الاسم</th><th className={thClass}>القسم</th><th className={thClass}>المسمى</th><th className={thClass}>تاريخ التعيين</th><th className={thClass}>الراتب</th><th className={thClass}>الحالة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.full_name}</td><td className={tdClass}>{r.department || "-"}</td>
        <td className={tdClass}>{r.job_title || "-"}</td><td className={`${tdClass} ${monoClass}`}>{r.hire_date || "-"}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.salary ? fmtAmt(r.salary) : "-"}</td>
        <td className={tdClass}><span className={`px-2 py-1 rounded-full text-xs ${r.employment_status === "active" ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"}`}>{r.employment_status === "active" ? "نشط" : r.employment_status || "-"}</span></td>
      </tr>)}
    </tbody></table></div>
  );

  const renderAssetRegister = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>رقم الأصل</th><th className={thClass}>الاسم</th><th className={thClass}>التكلفة</th><th className={thClass}>مجمع الاستهلاك</th><th className={thClass}>القيمة الدفترية</th><th className={thClass}>الحالة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.asset_number}</td><td className={`${tdClass} font-medium`}>{r.name_ar}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.acquisition_cost || 0)}</td>
        <td className={`${tdClass} ${monoClass}`}>{fmtAmt(r.accumulated_depreciation || 0)}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.net_book_value || 0)}</td>
        <td className={tdClass}>{r.status}</td>
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

  const renderAllOrders = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>رقم الطلب</th><th className={thClass}>التاريخ</th><th className={thClass}>الزبون</th><th className={thClass}>المبلغ</th><th className={thClass}>الحالة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => {
        const stateColors: Record<string, string> = { paid: "bg-green-50 text-green-600", cancelled: "bg-red-50 text-red-600", draft: "bg-yellow-50 text-yellow-600" };
        const stateLabels: Record<string, string> = { paid: "مكتمل", cancelled: "ملغي", draft: "مسودة" };
        return <tr key={i} className={trClass}>
          <td className={`${tdClass} ${monoClass}`}>{r.order_number || "-"}</td><td className={`${tdClass} ${monoClass}`}>{r.created_at?.split("T")[0]}</td>
          <td className={`${tdClass} font-medium`}>{r.customer_name || "-"}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
          <td className={tdClass}><span className={`px-2 py-1 rounded-full text-xs ${stateColors[r.state] || "bg-muted"}`}>{stateLabels[r.state] || r.state}</span></td>
        </tr>;
      })}
    </tbody></table></div>
  );

  const renderPOSDailySales = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>التاريخ</th><th className={thClass}>الكاشير</th><th className={thClass}>عدد الفواتير</th><th className={thClass}>الإجمالي</th><th className={thClass}>متوسط الفاتورة</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.date}</td><td className={`${tdClass} font-medium`}>{r.cashier}</td>
        <td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.count > 0 ? fmtAmt(r.total / r.count) : "-"}</td>
      </tr>)}
    </tbody><tfoot><tr className={totalRowClass}><td className={tdClass} colSpan={2}>الإجمالي</td><td className={`${tdClass} text-center ${monoClass}`}>{data.reduce((s: number, r: any) => s + r.count, 0)}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(data.reduce((s: number, r: any) => s + r.total, 0))}</td><td /></tr></tfoot></table></div>
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

  const renderPOSCashierPerformance = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الكاشير</th><th className={thClass}>عدد الفواتير</th><th className={thClass}>إجمالي المبيعات</th><th className={thClass}>متوسط الفاتورة</th><th className={thClass}>الملغية</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} font-medium`}>{r.name}</td><td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td>
        <td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
        <td className={`${tdClass} ${monoClass}`}>{r.count > 0 ? fmtAmt(r.total / r.count) : "-"}</td>
        <td className={`${tdClass} ${monoClass} ${r.cancelled > 0 ? "text-red-500 font-bold" : ""}`}>{r.cancelled}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderPOSCancelled = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>رقم الطلب</th><th className={thClass}>التاريخ</th><th className={thClass}>الزبون</th><th className={thClass}>المبلغ</th><th className={thClass}>السبب</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={`${trClass} bg-red-50/20`}>
         <td className={`${tdClass} ${monoClass}`}>{r.order_number || "-"}</td><td className={`${tdClass} ${monoClass}`}>{fmtDateDisplay(r.created_at?.split("T")[0])}</td>
        <td className={`${tdClass} font-medium`}>{r.customer_name || "-"}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
        <td className={`${tdClass} text-xs text-red-600`}>{r.return_reason || "-"}</td>
      </tr>)}
    </tbody></table></div>
  );

  const renderPOSPeakHours = () => (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className={thClass}>الساعة</th><th className={thClass}>اليوم</th><th className={thClass}>عدد الطلبات</th><th className={thClass}>الإجمالي</th>
    </tr></thead><tbody>
      {data.map((r: any, i) => <tr key={i} className={trClass}>
        <td className={`${tdClass} ${monoClass}`}>{r.hour}:00</td><td className={`${tdClass}`}>{r.dayName}</td>
        <td className={`${tdClass} ${monoClass} text-center`}>{r.count}</td><td className={`${tdClass} ${monoClass} font-bold`}>{fmtAmt(r.total)}</td>
      </tr>)}
    </tbody></table></div>
  );

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

  // KPI Summary for POS reports
  const getPOSKPIs = (): { label: string; value: string }[] => {
    if (!data.length) return [];
    switch (reportKey) {
      case "pos-daily-sales":
      case "pos-invoice-register": {
        const total = data.reduce((s, r) => s + (r.total || 0), 0);
        const disc = data.reduce((s, r) => s + (r.discount || 0), 0);
        return [
          { label: "عدد الفواتير", value: String(data.length) },
          { label: "إجمالي المبيعات", value: `₪${total.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "إجمالي الخصومات", value: `₪${disc.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "متوسط الفاتورة", value: `₪${(total / data.length).toLocaleString("en", { minimumFractionDigits: 2 })}` },
        ];
      }
      case "pos-cashier-performance": {
        const totalSales = data.reduce((s, r) => s + (r.total || 0), 0);
        const totalOrders = data.reduce((s, r) => s + (r.count || 0), 0);
        return [
          { label: "عدد الكاشيرين", value: String(data.length) },
          { label: "إجمالي المبيعات", value: `₪${totalSales.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "إجمالي الطلبات", value: String(totalOrders) },
          { label: "المتوسط لكل كاشير", value: `₪${(totalSales / data.length).toLocaleString("en", { minimumFractionDigits: 2 })}` },
        ];
      }
      case "pos-sales-by-category": {
        const totalRev = data.reduce((s, r) => s + (r.revenue || 0), 0);
        const totalProfit = data.reduce((s, r) => s + (r.profit || 0), 0);
        const totalQty = data.reduce((s, r) => s + (r.qty || 0), 0);
        return [
          { label: "عدد الأصناف", value: String(data.length) },
          { label: "إجمالي المبيعات", value: `₪${totalRev.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "إجمالي الربح", value: `₪${totalProfit.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "إجمالي الكميات", value: String(totalQty) },
        ];
      }
      case "pos-payment-methods": {
        const totalAmt = data.reduce((s, r) => s + (r.total || 0), 0);
        const totalTx = data.reduce((s, r) => s + (r.count || 0), 0);
        return [
          { label: "طرق الدفع", value: String(data.length) },
          { label: "إجمالي المبلغ", value: `₪${totalAmt.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "عدد المعاملات", value: String(totalTx) },
          { label: "المتوسط", value: `₪${(totalTx > 0 ? totalAmt / totalTx : 0).toLocaleString("en", { minimumFractionDigits: 2 })}` },
        ];
      }
      case "pos-product-movement": {
        const soldQty = data.reduce((s, r) => s + (r.sold_qty || 0), 0);
        const retQty = data.reduce((s, r) => s + (r.return_qty || 0), 0);
        const rev = data.reduce((s, r) => s + (r.revenue || 0), 0);
        return [
          { label: "عدد الأصناف", value: String(data.length) },
          { label: "إجمالي المبيعات", value: `₪${rev.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "الكميات المباعة", value: String(soldQty) },
          { label: "الكميات المرتجعة", value: String(retQty) },
        ];
      }
      case "pos-invoice-timing": {
        const avgDur = data.reduce((s, r) => s + (r.duration_min || 0), 0) / data.length;
        const maxDur = Math.max(...data.map(r => r.duration_min || 0));
        return [
          { label: "عدد الفواتير", value: String(data.length) },
          { label: "متوسط مدة الخدمة", value: `${avgDur.toFixed(1)} دقيقة` },
          { label: "أطول خدمة", value: `${maxDur} دقيقة` },
          { label: "إجمالي المبيعات", value: `₪${data.reduce((s, r) => s + (r.total || 0), 0).toLocaleString("en", { minimumFractionDigits: 2 })}` },
        ];
      }
      case "pos-credit-sales": {
        const totalCredit = data.reduce((s, r) => s + (r.credit_total || 0), 0);
        const totalOrd = data.reduce((s, r) => s + (r.orders || 0), 0);
        return [
          { label: "عدد العملاء", value: String(data.length) },
          { label: "إجمالي المديونيات", value: `₪${totalCredit.toLocaleString("en", { minimumFractionDigits: 2 })}` },
          { label: "عدد الفواتير", value: String(totalOrd) },
        ];
      }
      default:
        return [];
    }
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
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5 text-xs">
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
        <Button variant="outline" size="sm" onClick={loadReport} className="text-xs h-8">تحديث</Button>
      </Card>

      {/* KPI Summary Cards for POS reports */}
      {!loading && data.length > 0 && reportKey.startsWith("pos-") && (() => {
        const kpis = getPOSKPIs();
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

import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInDays } from "date-fns";
import { ArrowRight, Download, Printer, CalendarDays, FileSpreadsheet, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface GenericReportPageProps {
  reportKey: string;
}

// ─── Report configurations ───
const reportConfigs: Record<string, {
  title: string;
  description: string;
}> = {
  "ar-aging": { title: "أعمار الذمم المدينة", description: "أرصدة العملاء المستحقة مصنفة حسب العمر" },
  "ap-aging": { title: "أعمار الذمم الدائنة", description: "أرصدة الموردين المستحقة مصنفة حسب العمر" },
  "cash-flow": { title: "التدفقات النقدية", description: "التدفقات التشغيلية والاستثمارية والتمويلية" },
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
};

const GenericReportPage = ({ reportKey }: GenericReportPageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const config = reportConfigs[reportKey] || { title: "تقرير", description: "" };
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    if (user) loadReport();
  }, [user, dateFrom, dateTo, reportKey]);

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);
    try {
      switch (reportKey) {
        case "ar-aging":
        case "ap-aging":
          await loadAgingReport(reportKey === "ar-aging" ? "عميل" : "مورد");
          break;
        case "cash-flow":
          await loadCashFlowReport();
          break;
        case "daily-sales":
          await loadDailySalesReport();
          break;
        case "sales-by-product":
          await loadSalesByProductReport();
          break;
        case "dead-stock":
          await loadDeadStockReport();
          break;
        case "product-profitability":
          await loadProductProfitability();
          break;
        case "financial-kpi":
          await loadFinancialKPIs();
          break;
        case "month-comparison":
          await loadMonthComparison();
          break;
        case "foreign-balances":
          await loadForeignBalances();
          break;
        default:
          await loadGenericTransactions();
          break;
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // ─── AR/AP Aging ───
  const loadAgingReport = async (contactType: string) => {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, contact_name, current_balance, contact_class")
      .eq("user_id", user!.id)
      .eq("contact_type", contactType)
      .gt("current_balance", 0);

    if (!contacts?.length) { setData([]); return; }

    const { data: txns } = await supabase
      .from("transactions")
      .select("contact_id, transaction_date, amount, debit_account_code, credit_account_code")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .in("contact_id", contacts.map(c => c.id));

    const today = new Date();
    const agingMap: Record<string, { name: string; cls: string; current: number; d30: number; d60: number; d90: number; over90: number; total: number }> = {};

    contacts.forEach(c => {
      agingMap[c.id] = { name: c.contact_name, cls: c.contact_class || "-", current: 0, d30: 0, d60: 0, d90: 0, over90: 0, total: c.current_balance || 0 };
    });

    (txns || []).forEach(tx => {
      if (!tx.contact_id || !agingMap[tx.contact_id]) return;
      const days = differenceInDays(today, new Date(tx.transaction_date));
      const entry = agingMap[tx.contact_id];
      const amt = tx.amount;
      if (days <= 0) entry.current += amt;
      else if (days <= 30) entry.d30 += amt;
      else if (days <= 60) entry.d60 += amt;
      else if (days <= 90) entry.d90 += amt;
      else entry.over90 += amt;
    });

    setData(Object.values(agingMap).sort((a, b) => b.total - a.total));
  };

  // ─── Cash Flow ───
  const loadCashFlowReport = async () => {
    const { data: txns } = await supabase
      .from("transactions")
      .select("debit_account_code, credit_account_code, amount, transaction_type")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo);

    if (!txns?.length) { setData([]); return; }

    let operating = 0, investing = 0, financing = 0;
    txns.forEach(tx => {
      const dc = tx.debit_account_code || "";
      const cc = tx.credit_account_code || "";
      // Operating: revenue (4xxx) and expenses (5xxx)
      if (dc.startsWith("4") || cc.startsWith("4") || dc.startsWith("5") || cc.startsWith("5")) {
        if (cc.startsWith("4")) operating += tx.amount;
        else if (dc.startsWith("5")) operating -= tx.amount;
        else operating += tx.amount;
      }
      // Investing: fixed assets (12xx)
      else if (dc.startsWith("12") || cc.startsWith("12")) {
        if (dc.startsWith("12")) investing -= tx.amount;
        else investing += tx.amount;
      }
      // Financing: equity (3xxx) and long-term liabilities (22xx)
      else if (dc.startsWith("3") || cc.startsWith("3") || dc.startsWith("22") || cc.startsWith("22")) {
        if (cc.startsWith("3") || cc.startsWith("22")) financing += tx.amount;
        else financing -= tx.amount;
      }
    });

    setData([
      { section: "أنشطة تشغيلية", amount: operating },
      { section: "أنشطة استثمارية", amount: investing },
      { section: "أنشطة تمويلية", amount: financing },
      { section: "صافي التغير في النقد", amount: operating + investing + financing },
    ]);
  };

  // ─── Daily Sales ───
  const loadDailySalesReport = async () => {
    const { data: txns } = await supabase
      .from("transactions")
      .select("transaction_date, amount, transaction_type")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"])
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("transaction_date", { ascending: true });

    const dayMap: Record<string, { date: string; count: number; total: number }> = {};
    (txns || []).forEach(tx => {
      const d = tx.transaction_date;
      if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0 };
      dayMap[d].count++;
      dayMap[d].total += tx.amount;
    });
    setData(Object.values(dayMap));
  };

  // ─── Sales by Product ───
  const loadSalesByProductReport = async () => {
    const { data: lines } = await supabase
      .from("pos_order_lines")
      .select("product_name, qty, line_total, cost_price, order_id")
      .limit(1000);

    const productMap: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
    (lines || []).forEach(l => {
      if (!productMap[l.product_name]) productMap[l.product_name] = { name: l.product_name, qty: 0, revenue: 0, cost: 0 };
      productMap[l.product_name].qty += l.qty;
      productMap[l.product_name].revenue += l.line_total;
      productMap[l.product_name].cost += (l.cost_price || 0) * l.qty;
    });
    setData(Object.values(productMap).sort((a, b) => b.revenue - a.revenue));
  };

  // ─── Dead Stock ───
  const loadDeadStockReport = async () => {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, quantity, buy_price, updated_at")
      .eq("user_id", user!.id);

    const today = new Date();
    const dead = (products || [])
      .map(p => ({
        name: p.name,
        qty: p.quantity || 0,
        value: (p.quantity || 0) * (p.buy_price || 0),
        lastMove: p.updated_at,
        days: differenceInDays(today, new Date(p.updated_at)),
      }))
      .filter(p => p.days >= 90)
      .sort((a, b) => b.days - a.days);
    setData(dead);
  };

  // ─── Product Profitability ───
  const loadProductProfitability = async () => {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, buy_price, sell_price, quantity")
      .eq("user_id", user!.id);

    setData((products || []).map(p => ({
      name: p.name,
      buyPrice: p.buy_price || 0,
      sellPrice: p.sell_price || 0,
      margin: p.sell_price && p.buy_price ? ((p.sell_price - p.buy_price) / p.sell_price * 100) : 0,
      profit: (p.sell_price || 0) - (p.buy_price || 0),
      stock: p.quantity || 0,
    })).sort((a, b) => b.margin - a.margin));
  };

  // ─── Financial KPIs ───
  const loadFinancialKPIs = async () => {
    const { data: txns } = await supabase
      .from("transactions")
      .select("debit_account_code, credit_account_code, amount")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo);

    let revenue = 0, cogs = 0, expenses = 0, currentAssets = 0, currentLiabilities = 0;
    (txns || []).forEach(tx => {
      const dc = tx.debit_account_code || "";
      const cc = tx.credit_account_code || "";
      if (cc.startsWith("4")) revenue += tx.amount;
      if (dc.startsWith("51")) cogs += tx.amount;
      if (dc.startsWith("5") && !dc.startsWith("51")) expenses += tx.amount;
    });

    const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue * 100) : 0;
    const netMargin = revenue > 0 ? ((revenue - cogs - expenses) / revenue * 100) : 0;

    setData([
      { label: "إجمالي الإيرادات", value: `₪${revenue.toLocaleString()}`, color: "#059669" },
      { label: "هامش الربح الإجمالي", value: `${grossMargin.toFixed(1)}%`, color: grossMargin >= 30 ? "#059669" : "#DC2626" },
      { label: "هامش الربح الصافي", value: `${netMargin.toFixed(1)}%`, color: netMargin >= 10 ? "#059669" : "#DC2626" },
      { label: "صافي الربح", value: `₪${(revenue - cogs - expenses).toLocaleString()}`, color: revenue - cogs - expenses >= 0 ? "#059669" : "#DC2626" },
      { label: "تكلفة المبيعات", value: `₪${cogs.toLocaleString()}`, color: "#6366F1" },
      { label: "المصروفات التشغيلية", value: `₪${expenses.toLocaleString()}`, color: "#DC2626" },
    ]);
  };

  // ─── Month Comparison ───
  const loadMonthComparison = async () => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      const from = format(startOfMonth(m), "yyyy-MM-dd");
      const to = format(endOfMonth(m), "yyyy-MM-dd");
      months.push({ label: format(m, "yyyy-MM"), from, to });
    }

    const { data: txns } = await supabase
      .from("transactions")
      .select("transaction_date, debit_account_code, credit_account_code, amount")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .gte("transaction_date", months[0].from)
      .lte("transaction_date", months[months.length - 1].to);

    const result = months.map(m => {
      let rev = 0, exp = 0;
      (txns || []).forEach(tx => {
        if (tx.transaction_date >= m.from && tx.transaction_date <= m.to) {
          if ((tx.credit_account_code || "").startsWith("4")) rev += tx.amount;
          if ((tx.debit_account_code || "").startsWith("5")) exp += tx.amount;
        }
      });
      return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp };
    });
    setData(result);
  };

  // ─── Foreign Balances ───
  const loadForeignBalances = async () => {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("account_code, account_name")
      .eq("user_id", user!.id)
      .in("account_code", ["1111", "1112", "1113", "1114"]);

    if (!accounts?.length) { setData([]); return; }

    const result = [];
    for (const acc of accounts) {
      const { data: txns } = await supabase
        .from("transactions")
        .select("amount, debit_account_code, credit_account_code")
        .eq("user_id", user!.id)
        .eq("is_deleted", false)
        .or(`debit_account_code.eq.${acc.account_code},credit_account_code.eq.${acc.account_code}`);

      let balance = 0;
      (txns || []).forEach(tx => {
        if (tx.debit_account_code === acc.account_code) balance += tx.amount;
        if (tx.credit_account_code === acc.account_code) balance -= tx.amount;
      });

      const currencyMap: Record<string, string> = { "1111": "USD", "1112": "JOD", "1113": "EUR", "1114": "EGP" };
      result.push({ account: acc.account_name, code: acc.account_code, currency: currencyMap[acc.account_code] || "—", balance });
    }
    setData(result);
  };

  // ─── Generic fallback ───
  const loadGenericTransactions = async () => {
    const { data: txns } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("transaction_date", { ascending: false })
      .limit(100);
    setData(txns || []);
  };

  // ─── Render helpers ───
  const renderContent = () => {
    if (loading) return <div className="text-center py-16 text-muted-foreground text-sm">جاري التحميل...</div>;
    if (!data.length) return <div className="text-center py-16 text-muted-foreground text-sm">لا توجد بيانات للفترة المحددة</div>;

    switch (reportKey) {
      case "ar-aging":
      case "ap-aging":
        return renderAgingTable();
      case "cash-flow":
        return renderCashFlow();
      case "daily-sales":
        return renderDailySales();
      case "sales-by-product":
        return renderSalesByProduct();
      case "dead-stock":
        return renderDeadStock();
      case "product-profitability":
        return renderProductProfitability();
      case "financial-kpi":
        return renderKPIs();
      case "month-comparison":
        return renderMonthComparison();
      case "foreign-balances":
        return renderForeignBalances();
      default:
        return renderGenericTable();
    }
  };

  const renderAgingTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{reportKey === "ar-aging" ? "العميل" : "المورد"}</th>
            <th className="text-right px-3 py-3 font-semibold text-muted-foreground">التصنيف</th>
            <th className="text-left px-3 py-3 font-semibold text-green-600">جاري</th>
            <th className="text-left px-3 py-3 font-semibold text-yellow-600">1-30</th>
            <th className="text-left px-3 py-3 font-semibold text-orange-600">31-60</th>
            <th className="text-left px-3 py-3 font-semibold text-red-500">61-90</th>
            <th className="text-left px-3 py-3 font-semibold text-red-700">+90</th>
            <th className="text-left px-3 py-3 font-semibold text-foreground">الإجمالي</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-3 text-muted-foreground">{row.cls}</td>
              <td className="px-3 py-3 font-mono text-green-600">₪{row.current.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-yellow-600">₪{row.d30.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-orange-600">₪{row.d60.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-red-500">₪{row.d90.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-red-700">₪{row.over90.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono font-bold text-foreground">₪{row.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30 border-t-2 border-border font-bold">
            <td className="px-4 py-3" colSpan={2}>الإجمالي</td>
            <td className="px-3 py-3 font-mono text-green-600">₪{data.reduce((s, r) => s + r.current, 0).toLocaleString()}</td>
            <td className="px-3 py-3 font-mono text-yellow-600">₪{data.reduce((s, r) => s + r.d30, 0).toLocaleString()}</td>
            <td className="px-3 py-3 font-mono text-orange-600">₪{data.reduce((s, r) => s + r.d60, 0).toLocaleString()}</td>
            <td className="px-3 py-3 font-mono text-red-500">₪{data.reduce((s, r) => s + r.d90, 0).toLocaleString()}</td>
            <td className="px-3 py-3 font-mono text-red-700">₪{data.reduce((s, r) => s + r.over90, 0).toLocaleString()}</td>
            <td className="px-3 py-3 font-mono">₪{data.reduce((s, r) => s + r.total, 0).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const renderCashFlow = () => (
    <div className="max-w-xl mx-auto space-y-3 py-4">
      {data.map((row, i) => (
        <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${i === data.length - 1 ? "bg-primary/5 border-primary/30 font-bold" : "border-border/50"}`}>
          <span className="text-sm text-foreground">{row.section}</span>
          <span className={`font-mono text-sm font-bold ${row.amount >= 0 ? "text-green-600" : "text-red-500"}`}>
            ₪{row.amount.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );

  const renderDailySales = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">التاريخ</th>
            <th className="text-center px-3 py-3 font-semibold text-muted-foreground">عدد الفواتير</th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">إجمالي المبيعات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-mono text-muted-foreground">{row.date}</td>
              <td className="px-3 py-3 text-center font-mono">{row.count}</td>
              <td className="px-4 py-3 font-mono font-bold text-foreground">₪{row.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30 border-t-2 border-border font-bold">
            <td className="px-4 py-3">الإجمالي</td>
            <td className="px-3 py-3 text-center font-mono">{data.reduce((s, r) => s + r.count, 0)}</td>
            <td className="px-4 py-3 font-mono">₪{data.reduce((s, r) => s + r.total, 0).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const renderSalesByProduct = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الصنف</th>
            <th className="text-center px-3 py-3 font-semibold text-muted-foreground">الكمية</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">الإيرادات</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">التكلفة</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">الربح</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">الهامش</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-3 text-center font-mono">{row.qty}</td>
              <td className="px-3 py-3 font-mono text-foreground">₪{row.revenue.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-muted-foreground">₪{row.cost.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono font-bold" style={{ color: row.revenue - row.cost >= 0 ? "#059669" : "#DC2626" }}>
                ₪{(row.revenue - row.cost).toLocaleString()}
              </td>
              <td className="px-3 py-3 font-mono text-muted-foreground">
                {row.revenue > 0 ? ((row.revenue - row.cost) / row.revenue * 100).toFixed(1) : "0"}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderDeadStock = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الصنف</th>
            <th className="text-center px-3 py-3 font-semibold text-muted-foreground">الكمية</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">القيمة المجمدة</th>
            <th className="text-center px-3 py-3 font-semibold text-muted-foreground">أيام بدون حركة</th>
            <th className="text-right px-3 py-3 font-semibold text-muted-foreground">آخر حركة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-3 text-center font-mono">{row.qty}</td>
              <td className="px-3 py-3 font-mono text-red-500">₪{row.value.toLocaleString()}</td>
              <td className="px-3 py-3 text-center font-mono font-bold text-red-600">{row.days}</td>
              <td className="px-3 py-3 font-mono text-muted-foreground text-xs">{format(new Date(row.lastMove), "yyyy-MM-dd")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderProductProfitability = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الصنف</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">سعر الشراء</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">سعر البيع</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">الربح/وحدة</th>
            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">الهامش</th>
            <th className="text-center px-3 py-3 font-semibold text-muted-foreground">المخزون</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-3 font-mono text-muted-foreground">₪{row.buyPrice.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-foreground">₪{row.sellPrice.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono font-bold" style={{ color: row.profit >= 0 ? "#059669" : "#DC2626" }}>
                ₪{row.profit.toLocaleString()}
              </td>
              <td className="px-3 py-3 font-mono" style={{ color: row.margin >= 20 ? "#059669" : row.margin >= 0 ? "#D97706" : "#DC2626" }}>
                {row.margin.toFixed(1)}%
              </td>
              <td className="px-3 py-3 text-center font-mono">{row.stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderKPIs = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
      {data.map((kpi, i) => (
        <Card key={i} className="p-5 border-border/60">
          <p className="text-xs font-medium text-muted-foreground mb-2">{kpi.label}</p>
          <p className="text-2xl font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</p>
        </Card>
      ))}
    </div>
  );

  const renderMonthComparison = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الشهر</th>
            <th className="text-left px-3 py-3 font-semibold text-green-600">الإيرادات</th>
            <th className="text-left px-3 py-3 font-semibold text-red-500">المصروفات</th>
            <th className="text-left px-3 py-3 font-semibold text-foreground">صافي الربح</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-mono text-foreground">{row.month}</td>
              <td className="px-3 py-3 font-mono text-green-600">₪{row.revenue.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-red-500">₪{row.expenses.toLocaleString()}</td>
              <td className="px-3 py-3 font-mono font-bold" style={{ color: row.profit >= 0 ? "#059669" : "#DC2626" }}>
                ₪{row.profit.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderForeignBalances = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
      {data.map((row, i) => (
        <Card key={i} className="p-5 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-foreground">{row.account}</p>
            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{row.currency}</span>
          </div>
          <p className="text-xl font-bold font-mono" style={{ color: row.balance >= 0 ? "#059669" : "#DC2626" }}>
            ₪{row.balance.toLocaleString()}
          </p>
        </Card>
      ))}
    </div>
  );

  const renderGenericTable = () => (
    <div className="text-center py-16 text-muted-foreground text-sm">
      <p>تم تسجيل {data.length} حركة للفترة المحددة</p>
    </div>
  );

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">{config.title}</h1>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-36 text-xs" />
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5">
          <Printer className="h-3.5 w-3.5" />
          طباعة
        </Button>
      </div>

      {/* Content */}
      <Card className="border-border/60 overflow-hidden">
        {renderContent()}
      </Card>
    </div>
  );
};

export default GenericReportPage;

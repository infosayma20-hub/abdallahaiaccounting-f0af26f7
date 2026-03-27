import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowRight, Calendar, Zap, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, Receipt, CreditCard, Wallet,
  PieChart, BarChart3, FileText, Download, Printer, Save,
  Trash2, Eye, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight,
  Users, Package, Award, AlertTriangle, Layers,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell,
  LineChart, Line, AreaChart, Area,
} from "recharts";

// ─── Helpers ───
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(n));
const fmtPct = (n: number) => (isNaN(n) || !isFinite(n)) ? "0%" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / Math.abs(prev)) * 100;
const COLORS = ["#10B981", "#F43F5E", "#F59E0B", "#6366F1", "#0EA5E9", "#8B5CF6", "#EC4899", "#14B8A6"];

type PeriodType = "monthly" | "quarterly" | "semi-annual" | "annual";

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth(); // 0-indexed

const PeriodicReportsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(currentMonth / 3));
  const [selectedHalf, setSelectedHalf] = useState(currentMonth < 6 ? 0 : 1);
  const [compareLastYear, setCompareLastYear] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("generator");
  const [archivedReports, setArchivedReports] = useState<any[]>([]);

  // ─── Period Range Calc ───
  const periodRange = useMemo(() => {
    let start: Date, end: Date, label: string;
    switch (periodType) {
      case "monthly":
        start = new Date(selectedYear, selectedMonth, 1);
        end = new Date(selectedYear, selectedMonth + 1, 0);
        label = `${MONTHS_AR[selectedMonth]} ${selectedYear}`;
        break;
      case "quarterly":
        start = new Date(selectedYear, selectedQuarter * 3, 1);
        end = new Date(selectedYear, selectedQuarter * 3 + 3, 0);
        label = `الربع ${selectedQuarter + 1} - ${selectedYear}`;
        break;
      case "semi-annual":
        start = new Date(selectedYear, selectedHalf * 6, 1);
        end = new Date(selectedYear, selectedHalf * 6 + 6, 0);
        label = `النصف ${selectedHalf === 0 ? "الأول" : "الثاني"} - ${selectedYear}`;
        break;
      case "annual":
        start = new Date(selectedYear, 0, 1);
        end = new Date(selectedYear, 11, 31);
        label = `السنة المالية ${selectedYear}`;
        break;
    }
    return { start, end, label };
  }, [periodType, selectedMonth, selectedYear, selectedQuarter, selectedHalf]);

  // ─── Data Fetching ───
  const fetchReportData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const startStr = periodRange.start.toISOString().split("T")[0];
      const endStr = periodRange.end.toISOString().split("T")[0];

      // Fetch transactions
      const { data: txns } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .gte("transaction_date", startStr)
        .lte("transaction_date", endStr)
        .neq("is_deleted", true);

      // Fetch cheques
      const { data: cheques } = await supabase
        .from("cheques")
        .select("*")
        .eq("user_id", user.id)
        .gte("cheque_date", startStr)
        .lte("cheque_date", endStr);

      // Fetch contacts
      const { data: contacts } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", user.id);

      // Previous period for comparison
      let prevTxns: any[] = [];
      if (compareLastYear) {
        const prevStart = new Date(periodRange.start);
        const prevEnd = new Date(periodRange.end);
        prevStart.setFullYear(prevStart.getFullYear() - 1);
        prevEnd.setFullYear(prevEnd.getFullYear() - 1);
        const { data } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .gte("transaction_date", prevStart.toISOString().split("T")[0])
          .lte("transaction_date", prevEnd.toISOString().split("T")[0])
          .neq("is_deleted", true);
        prevTxns = data || [];
      }

      // Process data
      const allTxns = txns || [];
      const sales = allTxns.filter(t =>
        t.transaction_type?.includes("sale") || t.transaction_type?.includes("pos_sale") ||
        t.debit_account_code?.startsWith("1") && t.credit_account_code?.startsWith("4")
      );
      const expenses = allTxns.filter(t =>
        t.transaction_type?.includes("expense") || t.transaction_type === "salary" ||
        t.debit_account_code?.startsWith("5")
      );
      const receipts = allTxns.filter(t =>
        t.transaction_type === "receipt" || t.transaction_type?.includes("receipt")
      );
      const payments = allTxns.filter(t =>
        t.transaction_type === "payment" || t.transaction_type?.includes("payment")
      );

      const totalSales = sales.reduce((s, t) => s + (t.amount || 0), 0);
      const totalExpenses = expenses.reduce((s, t) => s + (t.amount || 0), 0);
      const netProfit = totalSales - totalExpenses;
      const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

      const totalReceipts = receipts.reduce((s, t) => s + (t.amount || 0), 0);
      const totalPayments = payments.reduce((s, t) => s + (t.amount || 0), 0);

      // Previous period totals
      const prevSales = prevTxns.filter(t =>
        t.transaction_type?.includes("sale") || t.transaction_type?.includes("pos_sale") ||
        t.debit_account_code?.startsWith("1") && t.credit_account_code?.startsWith("4")
      ).reduce((s: number, t: any) => s + (t.amount || 0), 0);
      const prevExpenses = prevTxns.filter(t =>
        t.transaction_type?.includes("expense") || t.transaction_type === "salary" ||
        t.debit_account_code?.startsWith("5")
      ).reduce((s: number, t: any) => s + (t.amount || 0), 0);
      const prevProfit = prevSales - prevExpenses;

      // Expense categories
      const expenseByType: Record<string, number> = {};
      expenses.forEach(e => {
        const cat = e.description?.includes("راتب") ? "رواتب وأجور" :
          e.debit_account_code === "5100" || e.debit_account_code === "5110" ? "تكلفة البضاعة المباعة" :
          e.description?.includes("إيجار") ? "إيجار" :
          e.debit_account_code?.startsWith("52") ? "مصاريف إدارية" :
          e.debit_account_code?.startsWith("53") ? "مصاريف تشغيلية" : "مصاريف أخرى";
        expenseByType[cat] = (expenseByType[cat] || 0) + (e.amount || 0);
      });
      const expensePie = Object.entries(expenseByType).map(([name, value]) => ({
        name, value, pct: totalExpenses > 0 ? ((value / totalExpenses) * 100).toFixed(1) : "0"
      })).sort((a, b) => b.value - a.value);

      // Cheques summary
      const incomingCheques = (cheques || []).filter(c => c.cheque_type === "وارد");
      const outgoingCheques = (cheques || []).filter(c => c.cheque_type === "صادر");
      const chequeSummary = {
        incoming: {
          count: incomingCheques.length,
          total: incomingCheques.reduce((s, c) => s + c.amount, 0),
          collected: incomingCheques.filter(c => c.status === "محصل").length,
          pending: incomingCheques.filter(c => c.status === "مستحق" || c.status === "مسجل").length,
          returned: incomingCheques.filter(c => c.status === "مرتجع").length,
        },
        outgoing: {
          count: outgoingCheques.length,
          total: outgoingCheques.reduce((s, c) => s + c.amount, 0),
          collected: outgoingCheques.filter(c => c.status === "محصل").length,
          pending: outgoingCheques.filter(c => c.status === "مستحق" || c.status === "مسجل").length,
          returned: outgoingCheques.filter(c => c.status === "مرتجع").length,
        }
      };

      // Receivables/Payables
      const customers = (contacts || []).filter(c => c.contact_type === "عميل" || c.contact_type === "زبون");
      const suppliers = (contacts || []).filter(c => c.contact_type === "مورد");
      const totalReceivables = customers.reduce((s, c) => s + (c.current_balance || 0), 0);
      const totalPayables = suppliers.reduce((s, c) => s + Math.abs(c.current_balance || 0), 0);
      const overdueReceivables = customers.reduce((s, c) => s + (c.overdue_amount || 0), 0);
      const overduePayables = suppliers.reduce((s, c) => s + (c.overdue_amount || 0), 0);

      // Monthly breakdown for quarterly/semi-annual/annual
      const monthlyBreakdown: any[] = [];
      const monthCount = periodType === "monthly" ? 1 :
        periodType === "quarterly" ? 3 :
        periodType === "semi-annual" ? 6 : 12;
      const baseMonth = periodRange.start.getMonth();
      for (let i = 0; i < monthCount; i++) {
        const m = baseMonth + i;
        const mSales = allTxns.filter(t => {
          const d = new Date(t.transaction_date);
          return d.getMonth() === m && (
            t.transaction_type?.includes("sale") || t.transaction_type?.includes("pos_sale") ||
            (t.debit_account_code?.startsWith("1") && t.credit_account_code?.startsWith("4"))
          );
        }).reduce((s: number, t: any) => s + (t.amount || 0), 0);
        const mExpenses = allTxns.filter(t => {
          const d = new Date(t.transaction_date);
          return d.getMonth() === m && (
            t.transaction_type?.includes("expense") || t.transaction_type === "salary" ||
            t.debit_account_code?.startsWith("5")
          );
        }).reduce((s: number, t: any) => s + (t.amount || 0), 0);
        monthlyBreakdown.push({
          month: MONTHS_AR[m % 12],
          sales: mSales,
          expenses: mExpenses,
          profit: mSales - mExpenses,
          margin: mSales > 0 ? ((mSales - mExpenses) / mSales * 100) : 0,
        });
      }

      // Best/worst month
      const bestMonth = [...monthlyBreakdown].sort((a, b) => b.profit - a.profit)[0];
      const worstMonth = [...monthlyBreakdown].sort((a, b) => a.profit - b.profit)[0];

      // Quarterly breakdown for annual
      const quarterlyBreakdown: any[] = [];
      if (periodType === "annual") {
        for (let q = 0; q < 4; q++) {
          const qMonths = monthlyBreakdown.slice(q * 3, q * 3 + 3);
          quarterlyBreakdown.push({
            quarter: `Q${q + 1}`,
            sales: qMonths.reduce((s, m) => s + m.sales, 0),
            expenses: qMonths.reduce((s, m) => s + m.expenses, 0),
            profit: qMonths.reduce((s, m) => s + m.profit, 0),
          });
        }
      }

      // Top customers/products (from transactions with contact_id)
      const customerSales: Record<string, { name: string; total: number }> = {};
      sales.forEach(s => {
        if (s.contact_id) {
          const c = (contacts || []).find(co => co.id === s.contact_id);
          const name = c?.contact_name || "غير محدد";
          if (!customerSales[s.contact_id]) customerSales[s.contact_id] = { name, total: 0 };
          customerSales[s.contact_id].total += s.amount || 0;
        }
      });
      const topCustomers = Object.values(customerSales)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((c, i) => ({ ...c, rank: i + 1, pct: totalSales > 0 ? ((c.total / totalSales) * 100).toFixed(1) : "0" }));

      setReportData({
        periodLabel: periodRange.label,
        periodType,
        totalSales, totalExpenses, netProfit, profitMargin,
        totalReceipts, totalPayments,
        prevSales, prevExpenses, prevProfit,
        salesChange: pctChange(totalSales, prevSales),
        expenseChange: pctChange(totalExpenses, prevExpenses),
        profitChange: pctChange(netProfit, prevProfit),
        expensePie, chequeSummary,
        totalReceivables, totalPayables,
        overdueReceivables, overduePayables,
        monthlyBreakdown, bestMonth, worstMonth,
        quarterlyBreakdown, topCustomers,
        invoiceCount: sales.length,
        customerCount: Object.keys(customerSales).length,
        compareLastYear,
        cashBalance: totalReceipts - totalPayments,
      });
    } catch (err) {
      console.error(err);
      toast.error("خطأ في تحميل بيانات التقرير");
    }
    setLoading(false);
  }, [user, periodRange, compareLastYear, periodType]);

  // Load archived reports
  useEffect(() => {
    if (!user || activeTab !== "archive") return;
    supabase
      .from("generated_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setArchivedReports(data || []));
  }, [user, activeTab]);

  const saveToArchive = async () => {
    if (!user || !reportData) return;
    const { error } = await supabase.from("generated_reports").insert({
      user_id: user.id,
      report_type: periodType,
      period_type: periodType,
      period_start: periodRange.start.toISOString().split("T")[0],
      period_end: periodRange.end.toISOString().split("T")[0],
      title: `تقرير ${periodRange.label}`,
      data: reportData,
      created_by: user.email || "محاسب",
    });
    if (error) toast.error("خطأ في الحفظ");
    else toast.success("تم حفظ التقرير في الأرشيف");
  };

  const deleteArchived = async (id: string) => {
    await supabase.from("generated_reports").delete().eq("id", id);
    setArchivedReports(prev => prev.filter(r => r.id !== id));
    toast.success("تم حذف التقرير");
  };

  const handlePrint = () => { /* no browser print */ };

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto pb-10 print:pb-0" dir="rtl">
      <div className="print:hidden">
        <PageHeader title="التقارير الدورية" breadcrumb={["التقارير", "التقارير الدورية"]} />
      </div>

      {/* Tabs: Generator / Archive */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="print:hidden">
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="generator" className="flex-1 gap-1.5">
            <Zap className="h-3.5 w-3.5" /> توليد تقرير
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex-1 gap-1.5">
            <Layers className="h-3.5 w-3.5" /> أرشيف التقارير
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "generator" && (
        <>
          {/* Period Selector */}
          <Card className="border-border/60 print:hidden">
            <CardContent className="p-4 space-y-4">
              {/* Period Type Tabs */}
              <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <TabsList className="w-full">
                  <TabsTrigger value="monthly" className="flex-1">شهري</TabsTrigger>
                  <TabsTrigger value="quarterly" className="flex-1">ربع سنوي</TabsTrigger>
                  <TabsTrigger value="semi-annual" className="flex-1">نصف سنوي</TabsTrigger>
                  <TabsTrigger value="annual" className="flex-1">سنوي</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Period Selectors */}
              <div className="flex flex-wrap items-end gap-3">
                {periodType === "monthly" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">الشهر</label>
                      <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS_AR.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant={selectedMonth === currentMonth && selectedYear === currentYear ? "default" : "outline"}
                        onClick={() => { setSelectedMonth(currentMonth); setSelectedYear(currentYear); }}>
                        الشهر الحالي
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => { setSelectedMonth(currentMonth === 0 ? 11 : currentMonth - 1); if (currentMonth === 0) setSelectedYear(currentYear - 1); }}>
                        الشهر الماضي
                      </Button>
                    </div>
                  </>
                )}
                {periodType === "quarterly" && (
                  <div className="flex gap-1.5 flex-wrap">
                    {["Q1: يناير-مارس", "Q2: أبريل-يونيو", "Q3: يوليو-سبتمبر", "Q4: أكتوبر-ديسمبر"].map((q, i) => (
                      <Button key={i} size="sm" variant={selectedQuarter === i ? "default" : "outline"}
                        onClick={() => setSelectedQuarter(i)}>{q}</Button>
                    ))}
                  </div>
                )}
                {periodType === "semi-annual" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={selectedHalf === 0 ? "default" : "outline"}
                      onClick={() => setSelectedHalf(0)}>H1: يناير-يونيو</Button>
                    <Button size="sm" variant={selectedHalf === 1 ? "default" : "outline"}
                      onClick={() => setSelectedHalf(1)}>H2: يوليو-ديسمبر</Button>
                  </div>
                )}
                {periodType !== "monthly" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">السنة</label>
                    <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {periodType === "monthly" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">السنة</label>
                    <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Compare checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox id="compare" checked={compareLastYear} onCheckedChange={(c) => setCompareLastYear(!!c)} />
                <label htmlFor="compare" className="text-xs text-muted-foreground cursor-pointer">
                  مقارنة بنفس الفترة من العام الماضي
                </label>
              </div>

              {/* Generate Button */}
              <Button onClick={fetchReportData} disabled={loading} className="w-full h-11 text-sm font-bold gap-2">
                <Zap className="h-4 w-4" />
                {loading ? "جارٍ التوليد..." : "⚡ توليد التقرير"}
              </Button>
            </CardContent>
          </Card>

          {/* Report Content */}
          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
            </div>
          )}

          {reportData && !loading && (
            <div className="space-y-6">
              {/* Action Bar */}
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5"><Printer className="h-3.5 w-3.5" /> طباعة</Button>
                <Button size="sm" variant="outline" onClick={saveToArchive} className="gap-1.5"><Save className="h-3.5 w-3.5" /> حفظ في الأرشيف</Button>
              </div>

              {/* Report Title */}
              <div className="text-center space-y-1 print:mb-6">
                <h2 className="text-lg font-bold text-foreground">{reportData.periodLabel}</h2>
                <p className="text-xs text-muted-foreground">أُعِدّ بتاريخ {new Date().toLocaleDateString("ar-EG")}</p>
              </div>

              {/* Section 1: Executive Summary */}
              <ReportSection title="ملخص تنفيذي" icon={TrendingUp}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KPICard label="إجمالي المبيعات" value={reportData.totalSales} change={compareLastYear ? reportData.salesChange : null} />
                  <KPICard label="إجمالي المصاريف" value={reportData.totalExpenses} change={compareLastYear ? reportData.expenseChange : null} negative />
                  <KPICard label="صافي الربح" value={reportData.netProfit} change={compareLastYear ? reportData.profitChange : null} highlight />
                  <KPICard label="هامش الربح" value={reportData.profitMargin} isPercent />
                </div>
              </ReportSection>

              {/* Section 2: Sales Detail */}
              {reportData.topCustomers.length > 0 && (
                <ReportSection title="تفصيل المبيعات" icon={ShoppingCart}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 px-3 text-right font-semibold text-muted-foreground">#</th>
                          <th className="py-2 px-3 text-right font-semibold text-muted-foreground">الزبون</th>
                          <th className="py-2 px-3 text-left font-semibold text-muted-foreground">المبيعات</th>
                          <th className="py-2 px-3 text-left font-semibold text-muted-foreground">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.topCustomers.map((c: any) => (
                          <tr key={c.rank} className="border-b border-border/30">
                            <td className="py-2 px-3 text-muted-foreground">{c.rank}</td>
                            <td className="py-2 px-3 font-medium">{c.name}</td>
                            <td className="py-2 px-3 text-left">₪{fmt(c.total)}</td>
                            <td className="py-2 px-3 text-left text-muted-foreground">{c.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              )}

              {/* Section 3: Expenses */}
              {reportData.expensePie.length > 0 && (
                <ReportSection title="تفصيل المصاريف" icon={Receipt}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <RPieChart>
                          <Pie data={reportData.expensePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, pct }) => `${name} (${pct}%)`}>
                            {reportData.expensePie.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => `₪${fmt(v)}`} />
                        </RPieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="py-2 px-3 text-right font-semibold text-muted-foreground">نوع المصروف</th>
                            <th className="py-2 px-3 text-left font-semibold text-muted-foreground">المبلغ</th>
                            <th className="py-2 px-3 text-left font-semibold text-muted-foreground">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.expensePie.map((e: any, i: number) => (
                            <tr key={i} className="border-b border-border/30">
                              <td className="py-2 px-3 font-medium flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                {e.name}
                              </td>
                              <td className="py-2 px-3 text-left">₪{fmt(e.value)}</td>
                              <td className="py-2 px-3 text-left text-muted-foreground">{e.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </ReportSection>
              )}

              {/* Section 4: Receivables & Payables */}
              <ReportSection title="الذمم والتحصيل" icon={Users}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-border/40">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-[#10B981]">ذمم مدينة — الزبائن</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex justify-between"><span>إجمالي:</span><span className="font-bold">₪{fmt(reportData.totalReceivables)}</span></div>
                      <div className="flex justify-between"><span>محصّل هذه الفترة:</span><span>₪{fmt(reportData.totalReceipts)}</span></div>
                      <div className="flex justify-between text-[#F43F5E]"><span>متأخر:</span><span>₪{fmt(reportData.overdueReceivables)}</span></div>
                    </CardContent>
                  </Card>
                  <Card className="border-border/40">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-[#F43F5E]">ذمم دائنة — الموردون</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex justify-between"><span>إجمالي:</span><span className="font-bold">₪{fmt(reportData.totalPayables)}</span></div>
                      <div className="flex justify-between"><span>مدفوع هذه الفترة:</span><span>₪{fmt(reportData.totalPayments)}</span></div>
                      <div className="flex justify-between text-[#F59E0B]"><span>مستحق:</span><span>₪{fmt(reportData.overduePayables)}</span></div>
                    </CardContent>
                  </Card>
                </div>
              </ReportSection>

              {/* Section 5: Cheques */}
              <ReportSection title="الشيكات" icon={CreditCard}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 px-3 text-right font-semibold text-muted-foreground">النوع</th>
                        <th className="py-2 px-3 text-center font-semibold text-muted-foreground">العدد</th>
                        <th className="py-2 px-3 text-left font-semibold text-muted-foreground">الإجمالي</th>
                        <th className="py-2 px-3 text-center font-semibold text-muted-foreground">محصّل</th>
                        <th className="py-2 px-3 text-center font-semibold text-muted-foreground">معلق</th>
                        <th className="py-2 px-3 text-center font-semibold text-muted-foreground">مرتجع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "واردة", data: reportData.chequeSummary.incoming },
                        { label: "صادرة", data: reportData.chequeSummary.outgoing },
                      ].map((row) => (
                        <tr key={row.label} className="border-b border-border/30">
                          <td className="py-2 px-3 font-medium">{row.label}</td>
                          <td className="py-2 px-3 text-center">{row.data.count}</td>
                          <td className="py-2 px-3 text-left">₪{fmt(row.data.total)}</td>
                          <td className="py-2 px-3 text-center text-[#10B981]">{row.data.collected}</td>
                          <td className="py-2 px-3 text-center text-[#F59E0B]">{row.data.pending}</td>
                          <td className="py-2 px-3 text-center text-[#F43F5E]">{row.data.returned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReportSection>

              {/* Section 6: Cash Position */}
              <ReportSection title="الوضع النقدي" icon={Wallet}>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">+ إجمالي التحصيل:</span>
                    <span className="font-bold text-[#10B981]">₪{fmt(reportData.totalReceipts)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">- إجمالي المدفوعات:</span>
                    <span className="font-bold text-[#F43F5E]">₪{fmt(reportData.totalPayments)}</span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between items-center">
                    <span className="font-bold">= صافي الحركة النقدية:</span>
                    <span className={`font-bold text-lg ${reportData.cashBalance >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
                      ₪{fmt(reportData.cashBalance)}
                    </span>
                  </div>
                </div>
              </ReportSection>

              {/* Quarterly+ sections: Monthly Comparison */}
              {periodType !== "monthly" && reportData.monthlyBreakdown.length > 1 && (
                <>
                  <ReportSection title="مقارنة الأشهر" icon={BarChart3}>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData.monthlyBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₪${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: number) => `₪${fmt(v)}`} />
                          <Legend />
                          <Bar dataKey="sales" fill="#10B981" name="المبيعات" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expenses" fill="#F43F5E" name="المصاريف" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="profit" fill="#F59E0B" name="صافي الربح" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto mt-4">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="py-2 px-3 text-right font-semibold text-muted-foreground">البند</th>
                            {reportData.monthlyBreakdown.map((m: any) => (
                              <th key={m.month} className="py-2 px-3 text-left font-semibold text-muted-foreground">{m.month}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {["sales", "expenses", "profit"].map(key => (
                            <tr key={key} className="border-b border-border/30">
                              <td className="py-2 px-3 font-medium">
                                {key === "sales" ? "المبيعات" : key === "expenses" ? "المصاريف" : "صافي الربح"}
                              </td>
                              {reportData.monthlyBreakdown.map((m: any) => (
                                <td key={m.month} className="py-2 px-3 text-left">₪{fmt(m[key])}</td>
                              ))}
                            </tr>
                          ))}
                          <tr className="border-b border-border/30">
                            <td className="py-2 px-3 font-medium">هامش الربح</td>
                            {reportData.monthlyBreakdown.map((m: any) => (
                              <td key={m.month} className="py-2 px-3 text-left">{m.margin.toFixed(1)}%</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </ReportSection>

                  {/* Best/Worst Month */}
                  {reportData.bestMonth && reportData.worstMonth && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Card className="border-[#10B981]/30 bg-[#10B981]/5">
                        <CardContent className="p-4 flex items-center gap-3">
                          <Award className="h-8 w-8 text-[#10B981]" />
                          <div>
                            <p className="text-xs text-muted-foreground">🟢 أفضل شهر</p>
                            <p className="font-bold text-foreground">{reportData.bestMonth.month}</p>
                            <p className="text-sm text-[#10B981]">ربح ₪{fmt(reportData.bestMonth.profit)}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-[#F43F5E]/30 bg-[#F43F5E]/5">
                        <CardContent className="p-4 flex items-center gap-3">
                          <AlertTriangle className="h-8 w-8 text-[#F43F5E]" />
                          <div>
                            <p className="text-xs text-muted-foreground">🔴 أضعف شهر</p>
                            <p className="font-bold text-foreground">{reportData.worstMonth.month}</p>
                            <p className="text-sm text-[#F43F5E]">ربح ₪{fmt(reportData.worstMonth.profit)}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </>
              )}

              {/* Semi-annual+: Trend Chart */}
              {(periodType === "semi-annual" || periodType === "annual") && reportData.monthlyBreakdown.length > 2 && (
                <ReportSection title="تحليل الاتجاه" icon={TrendingUp}>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData.monthlyBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₪${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `₪${fmt(v)}`} />
                        <Area type="monotone" dataKey="sales" stroke="#10B981" fill="#10B981" fillOpacity={0.15} name="المبيعات" />
                        <Area type="monotone" dataKey="expenses" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.15} name="المصاريف" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ReportSection>
              )}

              {/* Semi-annual+: Income Statement */}
              {(periodType === "semi-annual" || periodType === "annual") && (
                <ReportSection title="قائمة الدخل" icon={FileText}>
                  <div className="space-y-2 text-sm font-mono" dir="rtl">
                    <div className="flex justify-between"><span>إيرادات المبيعات</span><span className="font-bold">₪ {fmt(reportData.totalSales)}</span></div>
                    {reportData.expensePie.find((e: any) => e.name === "تكلفة البضاعة المباعة") && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>(-) تكلفة البضاعة المباعة</span>
                        <span>(₪ {fmt(reportData.expensePie.find((e: any) => e.name === "تكلفة البضاعة المباعة")?.value || 0)})</span>
                      </div>
                    )}
                    <div className="border-t border-border pt-1 flex justify-between font-bold">
                      <span>= مجمل الربح</span>
                      <span>₪ {fmt(reportData.totalSales - (reportData.expensePie.find((e: any) => e.name === "تكلفة البضاعة المباعة")?.value || 0))}</span>
                    </div>
                    <div className="mt-2 text-muted-foreground text-xs">(-) المصاريف التشغيلية:</div>
                    {reportData.expensePie.filter((e: any) => e.name !== "تكلفة البضاعة المباعة").map((e: any, i: number) => (
                      <div key={i} className="flex justify-between text-muted-foreground pr-6">
                        <span>- {e.name}</span><span>(₪ {fmt(e.value)})</span>
                      </div>
                    ))}
                    <div className="border-t-2 border-foreground pt-2 flex justify-between font-bold text-base">
                      <span>= صافي الربح النهائي</span>
                      <span className={reportData.netProfit >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}>₪ {fmt(reportData.netProfit)}</span>
                    </div>
                  </div>
                </ReportSection>
              )}

              {/* Annual: Quarterly Comparison */}
              {periodType === "annual" && reportData.quarterlyBreakdown.length > 0 && (
                <ReportSection title="مقارنة الأرباع الأربعة" icon={BarChart3}>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.quarterlyBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₪${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `₪${fmt(v)}`} />
                        <Legend />
                        <Bar dataKey="sales" fill="#10B981" name="مبيعات" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenses" fill="#F43F5E" name="مصاريف" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="profit" fill="#F59E0B" name="ربح" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ReportSection>
              )}

              {/* Annual: Year in Numbers */}
              {periodType === "annual" && (
                <ReportSection title="ملخص السنة" icon={Award}>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <MiniStat label="إجمالي المبيعات" value={`₪${fmt(reportData.totalSales)}`} />
                    <MiniStat label="إجمالي المصاريف" value={`₪${fmt(reportData.totalExpenses)}`} />
                    <MiniStat label="صافي الربح" value={`₪${fmt(reportData.netProfit)}`} />
                    <MiniStat label="عدد الفواتير" value={String(reportData.invoiceCount)} />
                    <MiniStat label="عدد الزبائن" value={String(reportData.customerCount)} />
                    <MiniStat label="نسبة الربحية" value={`${reportData.profitMargin.toFixed(1)}%`} />
                  </div>
                </ReportSection>
              )}

              {/* Comparison section */}
              {compareLastYear && (
                <ReportSection title="مقارنة بنفس الفترة من العام الماضي" icon={BarChart3}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 px-3 text-right font-semibold text-muted-foreground">البند</th>
                          <th className="py-2 px-3 text-left font-semibold text-muted-foreground">الفترة الحالية</th>
                          <th className="py-2 px-3 text-left font-semibold text-muted-foreground">الفترة السابقة</th>
                          <th className="py-2 px-3 text-left font-semibold text-muted-foreground">التغيير %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "المبيعات", cur: reportData.totalSales, prev: reportData.prevSales },
                          { label: "المصاريف", cur: reportData.totalExpenses, prev: reportData.prevExpenses },
                          { label: "صافي الربح", cur: reportData.netProfit, prev: reportData.prevProfit },
                        ].map(row => {
                          const change = pctChange(row.cur, row.prev);
                          const isGood = row.label === "المصاريف" ? change < 0 : change > 0;
                          return (
                            <tr key={row.label} className="border-b border-border/30">
                              <td className="py-2 px-3 font-medium">{row.label}</td>
                              <td className="py-2 px-3 text-left">₪{fmt(row.cur)}</td>
                              <td className="py-2 px-3 text-left text-muted-foreground">₪{fmt(row.prev)}</td>
                              <td className={`py-2 px-3 text-left font-bold ${isGood ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
                                {fmtPct(change)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              )}
            </div>
          )}
        </>
      )}

      {/* Archive Tab */}
      {activeTab === "archive" && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-sm">📁 أرشيف التقارير المحفوظة</CardTitle>
          </CardHeader>
          <CardContent>
            {archivedReports.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد تقارير محفوظة بعد</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 px-3 text-right font-semibold text-muted-foreground">اسم التقرير</th>
                      <th className="py-2 px-3 text-right font-semibold text-muted-foreground">النوع</th>
                      <th className="py-2 px-3 text-right font-semibold text-muted-foreground">الفترة</th>
                      <th className="py-2 px-3 text-right font-semibold text-muted-foreground">تاريخ الإنشاء</th>
                      <th className="py-2 px-3 text-center font-semibold text-muted-foreground">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedReports.map(r => (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">{r.title}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-[10px]">
                            {r.period_type === "monthly" ? "شهري" : r.period_type === "quarterly" ? "ربعي" : r.period_type === "semi-annual" ? "نصف سنوي" : "سنوي"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">{r.period_start} → {r.period_end}</td>
                        <td className="py-2 px-3">{new Date(r.created_at).toLocaleDateString("ar-EG")}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                              setReportData(r.data);
                              setActiveTab("generator");
                            }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteArchived(r.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Subcomponents ───

const ReportSection = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => {
  const [open, setOpen] = useState(true);
  return (
    <Card className="border-border/60 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[hsl(var(--accent))]" />
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4 px-4">{children}</CardContent>}
    </Card>
  );
};

const KPICard = ({ label, value, change, isPercent, negative, highlight }: {
  label: string; value: number; change?: number | null; isPercent?: boolean; negative?: boolean; highlight?: boolean;
}) => {
  const displayVal = isPercent ? `${value.toFixed(1)}%` : `₪${fmt(value)}`;
  const isPositive = change ? (negative ? change < 0 : change > 0) : true;
  return (
    <Card className={`border-border/40 ${highlight ? "bg-[hsl(var(--accent))]/8 border-[hsl(var(--accent))]/30" : ""}`}>
      <CardContent className="p-3 space-y-1">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${value < 0 ? "text-[#F43F5E]" : "text-foreground"}`}>{displayVal}</p>
        {change !== null && change !== undefined && (
          <div className={`flex items-center gap-1 text-[10px] ${isPositive ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {fmtPct(change)} vs العام الماضي
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <Card className="border-border/40">
    <CardContent className="p-3 text-center">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-bold text-foreground">{value}</p>
    </CardContent>
  </Card>
);

export default PeriodicReportsPage;

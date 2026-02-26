import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, Loader2, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useCountUp } from "@/hooks/useCountUp";
import { supabase } from "@/integrations/supabase/client";
import { ReportHeader, ReportSummary, ReportTable, exportToExcel, exportToPDF } from "@/components/ReportComponents";

interface TransactionRecord {
  id: string;
  fields: {
    Amount?: number;
    Currency?: string;
    "Transaction Type"?: string;
    "Credit Account Rollup"?: string;
    "Debit Account Rollup"?: string;
    "Debit Account Name"?: string;
    "Credit Account Name"?: string;
    Description?: string;
    Date?: string;
    Client?: string;
  };
}

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

const ProfitLoss = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setTransactions(data.records || []);
      } catch (err) {
        console.error("Error fetching P&L data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTx();
  }, [user]);

  // Filter out opening balance transactions
  const plTransactions = transactions.filter((tx) => {
    const type = (tx.fields["Transaction Type"] || "").trim();
    const desc = (tx.fields.Description || "").trim();
    const isOB = /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) ||
      /رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) || type === "رصيد ابتدائي";
    return !isOB;
  });

  // Helper: check description/type for keywords
  const txMatch = (tx: TransactionRecord, keywords: string[]) => {
    const desc = (tx.fields.Description || "").toLowerCase();
    const type = (tx.fields["Transaction Type"] || "").toLowerCase();
    const debitName = (tx.fields["Debit Account Name"] || "").toLowerCase();
    const creditName = (tx.fields["Credit Account Name"] || "").toLowerCase();
    const all = `${desc} ${type} ${debitName} ${creditName}`;
    return keywords.some(k => all.includes(k));
  };

  // (+) المبيعات
  const sales = plTransactions.filter(tx => tx.fields["Credit Account Rollup"] === "Revenue" && !txMatch(tx, ["مردود", "خصم"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) خصم مسموح به
  const salesDiscounts = plTransactions.filter(tx => txMatch(tx, ["خصم مسموح", "خصم مبيعات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) مردود مبيعات
  const salesReturns = plTransactions.filter(tx => txMatch(tx, ["مردود مبيعات", "مرتجع مبيعات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) مشتريات
  const purchases = plTransactions.filter(tx => txMatch(tx, ["مشتريات", "شراء", "بضاعة"]) && tx.fields["Debit Account Rollup"] === "Expenses" || (tx.fields["Transaction Type"] || "").includes("فاتورة مشتريات"))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (+) خصم مكتسب
  const purchaseDiscounts = plTransactions.filter(tx => txMatch(tx, ["خصم مكتسب", "خصم مشتريات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (+) مردود مشتريات
  const purchaseReturns = plTransactions.filter(tx => txMatch(tx, ["مردود مشتريات", "مرتجع مشتريات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) مصاريف عامة
  const generalExpenses = plTransactions.filter(tx => tx.fields["Debit Account Rollup"] === "Expenses" && !txMatch(tx, ["مشتريات", "شراء", "بضاعة", "مردود", "خصم"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);

  const totalRevenue = sales - salesDiscounts - salesReturns;
  const totalExpenses = purchases - purchaseDiscounts - purchaseReturns + generalExpenses;
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  const animRevenue = useCountUp(totalRevenue, 1200, !loading);
  const animExpenses = useCountUp(totalExpenses, 1200, !loading);
  const animNet = useCountUp(Math.abs(netProfit), 1200, !loading);

  // Pie data
  const pieData = totalRevenue > 0 || totalExpenses > 0
    ? [{ name: "الإيرادات", value: totalRevenue }, { name: "المصروفات", value: totalExpenses }]
    : [];
  const COLORS = ["hsl(152, 45%, 42%)", "hsl(0, 72%, 51%)"];

  // Monthly chart
  const monthlyMap: Record<number, { revenue: number; expenses: number }> = {};
  plTransactions.forEach((tx) => {
    if (!tx.fields.Date) return;
    const month = new Date(tx.fields.Date).getMonth();
    if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, expenses: 0 };
    if (tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue") {
      monthlyMap[month].revenue += tx.fields.Amount || 0;
    }
    if (tx.fields["Debit Account Rollup"] === "Expenses") {
      monthlyMap[month].expenses += tx.fields.Amount || 0;
    }
  });
  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([m, data]) => ({ month: monthNames[Number(m)], revenue: data.revenue, expenses: data.expenses }));

  // Build table data for export & display
  const tableData = useMemo(() => {
    // Revenue items
    const revenueRows = plTransactions
      .filter(tx => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue")
      .map(tx => ({
        "التاريخ": tx.fields.Date || "-",
        "الوصف": tx.fields.Description || "-",
        "المبلغ": tx.fields.Amount || 0,
        "النوع": "إيراد",
        "الحساب المدين": tx.fields["Debit Account Name"] || "-",
        "الحساب الدائن": tx.fields["Credit Account Name"] || "-",
      }));
    const expenseRows = plTransactions
      .filter(tx => tx.fields["Debit Account Rollup"] === "Expenses")
      .map(tx => ({
        "التاريخ": tx.fields.Date || "-",
        "الوصف": tx.fields.Description || "-",
        "المبلغ": tx.fields.Amount || 0,
        "النوع": "مصروف",
        "الحساب المدين": tx.fields["Debit Account Name"] || "-",
        "الحساب الدائن": tx.fields["Credit Account Name"] || "-",
      }));
    return [...revenueRows, ...expenseRows].sort((a, b) => (b["التاريخ"] || "").localeCompare(a["التاريخ"] || ""));
  }, [plTransactions]);

  const currentMonth = monthNames[new Date().getMonth()];
  const periodLabel = period === "monthly" ? `${currentMonth} ${new Date().getFullYear()}` : `${new Date().getFullYear()}`;

  const handleExportExcel = () => {
    exportToExcel(tableData, {
      "التقرير": "الأرباح والخسائر",
      "الفترة": periodLabel,
      "إجمالي الإيرادات": totalRevenue,
      "إجمالي المصروفات": totalExpenses,
      "صافي الربح": netProfit,
      "هامش الربح %": margin,
    }, `أرباح-وخسائر-${Date.now()}`);
  };

  const handleExportPDF = () => {
    exportToPDF("الأرباح والخسائر", companyName, periodLabel, {
      "إجمالي الإيرادات": `₪${totalRevenue.toLocaleString()}`,
      "إجمالي المصروفات": `₪${totalExpenses.toLocaleString()}`,
      "صافي الربح": `₪${netProfit.toLocaleString()}`,
      "هامش الربح": `${margin}%`,
    }, tableData);
  };

  return (
    <div className="px-4 pt-6 space-y-5 pb-8">
      <ReportHeader
        reportName="الأرباح والخسائر"
        companyName={companyName}
        period={periodLabel}
        onBack={() => navigate("/menu")}
        onExportPDF={!loading ? handleExportPDF : undefined}
        onExportExcel={!loading ? handleExportExcel : undefined}
        icon={<BarChart3 className="h-5 w-5 text-primary" />}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Period Toggle */}
          <div className="flex gap-1 bg-muted/60 p-1 rounded-2xl">
            <button onClick={() => setPeriod("monthly")} className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${period === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              شهري
            </button>
            <button onClick={() => setPeriod("yearly")} className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${period === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              سنوي
            </button>
          </div>

          {/* Summary */}
          <ReportSummary items={[
            { label: "إجمالي الإيرادات", value: totalRevenue, color: "primary" },
            { label: "إجمالي المصروفات", value: totalExpenses, color: "destructive" },
            { label: netProfit >= 0 ? "صافي الربح" : "صافي الخسارة", value: netProfit, color: netProfit >= 0 ? "primary" : "destructive" },
            { label: "هامش الربح", value: margin, color: margin > 0 ? "primary" : "destructive", prefix: "%" },
          ]} />

          {/* Circular Chart */}
          {pieData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center">
                <h3 className="text-sm font-semibold text-foreground mb-3">نسبة الإيرادات للمصروفات</h3>
                <div className="h-40 w-40 relative" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value" strokeWidth={0}>
                        {pieData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index]} />))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className={`text-lg font-bold ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                      {netProfit >= 0 ? "ربح" : "خسارة"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 mt-3">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-xs text-muted-foreground">إيرادات</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-destructive" /><span className="text-xs text-muted-foreground">مصروفات</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bar Chart */}
          {monthlyData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">الإيرادات مقابل المصروفات</h3>
                <div className="h-48" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(220, 10%, 46%)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 46%)" }} />
                      <Bar dataKey="revenue" fill="hsl(152, 45%, 42%)" radius={[6, 6, 0, 0]} name="الإيرادات" />
                      <Bar dataKey="expenses" fill="hsl(0, 72%, 51%)" radius={[6, 6, 0, 0]} name="المصروفات" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-3">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary" /><span className="text-xs text-muted-foreground">الإيرادات</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-destructive" /><span className="text-xs text-muted-foreground">المصروفات</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Table */}
          {tableData.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">تفاصيل العمليات</h3>
              <ReportTable data={tableData} typeColumn="النوع" amountColumn="المبلغ" />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProfitLoss;

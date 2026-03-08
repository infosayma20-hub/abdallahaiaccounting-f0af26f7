import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, AlertTriangle, DollarSign, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

interface MonthlyData {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  net: number;
}

const FinancialPredictions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      const [txRes, chqRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("amount, debit_account_code, credit_account_code, transaction_date, transaction_type, is_opening_balance, is_deleted")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("transaction_date", { ascending: true })
          .limit(2000),
        supabase
          .from("cheques")
          .select("amount, cheque_date, cheque_type, status")
          .eq("user_id", user.id)
          .in("status", ["آجل", "مستحق"]),
      ]);
      setTransactions(txRes.data || []);
      setCheques(chqRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const predictions = useMemo(() => {
    if (!transactions.length) return null;

    // Filter out opening balances
    const plTx = transactions.filter(
      (tx) =>
        !tx.is_opening_balance &&
        !/رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(tx.description || "") &&
        tx.transaction_type !== "رصيد ابتدائي"
    );

    // Group by month
    const monthlyMap: Record<string, { revenue: number; expenses: number }> = {};

    plTx.forEach((tx) => {
      const date = new Date(tx.transaction_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyMap[key]) monthlyMap[key] = { revenue: 0, expenses: 0 };

      if (tx.credit_account_code?.startsWith("4")) {
        monthlyMap[key].revenue += Number(tx.amount) || 0;
      }
      if (tx.debit_account_code?.startsWith("5")) {
        monthlyMap[key].expenses += Number(tx.amount) || 0;
      }
    });

    const months = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        label: formatMonth(month),
        revenue: data.revenue,
        expenses: data.expenses,
        net: data.revenue - data.expenses,
      }));

    if (months.length < 2) return null;

    // Use last 3-6 months for prediction
    const recentMonths = months.slice(-Math.min(6, months.length));

    // Simple linear regression for revenue
    const revenueTrend = linearTrend(recentMonths.map((m) => m.revenue));
    const expenseTrend = linearTrend(recentMonths.map((m) => m.expenses));

    // Predict next 3 months
    const lastMonth = recentMonths[recentMonths.length - 1];
    const lastDate = new Date(lastMonth.month + "-01");

    const predicted: MonthlyData[] = [];
    for (let i = 1; i <= 3; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + i);
      const key = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

      const predRevenue = Math.max(0, revenueTrend.predict(recentMonths.length + i - 1));
      const predExpenses = Math.max(0, expenseTrend.predict(recentMonths.length + i - 1));

      predicted.push({
        month: key,
        label: formatMonth(key),
        revenue: Math.round(predRevenue),
        expenses: Math.round(predExpenses),
        net: Math.round(predRevenue - predExpenses),
      });
    }

    // Upcoming cheques (next 30 days)
    const today = new Date();
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const upcomingIncoming = cheques
      .filter((c) => c.cheque_type === "وارد" && new Date(c.cheque_date) <= thirtyDaysOut && new Date(c.cheque_date) >= today)
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const upcomingOutgoing = cheques
      .filter((c) => c.cheque_type === "صادر" && new Date(c.cheque_date) <= thirtyDaysOut && new Date(c.cheque_date) >= today)
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);

    // Cash flow prediction
    const avgMonthlyNet = recentMonths.reduce((s, m) => s + m.net, 0) / recentMonths.length;
    const cashFlowHealth = avgMonthlyNet > 0 ? "positive" : avgMonthlyNet < -1000 ? "critical" : "warning";

    // Revenue growth rate
    const lastRevenue = recentMonths[recentMonths.length - 1]?.revenue || 0;
    const prevRevenue = recentMonths[recentMonths.length - 2]?.revenue || 1;
    const revenueGrowth = ((lastRevenue - prevRevenue) / (prevRevenue || 1)) * 100;

    // Risk signals
    const risks: string[] = [];
    if (predicted[0]?.net < 0) risks.push("صافي الربح المتوقع سلبي الشهر القادم");
    if (upcomingOutgoing > upcomingIncoming * 1.5) risks.push("الشيكات الصادرة تتجاوز الواردة بكثير");
    if (revenueTrend.slope < 0) risks.push("المبيعات في اتجاه هبوطي");
    if (expenseTrend.slope > revenueTrend.slope) risks.push("المصروفات تنمو أسرع من الإيرادات");

    return {
      historical: recentMonths,
      predicted,
      upcomingIncoming,
      upcomingOutgoing,
      cashFlowHealth,
      revenueGrowth: Math.round(revenueGrowth),
      avgMonthlyNet: Math.round(avgMonthlyNet),
      risks,
      revenueTrend: revenueTrend.slope > 0 ? "up" : "down",
      expenseTrend: expenseTrend.slope > 0 ? "up" : "down",
    };
  }, [transactions, cheques]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!predictions) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card text-center space-y-2">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">بحاجة لبيانات شهرين على الأقل للتنبؤ...</p>
      </div>
    );
  }

  const healthColors = {
    positive: "text-emerald-500",
    warning: "text-amber-500",
    critical: "text-red-500",
  };

  const healthLabels = {
    positive: "إيجابي ✅",
    warning: "يحتاج مراقبة ⚠️",
    critical: "خطر 🚨",
  };

  return (
    <div className="bg-card rounded-2xl p-6 space-y-5 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <span className="text-base">🔮</span>
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">التنبؤات المالية</span>
            <Badge className="mr-2 bg-indigo-500/10 text-indigo-500 border-0 text-[9px] px-1.5">AI</Badge>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Key predictions summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">التدفق النقدي</span>
          </div>
          <p className={`text-sm font-bold ${healthColors[predictions.cashFlowHealth]}`}>
            {healthLabels[predictions.cashFlowHealth]}
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            متوسط: {predictions.avgMonthlyNet.toLocaleString("en-US")}
          </p>
        </div>

        <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1">
            {predictions.revenueGrowth >= 0 ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-500" />
            )}
            <span className="text-[10px] text-muted-foreground">نمو المبيعات</span>
          </div>
          <p className={`text-sm font-bold ${predictions.revenueGrowth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {predictions.revenueGrowth >= 0 ? "+" : ""}{predictions.revenueGrowth}%
          </p>
          <p className="text-[10px] text-muted-foreground/70">مقارنة بالشهر السابق</p>
        </div>

        <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-xs">📝</span>
            <span className="text-[10px] text-muted-foreground">شيكات 30 يوم</span>
          </div>
          <p className="text-xs font-bold text-foreground">
            <span className="text-emerald-500">+{predictions.upcomingIncoming.toLocaleString("en-US")}</span>
            {" / "}
            <span className="text-red-400">-{predictions.upcomingOutgoing.toLocaleString("en-US")}</span>
          </p>
          <p className="text-[10px] text-muted-foreground/70">وارد / صادر</p>
        </div>
      </div>

      {/* Predicted months */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-foreground">📅 التوقعات للأشهر القادمة</span>
        <div className="space-y-1.5">
          {predictions.predicted.map((m) => (
            <div key={m.month} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2.5">
              <span className="text-xs font-medium text-foreground">{m.label}</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="text-emerald-500">↑ {m.revenue.toLocaleString("en-US")}</span>
                <span className="text-red-400">↓ {m.expenses.toLocaleString("en-US")}</span>
                <span className={`font-bold ${m.net >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  = {m.net.toLocaleString("en-US")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk alerts */}
      {predictions.risks.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-red-600 dark:text-red-400">تنبيهات مبكرة</span>
          </div>
          {predictions.risks.map((risk, i) => (
            <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-red-400 mt-0.5">•</span> {risk}
            </p>
          ))}
        </div>
      )}

      {/* Expanded: trend visualization */}
      {expanded && (
        <div className="space-y-4 animate-fade-in">
          {/* Historical + predicted mini chart */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground">📊 اتجاه الإيرادات والمصروفات</span>
            <div className="flex gap-1 items-end h-24">
              {[...predictions.historical, ...predictions.predicted].map((m, i) => {
                const maxVal = Math.max(
                  ...predictions.historical.map((h) => Math.max(h.revenue, h.expenses)),
                  ...predictions.predicted.map((p) => Math.max(p.revenue, p.expenses)),
                  1
                );
                const revH = (m.revenue / maxVal) * 100;
                const expH = (m.expenses / maxVal) * 100;
                const isPredicted = i >= predictions.historical.length;

                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="flex gap-0.5 items-end w-full h-20">
                      <div
                        className="flex-1 rounded-t transition-all"
                        style={{
                          height: `${revH}%`,
                          backgroundColor: isPredicted
                            ? "hsl(var(--primary) / 0.3)"
                            : "hsl(var(--primary) / 0.7)",
                          borderStyle: isPredicted ? "dashed" : "solid",
                          borderWidth: isPredicted ? "1px" : "0",
                          borderColor: "hsl(var(--primary) / 0.5)",
                        }}
                      />
                      <div
                        className="flex-1 rounded-t transition-all"
                        style={{
                          height: `${expH}%`,
                          backgroundColor: isPredicted
                            ? "hsl(0 70% 60% / 0.3)"
                            : "hsl(0 70% 60% / 0.6)",
                          borderStyle: isPredicted ? "dashed" : "solid",
                          borderWidth: isPredicted ? "1px" : "0",
                          borderColor: "hsl(0 70% 60% / 0.4)",
                        }}
                      />
                    </div>
                    <span className="text-[8px] text-muted-foreground truncate w-full text-center">
                      {m.label.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 justify-center text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsl(var(--primary) / 0.7)" }} /> إيرادات
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsl(0 70% 60% / 0.6)" }} /> مصروفات
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm border border-dashed" style={{ borderColor: "hsl(var(--primary) / 0.5)" }} /> متوقع
              </span>
            </div>
          </div>

          {/* Trend direction summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/30 rounded-xl p-3 flex items-center gap-2">
              {predictions.revenueTrend === "up" ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <div>
                <p className="text-[11px] font-bold text-foreground">اتجاه الإيرادات</p>
                <p className={`text-[10px] ${predictions.revenueTrend === "up" ? "text-emerald-500" : "text-red-500"}`}>
                  {predictions.revenueTrend === "up" ? "صاعد 📈" : "هابط 📉"}
                </p>
              </div>
            </div>
            <div className="bg-secondary/30 rounded-xl p-3 flex items-center gap-2">
              {predictions.expenseTrend === "up" ? (
                <TrendingUp className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-emerald-500" />
              )}
              <div>
                <p className="text-[11px] font-bold text-foreground">اتجاه المصروفات</p>
                <p className={`text-[10px] ${predictions.expenseTrend === "up" ? "text-red-500" : "text-emerald-500"}`}>
                  {predictions.expenseTrend === "up" ? "صاعد ⚠️" : "هابط ✅"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Helpers ───

function formatMonth(key: string): string {
  const [y, m] = key.split("-");
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function linearTrend(values: number[]) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, predict: (x: number) => values[0] || 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  values.forEach((y, x) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return {
    slope,
    intercept,
    predict: (x: number) => intercept + slope * x,
  };
}

export default FinancialPredictions;

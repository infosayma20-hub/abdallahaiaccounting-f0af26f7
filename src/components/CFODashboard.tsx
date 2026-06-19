import { useState, useEffect, useMemo } from "react";
import { Briefcase, TrendingUp, TrendingDown, Droplets, Scale, PieChart, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useCountUp } from "@/hooks/useCountUp";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface FinancialData {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
  cash: number;
  receivables: number;
  inventory: number;
  revenue: number;
  expenses: number;
  netProfit: number;
  cogs: number;
  operatingExpenses: number;
  topExpenses: { name: string; amount: number }[];
  monthlyRevenue: number[];
}

const CFODashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    fetchFinancialData();
  }, [user?.id]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      const [{ data: accounts }, { data: txs }] = await Promise.all([
        supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", dataOwnerId!),
        supabase.from("transactions")
          .select("amount, debit_account_code, credit_account_code, transaction_date, description, is_deleted, is_opening_balance, transaction_type")
          .eq("user_id", dataOwnerId!).eq("is_deleted", false),
      ]);

      if (!accounts || !txs) { setLoading(false); return; }

      const acctMap = new Map(accounts.map(a => [a.account_code, a]));

      // Build account balances
      const balances = new Map<string, number>();
      txs.forEach(tx => {
        const dr = tx.debit_account_code;
        const cr = tx.credit_account_code;
        const amt = tx.amount || 0;
        if (dr) balances.set(dr, (balances.get(dr) || 0) + amt);
        if (cr) balances.set(cr, (balances.get(cr) || 0) - amt);
      });

      // Classify
      let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
      let currentAssets = 0, currentLiabilities = 0;
      let cash = 0, receivables = 0, inventory = 0;

      balances.forEach((bal, code) => {
        const acct = acctMap.get(code);
        const type = (acct?.account_type || "").toLowerCase();
        const isAsset = type.includes("asset") || type.includes("أصول") || type.includes("أصل");
        const isLiability = type.includes("liab") || type.includes("التزام") || type.includes("خصوم");
        const isEquity = type.includes("equity") || type.includes("ملكية") || type.includes("رأس");

        if (isAsset) {
          totalAssets += bal;
          if (code.startsWith("1")) currentAssets += bal;
          if (code === "1110" || code === "1111" || code === "1112" || code === "1113" || code === "1114") cash += bal;
          if (code === "1130") receivables += bal;
          if (code === "1140") inventory += bal;
        }
        if (isLiability) {
          totalLiabilities += Math.abs(bal);
          if (code.startsWith("2")) currentLiabilities += Math.abs(bal);
        }
        if (isEquity) totalEquity += Math.abs(bal);
      });

      // P&L (exclude opening balances)
      const plTx = txs.filter(tx =>
        !tx.is_opening_balance &&
        !/رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(tx.description || "") &&
        tx.transaction_type !== "رصيد ابتدائي"
      );

      const revenue = plTx.filter(tx => tx.credit_account_code?.startsWith("4")).reduce((s, tx) => s + (tx.amount || 0), 0);
      const cogs = plTx.filter(tx => tx.debit_account_code === "5100" || tx.debit_account_code === "5110").reduce((s, tx) => s + (tx.amount || 0), 0);
      const totalExpenses = plTx.filter(tx => tx.debit_account_code?.startsWith("5")).reduce((s, tx) => s + (tx.amount || 0), 0);
      const operatingExpenses = totalExpenses - cogs;

      // Top expense categories
      const expenseByAccount = new Map<string, number>();
      plTx.filter(tx => tx.debit_account_code?.startsWith("5")).forEach(tx => {
        const code = tx.debit_account_code!;
        const name = acctMap.get(code)?.account_name || code;
        expenseByAccount.set(name, (expenseByAccount.get(name) || 0) + (tx.amount || 0));
      });
      const topExpenses = [...expenseByAccount.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Monthly revenue (last 6 months)
      const monthlyRevenue: number[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const month = d.getMonth();
        const year = d.getFullYear();
        const monthRev = plTx
          .filter(tx => {
            if (!tx.credit_account_code?.startsWith("4")) return false;
            const txDate = new Date(tx.transaction_date);
            return txDate.getMonth() === month && txDate.getFullYear() === year;
          })
          .reduce((s, tx) => s + (tx.amount || 0), 0);
        monthlyRevenue.push(monthRev);
      }

      setData({
        totalAssets, totalLiabilities, totalEquity,
        currentAssets, currentLiabilities,
        cash, receivables, inventory,
        revenue, expenses: totalExpenses, netProfit: revenue - totalExpenses,
        cogs, operatingExpenses, topExpenses, monthlyRevenue,
      });
    } catch (err) {
      console.error("CFO data error:", err);
    } finally {
      setLoading(false);
    }
  };

  const ratios = useMemo(() => {
    if (!data) return null;
    const currentRatio = data.currentLiabilities > 0 ? data.currentAssets / data.currentLiabilities : 0;
    const quickRatio = data.currentLiabilities > 0 ? (data.currentAssets - data.inventory) / data.currentLiabilities : 0;
    const grossMargin = data.revenue > 0 ? ((data.revenue - data.cogs) / data.revenue) * 100 : 0;
    const netMargin = data.revenue > 0 ? (data.netProfit / data.revenue) * 100 : 0;
    const debtToEquity = data.totalEquity > 0 ? data.totalLiabilities / data.totalEquity : 0;
    const roe = data.totalEquity > 0 ? (data.netProfit / data.totalEquity) * 100 : 0;
    const cashRatio = data.currentLiabilities > 0 ? data.cash / data.currentLiabilities : 0;

    return { currentRatio, quickRatio, grossMargin, netMargin, debtToEquity, roe, cashRatio };
  }, [data]);

  // Revenue trend
  const revenueTrend = useMemo(() => {
    if (!data || data.monthlyRevenue.length < 2) return 0;
    const last = data.monthlyRevenue[data.monthlyRevenue.length - 1];
    const prev = data.monthlyRevenue[data.monthlyRevenue.length - 2];
    if (prev === 0) return last > 0 ? 100 : 0;
    return Math.round(((last - prev) / prev) * 100);
  }, [data]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-muted rounded w-36" />
            <div className="h-3 bg-muted rounded w-52" />
          </div>
        </div>
      </div>
    );
  }

  if (!data || !ratios) return null;

  const formatNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const formatRatio = (n: number) => n.toFixed(2);
  const formatPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const ratioStatus = (value: number, good: number, bad: number): "green" | "yellow" | "red" => {
    if (value >= good) return "green";
    if (value >= bad) return "yellow";
    return "red";
  };

  const statusColors = {
    green: "text-primary bg-primary/10",
    yellow: "text-warning bg-warning/10",
    red: "text-destructive bg-destructive/10",
  };

  const ratioCards = [
    {
      label: "نسبة التداول",
      value: formatRatio(ratios.currentRatio),
      hint: ratios.currentRatio >= 2 ? "ممتاز" : ratios.currentRatio >= 1 ? "مقبول" : "ضعيف",
      status: ratioStatus(ratios.currentRatio, 2, 1),
      desc: "الأصول المتداولة ÷ الالتزامات المتداولة",
    },
    {
      label: "نسبة السيولة السريعة",
      value: formatRatio(ratios.quickRatio),
      hint: ratios.quickRatio >= 1 ? "جيد" : "ضعيف",
      status: ratioStatus(ratios.quickRatio, 1, 0.5),
      desc: "(الأصول المتداولة - المخزون) ÷ الالتزامات",
    },
    {
      label: "هامش الربح الإجمالي",
      value: `${ratios.grossMargin.toFixed(1)}%`,
      hint: ratios.grossMargin >= 40 ? "قوي" : ratios.grossMargin >= 20 ? "مقبول" : "ضعيف",
      status: ratioStatus(ratios.grossMargin, 40, 20),
      desc: "(الإيرادات - تكلفة المبيعات) ÷ الإيرادات",
    },
    {
      label: "هامش صافي الربح",
      value: `${ratios.netMargin.toFixed(1)}%`,
      hint: ratios.netMargin >= 15 ? "ممتاز" : ratios.netMargin >= 5 ? "مقبول" : "خسارة",
      status: ratioStatus(ratios.netMargin, 15, 5),
      desc: "صافي الربح ÷ الإيرادات",
    },
    {
      label: "الدين إلى الملكية",
      value: formatRatio(ratios.debtToEquity),
      hint: ratios.debtToEquity <= 1 ? "آمن" : ratios.debtToEquity <= 2 ? "معتدل" : "مرتفع",
      status: ratioStatus(1 / (ratios.debtToEquity || 1), 1, 0.5),
      desc: "إجمالي الالتزامات ÷ حقوق الملكية",
    },
    {
      label: "العائد على الملكية",
      value: `${ratios.roe.toFixed(1)}%`,
      hint: ratios.roe >= 15 ? "ممتاز" : ratios.roe >= 5 ? "مقبول" : "ضعيف",
      status: ratioStatus(ratios.roe, 15, 5),
      desc: "صافي الربح ÷ حقوق الملكية",
    },
  ];

  // Simple bar chart for monthly revenue
  const maxRev = Math.max(...data.monthlyRevenue, 1);
  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const recentMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return monthNames[d.getMonth()];
  });

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A2342]/10 to-primary/10 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-foreground" />
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">👔 وضع المدير المالي</p>
            <p className="text-[10px] text-muted-foreground">رؤية تنفيذية شاملة — النسب والمؤشرات الاستراتيجية</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`border-0 text-[9px] px-2 ${data.netProfit >= 0 ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
            {data.netProfit >= 0 ? "ربح" : "خسارة"}
          </Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          {/* Balance Sheet Summary */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "إجمالي الأصول", value: data.totalAssets, icon: TrendingUp, color: "text-primary" },
              { label: "الالتزامات", value: data.totalLiabilities, icon: TrendingDown, color: "text-destructive" },
              { label: "حقوق الملكية", value: data.totalEquity, icon: Scale, color: "text-foreground" },
            ].map(item => (
              <div key={item.label} className="bg-muted/40 rounded-xl p-3 text-center space-y-1">
                <item.icon className={`h-4 w-4 mx-auto ${item.color}`} />
                <p className={`text-sm font-bold tabular-nums ${item.color}`}>₪{formatNum(item.value)}</p>
                <p className="text-[9px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Revenue Trend Mini Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                اتجاه الإيرادات (6 أشهر)
              </p>
              <div className="flex items-center gap-1">
                {revenueTrend >= 0 ? (
                  <ArrowUpRight className="h-3 w-3 text-primary" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-[10px] font-bold ${revenueTrend >= 0 ? "text-primary" : "text-destructive"}`}>
                  {formatPct(revenueTrend)}
                </span>
              </div>
            </div>
            <div className="flex items-end gap-1 h-16">
              {data.monthlyRevenue.map((rev, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-md transition-all ${i === data.monthlyRevenue.length - 1 ? "bg-primary" : "bg-primary/30"}`}
                    style={{ height: `${Math.max(4, (rev / maxRev) * 48)}px` }}
                  />
                  <span className="text-[7px] text-muted-foreground">{recentMonths[i]?.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Ratios Grid */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5 text-primary" />
              النسب المالية الرئيسية
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ratioCards.map(card => (
                <div key={card.label} className="bg-muted/30 rounded-xl p-3 space-y-1.5 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-foreground">{card.label}</span>
                    <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-md ${statusColors[card.status]}`}>
                      {card.hint}
                    </span>
                  </div>
                  <p className={`text-lg font-black tabular-nums ${card.status === "green" ? "text-primary" : card.status === "yellow" ? "text-warning" : "text-destructive"}`}>
                    {card.value}
                  </p>
                  <p className="text-[8px] text-muted-foreground/60">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Expenses */}
          {data.topExpenses.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-foreground">📊 أكبر المصروفات</p>
              <div className="space-y-1.5">
                {data.topExpenses.map((exp, i) => {
                  const pct = data.expenses > 0 ? (exp.amount / data.expenses) * 100 : 0;
                  return (
                    <div key={exp.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-4 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-medium text-foreground truncate">{exp.name}</span>
                          <span className="text-[10px] font-bold tabular-nums text-foreground">₪{formatNum(exp.amount)}</span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[8px] text-muted-foreground tabular-nums w-8 text-left">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CFODashboard;

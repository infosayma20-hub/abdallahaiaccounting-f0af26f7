import { useState, useEffect, useMemo } from "react";
import { Settings2, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import MiniSparkline from "@/components/MiniSparkline";

interface KPIConfig {
  id: string;
  label: string;
  icon: string;
  compute: (txs: any[], cheques: any[]) => { value: number; trend: number[]; change: number };
  format: (v: number) => string;
  colorPositive: boolean; // true = green when positive
}

const ALL_KPIS: KPIConfig[] = [
  {
    id: "revenue", label: "الإيرادات", icon: "📈",
    compute: (txs) => monthlyMetric(txs, (t) => t.credit_account_code?.startsWith("4") ? Number(t.amount) || 0 : 0),
    format: formatCurrency, colorPositive: true,
  },
  {
    id: "expenses", label: "المصروفات", icon: "📉",
    compute: (txs) => monthlyMetric(txs, (t) => t.debit_account_code?.startsWith("5") ? Number(t.amount) || 0 : 0),
    format: formatCurrency, colorPositive: false,
  },
  {
    id: "net_profit", label: "صافي الربح", icon: "💰",
    compute: (txs) => {
      const rev = monthlyMetric(txs, (t) => t.credit_account_code?.startsWith("4") ? Number(t.amount) || 0 : 0);
      const exp = monthlyMetric(txs, (t) => t.debit_account_code?.startsWith("5") ? Number(t.amount) || 0 : 0);
      return {
        value: rev.value - exp.value,
        trend: rev.trend.map((r, i) => r - (exp.trend[i] || 0)),
        change: rev.value - exp.value > 0 && rev.trend.length > 1
          ? ((rev.trend[rev.trend.length - 1] - exp.trend[exp.trend.length - 1]) - (rev.trend[rev.trend.length - 2] - exp.trend[exp.trend.length - 2])) / Math.abs(rev.trend[rev.trend.length - 2] - exp.trend[exp.trend.length - 2] || 1) * 100
          : 0,
      };
    },
    format: formatCurrency, colorPositive: true,
  },
  {
    id: "receivables", label: "الذمم المدينة", icon: "🧾",
    compute: (txs) => {
      const debits = txs.filter((t) => t.debit_account_code === "1130").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const credits = txs.filter((t) => t.credit_account_code === "1130").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return { value: debits - credits, trend: weeklyBalance(txs, "1130"), change: 0 };
    },
    format: formatCurrency, colorPositive: false,
  },
  {
    id: "payables", label: "الذمم الدائنة", icon: "📋",
    compute: (txs) => {
      const credits = txs.filter((t) => t.credit_account_code === "2110").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const debits = txs.filter((t) => t.debit_account_code === "2110").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return { value: credits - debits, trend: weeklyBalance(txs, "2110", true), change: 0 };
    },
    format: formatCurrency, colorPositive: false,
  },
  {
    id: "cash", label: "النقد في الصندوق", icon: "💵",
    compute: (txs) => {
      const debits = txs.filter((t) => t.debit_account_code === "1110").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const credits = txs.filter((t) => t.credit_account_code === "1110").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return { value: debits - credits, trend: weeklyBalance(txs, "1110"), change: 0 };
    },
    format: formatCurrency, colorPositive: true,
  },
  {
    id: "bank", label: "رصيد البنك", icon: "🏦",
    compute: (txs) => {
      const debits = txs.filter((t) => t.debit_account_code === "1120").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const credits = txs.filter((t) => t.credit_account_code === "1120").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return { value: debits - credits, trend: weeklyBalance(txs, "1120"), change: 0 };
    },
    format: formatCurrency, colorPositive: true,
  },
  {
    id: "cheques_pending", label: "شيكات معلقة", icon: "📝",
    compute: (_, cheques) => {
      const pending = cheques.filter((c) => ["آجل", "مستحق"].includes(c.status));
      const total = pending.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      return { value: total, trend: [], change: pending.length };
    },
    format: formatCurrency, colorPositive: false,
  },
  {
    id: "tx_count", label: "عدد العمليات", icon: "📊",
    compute: (txs) => {
      const thisMonth = txs.filter((t) => {
        const d = new Date(t.transaction_date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      return { value: thisMonth.length, trend: weeklyTxCount(txs), change: 0 };
    },
    format: (v) => v.toLocaleString("en-US"), colorPositive: true,
  },
];

const DEFAULT_VISIBLE = ["revenue", "expenses", "net_profit", "receivables", "cash", "bank"];

const LiveKPICards = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [visibleCards, setVisibleCards] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("live-kpi-cards");
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE;
    } catch { return DEFAULT_VISIBLE; }
  });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
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
          .eq("user_id", user.id),
      ]);
      setTransactions(txRes.data || []);
      setCheques(chqRes.data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const toggleCard = (id: string) => {
    setVisibleCards((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      localStorage.setItem("live-kpi-cards", JSON.stringify(next));
      return next;
    });
  };

  const computedKPIs = useMemo(() => {
    if (!transactions.length) return [];
    const plTx = transactions.filter(
      (tx) => !tx.is_opening_balance && tx.transaction_type !== "رصيد ابتدائي"
    );
    return ALL_KPIS
      .filter((kpi) => visibleCards.includes(kpi.id))
      .map((kpi) => {
        const result = kpi.compute(kpi.id === "cheques_pending" ? transactions : plTx, cheques);
        return { ...kpi, ...result };
      });
  }, [transactions, cheques, visibleCards]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 space-y-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <span className="text-base">📊</span>
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">البطاقات الحية</span>
            <Badge className="mr-2 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-0 text-[9px] px-1.5">Live</Badge>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-secondary/40 rounded-xl p-3 space-y-2 animate-fade-in">
          <p className="text-[10px] text-muted-foreground font-medium">اختر البطاقات المرئية:</p>
          <div className="flex flex-wrap gap-2">
            {ALL_KPIS.map((kpi) => (
              <button
                key={kpi.id}
                onClick={() => toggleCard(kpi.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  visibleCards.includes(kpi.id)
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "bg-secondary/60 text-muted-foreground border border-transparent"
                }`}
              >
                {kpi.icon} {kpi.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {computedKPIs.map((kpi) => {
          const isPositive = kpi.value >= 0;
          const trendColor = kpi.colorPositive
            ? isPositive ? "hsl(152, 72%, 40%)" : "hsl(0, 70%, 55%)"
            : isPositive ? "hsl(0, 70%, 55%)" : "hsl(152, 72%, 40%)";

          return (
            <div
              key={kpi.id}
              className="bg-secondary/30 rounded-xl p-3.5 space-y-2 hover:bg-secondary/50 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{kpi.icon}</span>
                  <span className="text-[10px] text-muted-foreground">{kpi.label}</span>
                </div>
                {kpi.trend.length >= 2 && (
                  <MiniSparkline data={kpi.trend} color={trendColor} width={48} height={20} />
                )}
              </div>

              <div className="flex items-end justify-between">
                <p className={`text-base font-bold tabular-nums ${
                  kpi.colorPositive
                    ? isPositive ? "text-emerald-500" : "text-red-500"
                    : "text-foreground"
                }`}>
                  {kpi.format(kpi.value)}
                </p>
                {kpi.change !== 0 && (
                  <div className={`flex items-center gap-0.5 text-[9px] ${kpi.change > 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {kpi.change > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    <span>{Math.abs(Math.round(kpi.change))}%</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Helpers ───

function formatCurrency(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function monthlyMetric(txs: any[], extractor: (t: any) => number) {
  const monthMap: Record<string, number> = {};
  txs.forEach((t) => {
    const d = new Date(t.transaction_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap[key] = (monthMap[key] || 0) + extractor(t);
  });

  const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
  const trend = sorted.slice(-6).map(([, v]) => v);
  const current = trend[trend.length - 1] || 0;
  const prev = trend[trend.length - 2] || 1;
  const change = ((current - prev) / (prev || 1)) * 100;

  return { value: current, trend, change: Math.round(change) };
}

function weeklyBalance(txs: any[], accountCode: string, isCredit = false) {
  // Last 8 weeks balance progression
  const now = new Date();
  const weeks: number[] = [];
  for (let w = 7; w >= 0; w--) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - w * 7);
    const filtered = txs.filter((t) => new Date(t.transaction_date) <= cutoff);
    const debits = filtered.filter((t) => t.debit_account_code === accountCode).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const credits = filtered.filter((t) => t.credit_account_code === accountCode).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    weeks.push(isCredit ? credits - debits : debits - credits);
  }
  return weeks;
}

function weeklyTxCount(txs: any[]) {
  const now = new Date();
  const weeks: number[] = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(start.getDate() - (w + 1) * 7);
    const end = new Date(now);
    end.setDate(end.getDate() - w * 7);
    weeks.push(txs.filter((t) => {
      const d = new Date(t.transaction_date);
      return d >= start && d < end;
    }).length);
  }
  return weeks;
}

export default LiveKPICards;

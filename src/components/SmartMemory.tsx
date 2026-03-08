import { useState, useEffect, useMemo } from "react";
import { Brain, TrendingUp, Users, Repeat, Clock, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

interface PatternData {
  description: string;
  count: number;
  lastUsed: string;
  icon: string;
  category: string;
}

interface ContactPattern {
  name: string;
  totalAmount: number;
  txCount: number;
  avgAmount: number;
  lastDate: string;
  type: string;
}

interface TimePattern {
  dayOfWeek: string;
  hour: number;
  count: number;
}

const SmartMemory = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("transactions")
        .select("amount, description, debit_account_code, credit_account_code, transaction_date, transaction_type, payment_method, contact_id, created_at, is_deleted")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(2000);
      setTransactions(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  // ─── Analyze patterns ───
  const analysis = useMemo(() => {
    if (!transactions.length) return null;

    // 1. Frequent transaction types
    const typeCount: Record<string, number> = {};
    const descPatterns: Record<string, { count: number; lastDate: string; totalAmount: number }> = {};
    const paymentMethods: Record<string, number> = {};
    const dayDistribution: Record<string, number> = {
      "الأحد": 0, "الاثنين": 0, "الثلاثاء": 0, "الأربعاء": 0,
      "الخميس": 0, "الجمعة": 0, "السبت": 0,
    };
    const hourDistribution: Record<number, number> = {};
    const monthlyTotals: Record<string, number> = {};

    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    transactions.forEach((tx) => {
      // Type frequency
      const type = tx.transaction_type || "عام";
      typeCount[type] = (typeCount[type] || 0) + 1;

      // Description pattern extraction (first 3 words)
      const desc = (tx.description || "").trim();
      const shortDesc = desc.split(" ").slice(0, 3).join(" ");
      if (shortDesc.length > 3) {
        if (!descPatterns[shortDesc]) {
          descPatterns[shortDesc] = { count: 0, lastDate: tx.transaction_date, totalAmount: 0 };
        }
        descPatterns[shortDesc].count++;
        descPatterns[shortDesc].totalAmount += Number(tx.amount) || 0;
      }

      // Payment methods
      if (tx.payment_method) {
        paymentMethods[tx.payment_method] = (paymentMethods[tx.payment_method] || 0) + 1;
      }

      // Day of week distribution
      const date = new Date(tx.created_at || tx.transaction_date);
      const dayName = dayNames[date.getDay()];
      if (dayName) dayDistribution[dayName]++;

      // Hour distribution
      const hour = date.getHours();
      hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;

      // Monthly totals
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + (Number(tx.amount) || 0);
    });

    // 2. Top recurring patterns
    const topPatterns = Object.entries(descPatterns)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([key, v]) => ({
        description: key,
        count: v.count,
        lastUsed: v.lastDate,
        avgAmount: Math.round(v.totalAmount / v.count),
        icon: "🔄",
        category: "نمط متكرر",
      }));

    // 3. Busiest day
    const busiestDay = Object.entries(dayDistribution)
      .sort((a, b) => b[1] - a[1])[0];

    // 4. Peak hour
    const peakHour = Object.entries(hourDistribution)
      .sort((a, b) => b[1] - a[1])[0];

    // 5. Preferred payment method
    const topPayment = Object.entries(paymentMethods)
      .sort((a, b) => b[1] - a[1])[0];

    // 6. Average transaction amount
    const totalAmount = transactions.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    const avgAmount = Math.round(totalAmount / transactions.length);

    // 7. Top account codes used
    const accountUsage: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.debit_account_code) accountUsage[tx.debit_account_code] = (accountUsage[tx.debit_account_code] || 0) + 1;
      if (tx.credit_account_code) accountUsage[tx.credit_account_code] = (accountUsage[tx.credit_account_code] || 0) + 1;
    });
    const topAccounts = Object.entries(accountUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalTx: transactions.length,
      topPatterns,
      busiestDay,
      peakHour,
      topPayment,
      avgAmount,
      topAccounts,
      typeCount,
      dayDistribution,
    };
  }, [transactions]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!analysis || analysis.totalTx < 5) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card text-center space-y-2">
        <Brain className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">الذاكرة تحتاج المزيد من العمليات لتبدأ بالتعلم...</p>
        <p className="text-[11px] text-muted-foreground/60">سجّل المزيد من المعاملات وسأبدأ بتذكر أنماطك</p>
      </div>
    );
  }

  const insights = [
    {
      icon: "📅",
      label: "يومك الأنشط",
      value: analysis.busiestDay?.[0] || "—",
      sub: `${analysis.busiestDay?.[1] || 0} عملية`,
      color: "text-primary",
    },
    {
      icon: "⏰",
      label: "وقت الذروة",
      value: analysis.peakHour ? `${analysis.peakHour[0]}:00` : "—",
      sub: `${analysis.peakHour?.[1] || 0} عملية`,
      color: "text-amber-500",
    },
    {
      icon: "💳",
      label: "طريقة الدفع المفضلة",
      value: analysis.topPayment?.[0] || "—",
      sub: `${analysis.topPayment?.[1] || 0} مرة`,
      color: "text-emerald-500",
    },
    {
      icon: "📊",
      label: "متوسط المعاملة",
      value: analysis.avgAmount.toLocaleString("en-US"),
      sub: `من ${analysis.totalTx} عملية`,
      color: "text-blue-500",
    },
  ];

  return (
    <div className="bg-card rounded-2xl p-6 space-y-5 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-violet-500" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">ذاكرة المحاسب الذكي</span>
            <Badge className="mr-2 bg-violet-500/10 text-violet-500 border-0 text-[9px] px-1.5">🧠 AI</Badge>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground -mt-2">
        تعلمت من <span className="font-bold text-foreground">{analysis.totalTx}</span> عملية — هذا ما أتذكره عنك
      </p>

      {/* Quick Insights Grid */}
      <div className="grid grid-cols-2 gap-3">
        {insights.map((item) => (
          <div
            key={item.label}
            className="bg-secondary/40 rounded-xl p-3 space-y-1 hover:bg-secondary/60 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-base">{item.icon}</span>
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
            <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground/70">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Expanded: Recurring Patterns */}
      {expanded && (
        <div className="space-y-4 animate-fade-in">
          {/* Recurring patterns */}
          {analysis.topPatterns.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">أنماط متكررة</span>
              </div>
              <div className="space-y-1.5">
                {analysis.topPatterns.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">{p.icon}</span>
                      <span className="text-xs text-foreground truncate">{p.description}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        ~{p.avgAmount.toLocaleString("en-US")}
                      </span>
                      <Badge className="bg-primary/10 text-primary border-0 text-[9px] px-1.5">
                        {p.count}×
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top accounts */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">الحسابات الأكثر استخداماً</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.topAccounts.map(([code, count]) => (
                <div
                  key={code}
                  className="flex items-center gap-1.5 bg-secondary/40 rounded-lg px-2.5 py-1.5"
                >
                  <span className="text-[11px] font-mono font-bold text-foreground">{code}</span>
                  <span className="text-[10px] text-muted-foreground">{count}×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly activity heatmap */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">نشاطك الأسبوعي</span>
            </div>
            <div className="flex gap-1.5">
              {Object.entries(analysis.dayDistribution).map(([day, count]) => {
                const max = Math.max(...Object.values(analysis.dayDistribution));
                const intensity = max > 0 ? count / max : 0;
                return (
                  <div key={day} className="flex-1 text-center space-y-1">
                    <div
                      className="h-8 rounded-lg transition-colors"
                      style={{
                        backgroundColor: `hsl(var(--primary) / ${0.1 + intensity * 0.7})`,
                      }}
                    />
                    <span className="text-[9px] text-muted-foreground">{day.slice(0, 3)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI suggestion */}
          <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-500" />
              <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">
                ملاحظة ذكية
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {analysis.busiestDay?.[0] === "الأحد" || analysis.busiestDay?.[0] === "الاثنين"
                ? `أنت أكثر نشاطاً في بداية الأسبوع (${analysis.busiestDay[0]}). حاول تجهيز فواتيرك مسبقاً يوم الخميس لتوفير الوقت.`
                : analysis.busiestDay?.[0] === "الخميس" || analysis.busiestDay?.[0] === "الجمعة"
                ? `نشاطك يزداد نهاية الأسبوع. تأكد من مراجعة الذمم والشيكات قبل عطلة نهاية الأسبوع.`
                : `يومك الأنشط هو ${analysis.busiestDay?.[0]}. أنصحك بمراجعة التقارير في اليوم التالي لضمان الدقة.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartMemory;

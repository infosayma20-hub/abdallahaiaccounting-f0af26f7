import { useState, useEffect, useMemo } from "react";
import { Shield, AlertTriangle, Copy, TrendingUp, Clock, ChevronDown, ChevronUp, Zap, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { fmtDateDisplay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Anomaly {
  id: string;
  type: "duplicate" | "outlier" | "gap" | "spike" | "unbalanced" | "pattern";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  amount?: number;
  date?: string;
  relatedIds?: string[];
}

const severityConfig = {
  critical: {
    bg: "bg-destructive/8",
    border: "border-destructive/20",
    badge: "bg-destructive/15 text-destructive",
    icon: "text-destructive",
    label: "حرج",
    dot: "bg-destructive",
  },
  warning: {
    bg: "bg-warning/8",
    border: "border-warning/20",
    badge: "bg-warning/15 text-warning",
    icon: "text-warning",
    label: "تحذير",
    dot: "bg-warning",
  },
  info: {
    bg: "bg-primary/8",
    border: "border-primary/20",
    badge: "bg-primary/15 text-primary",
    icon: "text-primary",
    label: "ملاحظة",
    dot: "bg-primary",
  },
};

const typeIcons: Record<Anomaly["type"], React.ElementType> = {
  duplicate: Copy,
  outlier: TrendingUp,
  gap: Clock,
  spike: Zap,
  unbalanced: AlertTriangle,
  pattern: Eye,
};

const FinancialRadar = () => {
  const { user } = useAuth();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    analyzeTransactions();
  }, [user?.id]);

  const analyzeTransactions = async () => {
    setLoading(true);
    try {
      const { data: txs, error } = await supabase
        .from("transactions")
        .select("id, amount, description, transaction_date, debit_account_code, credit_account_code, transaction_type, currency, contact_id, is_deleted, created_at")
        .eq("user_id", dataOwnerId!)
        .eq("is_deleted", false)
        .order("transaction_date", { ascending: false })
        .limit(2000);

      if (error) throw error;
      if (!txs || txs.length === 0) { setLoading(false); return; }

      const detected: Anomaly[] = [];

      // 1. DUPLICATE DETECTION - same amount + date + similar description
      const txByDate = new Map<string, typeof txs>();
      txs.forEach(tx => {
        const key = `${tx.transaction_date}-${tx.amount}`;
        if (!txByDate.has(key)) txByDate.set(key, []);
        txByDate.get(key)!.push(tx);
      });
      txByDate.forEach((group) => {
        if (group.length >= 2) {
          // Check if descriptions are similar
          const desc0 = (group[0].description || "").trim();
          const desc1 = (group[1].description || "").trim();
          if (desc0 && desc1 && (desc0 === desc1 || desc0.includes(desc1) || desc1.includes(desc0))) {
            detected.push({
              id: `dup-${group[0].id}`,
              type: "duplicate",
              severity: "critical",
              title: "عملية مكررة محتملة",
              description: `${group.length} عمليات بنفس المبلغ (₪${group[0].amount?.toLocaleString()}) والوصف في ${fmtDateDisplay(group[0].transaction_date)}`,
              amount: group[0].amount,
              date: group[0].transaction_date,
              relatedIds: group.map(g => g.id),
            });
          }
        }
      });

      // 2. OUTLIER DETECTION - amounts significantly larger than average
      const amounts = txs.map(tx => Math.abs(tx.amount || 0)).filter(a => a > 0);
      if (amounts.length >= 5) {
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const stdDev = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length);
        const threshold = avg + 3 * stdDev;

        txs.filter(tx => Math.abs(tx.amount || 0) > threshold).forEach(tx => {
          const ratio = Math.round((Math.abs(tx.amount || 0) / avg));
          detected.push({
            id: `outlier-${tx.id}`,
            type: "outlier",
            severity: "warning",
            title: "مبلغ غير اعتيادي",
            description: `₪${Math.abs(tx.amount || 0).toLocaleString()} — أكبر ${ratio}× من المتوسط (₪${Math.round(avg).toLocaleString()})`,
            amount: tx.amount,
            date: tx.transaction_date,
          });
        });
      }

      // 3. GAP DETECTION - no transactions for extended period
      const dates = [...new Set(txs.map(tx => tx.transaction_date).filter(Boolean))].sort().reverse();
      if (dates.length >= 2) {
        for (let i = 0; i < Math.min(dates.length - 1, 30); i++) {
          const d1 = new Date(dates[i]);
          const d2 = new Date(dates[i + 1]);
          const gapDays = Math.floor((d1.getTime() - d2.getTime()) / (86400000));
          if (gapDays >= 7) {
            detected.push({
              id: `gap-${dates[i]}-${dates[i + 1]}`,
              type: "gap",
              severity: "info",
              title: "فجوة في التسجيل",
              description: `${gapDays} يوم بدون أي عملية (${dates[i + 1]} إلى ${dates[i]})`,
              date: dates[i],
            });
            break; // Only show the most recent gap
          }
        }
      }

      // 4. EXPENSE SPIKE - current week expenses vs average weekly
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);

      const thisWeekExpenses = txs
        .filter(tx => tx.debit_account_code?.startsWith("5") && new Date(tx.transaction_date) >= oneWeekAgo)
        .reduce((s, tx) => s + (tx.amount || 0), 0);

      const prevWeeksExpenses = txs
        .filter(tx => tx.debit_account_code?.startsWith("5") && new Date(tx.transaction_date) >= fourWeeksAgo && new Date(tx.transaction_date) < oneWeekAgo)
        .reduce((s, tx) => s + (tx.amount || 0), 0);

      const avgWeeklyExpense = prevWeeksExpenses / 3;
      if (avgWeeklyExpense > 0 && thisWeekExpenses > avgWeeklyExpense * 2) {
        const pct = Math.round(((thisWeekExpenses - avgWeeklyExpense) / avgWeeklyExpense) * 100);
        detected.push({
          id: "spike-expenses",
          type: "spike",
          severity: "warning",
          title: "ارتفاع حاد في المصروفات",
          description: `مصروفات هذا الأسبوع ₪${thisWeekExpenses.toLocaleString()} — أعلى ${pct}% من المعدل الأسبوعي (₪${Math.round(avgWeeklyExpense).toLocaleString()})`,
          amount: thisWeekExpenses,
        });
      }

      // 5. SAME-DAY LARGE CASH OUT
      const todayStr = now.toISOString().split("T")[0];
      const todayCashOut = txs
        .filter(tx => tx.transaction_date === todayStr && tx.credit_account_code === "1110")
        .reduce((s, tx) => s + (tx.amount || 0), 0);
      const todayCashIn = txs
        .filter(tx => tx.transaction_date === todayStr && tx.debit_account_code === "1110")
        .reduce((s, tx) => s + (tx.amount || 0), 0);

      if (todayCashOut > 0 && todayCashOut > todayCashIn * 3 && todayCashOut > 1000) {
        detected.push({
          id: "cash-drain",
          type: "pattern",
          severity: "warning",
          title: "تدفق نقدي سلبي اليوم",
          description: `خرج ₪${todayCashOut.toLocaleString()} من الصندوق مقابل ₪${todayCashIn.toLocaleString()} دخل فقط`,
          amount: todayCashOut - todayCashIn,
          date: todayStr,
        });
      }

      // Sort: critical first, then warning, then info
      const order = { critical: 0, warning: 1, info: 2 };
      detected.sort((a, b) => order[a.severity] - order[b.severity]);

      setAnomalies(detected.slice(0, 8));
    } catch (err) {
      console.error("Radar analysis error:", err);
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => ({
    critical: anomalies.filter(a => a.severity === "critical").length,
    warning: anomalies.filter(a => a.severity === "warning").length,
    info: anomalies.filter(a => a.severity === "info").length,
  }), [anomalies]);

  const radarScore = useMemo(() => {
    if (anomalies.length === 0) return 100;
    const penalty = counts.critical * 25 + counts.warning * 10 + counts.info * 3;
    return Math.max(0, 100 - penalty);
  }, [anomalies, counts]);

  const scoreColor = radarScore >= 80 ? "text-primary" : radarScore >= 50 ? "text-warning" : "text-destructive";
  const scoreLabel = radarScore >= 80 ? "سليم" : radarScore >= 50 ? "يحتاج مراجعة" : "حرج";

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-6 shadow-card animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-muted rounded w-32" />
            <div className="h-3 bg-muted rounded w-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-destructive/10 to-warning/10 flex items-center justify-center relative">
            <Shield className="h-5 w-5 text-destructive" />
            {counts.critical > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-destructive text-[8px] text-white flex items-center justify-center font-bold animate-pulse">
                {counts.critical}
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">🚨 الرادار المالي</p>
            <p className="text-[10px] text-muted-foreground">
              {anomalies.length === 0 ? "لا توجد ملاحظات — كل شيء سليم ✓" : `${anomalies.length} ملاحظة مكتشفة`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Score badge */}
          <div className="text-center">
            <p className={`text-lg font-black tabular-nums ${scoreColor}`}>{radarScore}</p>
            <p className="text-[8px] text-muted-foreground">{scoreLabel}</p>
          </div>

          {/* Severity summary pills */}
          <div className="flex gap-1">
            {counts.critical > 0 && <Badge className="bg-destructive/15 text-destructive border-0 text-[9px] px-1.5">{counts.critical}</Badge>}
            {counts.warning > 0 && <Badge className="bg-warning/15 text-warning border-0 text-[9px] px-1.5">{counts.warning}</Badge>}
            {counts.info > 0 && <Badge className="bg-primary/15 text-primary border-0 text-[9px] px-1.5">{counts.info}</Badge>}
          </div>

          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Body */}
      {expanded && anomalies.length > 0 && (
        <div className="px-5 pb-4 space-y-2">
          {anomalies.map((anomaly) => {
            const config = severityConfig[anomaly.severity];
            const IconComp = typeIcons[anomaly.type];
            return (
              <div
                key={anomaly.id}
                className={`flex items-start gap-3 p-3 rounded-xl border ${config.bg} ${config.border} transition-all hover:scale-[1.01]`}
              >
                <div className={`w-7 h-7 rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <IconComp className={`h-3.5 w-3.5 ${config.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-bold text-foreground">{anomaly.title}</p>
                    <Badge className={`${config.badge} border-0 text-[8px] px-1.5 py-0`}>{config.label}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-line">{anomaly.description}</p>
                  {anomaly.date && (
                    <p className="text-[9px] text-muted-foreground/60 mt-1 tabular-nums">📅 {anomaly.date}</p>
                  )}
                </div>
                <div className={`w-1.5 h-1.5 rounded-full ${config.dot} flex-shrink-0 mt-2 animate-pulse`} />
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {expanded && anomalies.length === 0 && !loading && (
        <div className="px-5 pb-5 text-center">
          <div className="py-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground">كل شيء سليم ✓</p>
            <p className="text-[11px] text-muted-foreground mt-1">لم يكتشف الرادار أي عمليات غير طبيعية</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialRadar;

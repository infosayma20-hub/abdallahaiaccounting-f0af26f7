import { useState } from "react";
import { AlertTriangle, TrendingUp, Package, Zap, ChevronLeft, Loader2, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface FinancialAlert {
  type: string;
  priority: "high" | "medium" | "low" | "positive";
  title: string;
  description: string;
  cta_text: string;
  cta_action: string;
  icon: string;
  metrics?: Record<string, any>;
}

interface SmartAlertCardProps {
  alert: FinancialAlert | null;
  allAlerts?: FinancialAlert[];
  userId?: string;
}

const priorityStyles: Record<string, { border: string; bg: string; glow: string; badge: string }> = {
  high: {
    border: "border-destructive/30",
    bg: "bg-destructive/5",
    glow: "shadow-[0_0_20px_-5px_hsl(var(--destructive)/0.15)]",
    badge: "bg-destructive/15 text-destructive",
  },
  medium: {
    border: "border-warning/30",
    bg: "bg-warning/5",
    glow: "shadow-[0_0_20px_-5px_hsl(var(--warning)/0.15)]",
    badge: "bg-warning/15 text-warning",
  },
  low: {
    border: "border-primary/30",
    bg: "bg-primary/5",
    glow: "shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]",
    badge: "bg-primary/15 text-primary",
  },
  positive: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    glow: "shadow-[0_0_20px_-5px_rgba(16,185,129,0.15)]",
    badge: "bg-emerald-500/15 text-emerald-600",
  },
};

const SmartAlertCard = ({ alert, allAlerts, userId }: SmartAlertCardProps) => {
  const navigate = useNavigate();
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!alert || dismissed) return null;

  const styles = priorityStyles[alert.priority] || priorityStyles.low;

  const handleCTA = async () => {
    // Actions that navigate
    if (alert.cta_action === "record_transaction") {
      navigate("/voice");
      return;
    }

    // Actions that trigger AI analysis
    setAnalyzing(true);
    try {
      const actionPrompts: Record<string, string> = {
        generate_collection_plan: `لدي ${alert.metrics?.count || ''} فواتير متأخرة بقيمة ${alert.metrics?.amount || ''} شيكل. أقدم لي خطة تحصيل عملية مع خطوات واضحة وجدول زمني.`,
        analyze_liquidity: `النقد الحالي ${alert.metrics?.cash || ''} شيكل والالتزامات ${alert.metrics?.liabilities || ''} شيكل. حلل وضع السيولة وقدم توصيات لتحسينه.`,
        analyze_stale_inventory: `لدي ${alert.metrics?.count || ''} منتجات راكدة بقيمة ${alert.metrics?.value || ''} شيكل (${(alert.metrics?.products || []).join('، ')}). حلل المخزون الراكد وقدم حلول للتصريف.`,
        analyze_profits: `هامش الربح ${alert.metrics?.margin || ''}% والإيرادات ${alert.metrics?.revenue || ''} والمصروفات ${alert.metrics?.expenses || ''}. حلل الأداء المالي وقدم توصيات للتحسين.`,
      };

      const prompt = actionPrompts[alert.cta_action] || `حلل: ${alert.description}`;

      // Navigate to smart report with the prompt
      navigate(`/smart-report?q=${encodeURIComponent(prompt)}`);
    } catch (err) {
      console.error("AI analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className={`relative rounded-2xl border ${styles.border} ${styles.bg} ${styles.glow} p-4 space-y-3 overflow-hidden transition-all duration-500`}>
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 left-3 w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{alert.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">{alert.title}</h3>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${styles.badge}`}>
              {alert.priority === "high" ? "عاجل" : alert.priority === "medium" ? "متوسط" : alert.priority === "positive" ? "إيجابي" : "تنبيه"}
            </span>
          </div>
        </div>
        {allAlerts && allAlerts.length > 1 && (
          <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            +{allAlerts.length - 1} تنبيهات
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
        {alert.description}
      </p>

      {/* AI Analysis Result */}
      {aiAnalysis && (
        <div className="bg-card/80 backdrop-blur-sm rounded-xl p-3 border border-border/50">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary">تحليل الذكاء الاصطناعي</span>
          </div>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{aiAnalysis}</p>
        </div>
      )}

      {/* CTA Button */}
      <button
        onClick={handleCTA}
        disabled={analyzing}
        className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-[0.98] ${
          alert.priority === "positive"
            ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20"
            : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
        } disabled:opacity-50`}
      >
        {analyzing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            جارِ التحليل...
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            {alert.cta_text}
          </>
        )}
      </button>
    </div>
  );
};

export default SmartAlertCard;

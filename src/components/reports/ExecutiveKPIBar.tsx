import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, TrendingDown, Package, Users, Building2, Receipt, Banknote } from "lucide-react";
import { loadExecutiveKPIs, type ExecutiveKPIs } from "@/lib/reports/executive-kpis";

/**
 * P5 — Executive KPI Bar.
 * 8-card snapshot of revenue, profitability, inventory and cash health.
 * Read-only. No accounting writes. Embed on dashboards or report landing pages.
 */

function fmt(n: number) {
  return `₪${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ITEMS: Array<{
  key: keyof ExecutiveKPIs;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "good" | "warn" | "bad" | "neutral";
}> = [
  { key: "revenue", label: "الإيرادات", icon: TrendingUp, tone: "primary" },
  { key: "grossProfit", label: "الربح الإجمالي", icon: TrendingUp, tone: "good" },
  { key: "netProfit", label: "صافي الربح", icon: TrendingUp, tone: "good" },
  { key: "inventoryValue", label: "قيمة المخزون", icon: Package, tone: "neutral" },
  { key: "ar", label: "الذمم المدينة", icon: Users, tone: "neutral" },
  { key: "ap", label: "الذمم الدائنة", icon: Building2, tone: "warn" },
  { key: "vatPayable", label: "ضريبة مستحقة", icon: Receipt, tone: "warn" },
  { key: "cashPosition", label: "السيولة (نقد+بنك)", icon: Banknote, tone: "primary" },
];

const toneClass: Record<string, string> = {
  primary: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
  neutral: "text-foreground/80",
};

export function ExecutiveKPIBar({ uid, from, to }: { uid: string; from?: string; to?: string }) {
  const [kpis, setKpis] = useState<ExecutiveKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadExecutiveKPIs(uid, { from, to })
      .then((k) => { if (!cancelled) setKpis(k); })
      .catch((e) => { console.error("[ExecutiveKPIBar]", e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, from, to]);

  return (
    <div dir="rtl" className="grid grid-cols-2 md:grid-cols-4 gap-2 print:grid-cols-4">
      {ITEMS.map(({ key, label, icon: Icon, tone }) => {
        const value = kpis ? (kpis[key] as number) : 0;
        const isNeg = (key === "netProfit" || key === "grossProfit") && value < 0;
        return (
          <Card key={key} className="p-3 border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </div>
            {loading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <p className={`text-sm font-bold font-mono ${isNeg ? "text-red-600 dark:text-red-400" : toneClass[tone]}`}>
                {fmt(value)}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default ExecutiveKPIBar;
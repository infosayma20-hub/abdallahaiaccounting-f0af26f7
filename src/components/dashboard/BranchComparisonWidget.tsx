import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import WidgetBanner from "./WidgetBanner";
import { useTT } from "@/i18n/dict";

interface Row {
  id: string;
  name: string;
  revenue: number;
  expenses: number;
  net: number;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function BranchComparisonWidget() {
  const tt = useTT();
  const { dataOwnerId } = useDataOwnerId();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dataOwnerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { data: centers } = await supabase
          .from("cost_centers")
          .select("id, name")
          .eq("user_id", dataOwnerId)
          .eq("is_active", true);

        if (!centers || centers.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false); }
          return;
        }

        const { data: txs } = await supabase
          .from("transactions")
          .select("cost_center_id, amount, type, is_deleted")
          .eq("user_id", dataOwnerId)
          .gte("date", monthStart.toISOString().slice(0, 10))
          .not("cost_center_id", "is", null);

        const agg = new Map<string, { revenue: number; expenses: number }>();
        (txs ?? []).forEach((t: any) => {
          if (t.is_deleted) return;
          const cur = agg.get(t.cost_center_id) ?? { revenue: 0, expenses: 0 };
          const amt = Number(t.amount ?? 0);
          if (t.type === "income" || t.type === "sale") cur.revenue += amt;
          else if (t.type === "expense" || t.type === "purchase") cur.expenses += amt;
          agg.set(t.cost_center_id, cur);
        });

        const built: Row[] = centers.map((c: any) => {
          const a = agg.get(c.id) ?? { revenue: 0, expenses: 0 };
          return { id: c.id, name: c.name, revenue: a.revenue, expenses: a.expenses, net: a.revenue - a.expenses };
        }).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

        if (!cancelled) setRows(built);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dataOwnerId]);

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-6 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="h-[200px] bg-muted rounded-xl" />
      </div>
    );
  }

  const maxRevenue = rows.length > 0 ? Math.max(...rows.map(r => r.revenue), 1) : 1;

  return (
    <div className="col-span-12 lg:col-span-6 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <WidgetBanner title=tt("مقارنة الفروع (الشهر الحالي)") icon="🏢" />
      {rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">{tt("لا توجد مراكز تكلفة مفعّلة"))}</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.id} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground font-medium truncate">{r.name}</span>
                <div className="flex items-center gap-3 shrink-0 tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>
                  <span className="text-emerald-600">₪{fmt(r.revenue)}</span>
                  <span className="text-rose-600">₪{fmt(r.expenses)}</span>
                  <span className={`font-bold ${r.net >= 0 ? "text-foreground" : "text-rose-700"}`}>
                    {r.net >= 0 ? "" : "-"}₪{fmt(Math.abs(r.net))}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-secondary/30">
                <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${Math.max(3, (r.revenue / maxRevenue) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
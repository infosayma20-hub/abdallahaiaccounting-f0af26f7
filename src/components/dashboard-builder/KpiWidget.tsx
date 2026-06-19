/**
 * KpiWidget — يعرض رقم/مؤشر مالي بسيط من جدول الإيرادات/المصروفات/إلخ.
 * Config: { metric: "sales_total" | "purchases_total" | "products_count" | "low_stock", period: "today" | "week" | "month" | "year", color?: string }
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TrendingUp, TrendingDown, Package, AlertCircle, Loader2 } from "lucide-react";

interface Props {
  config: any;
  title?: string | null;
}

const METRICS = [
  { key: "sales_total",     label: "إجمالي المبيعات",   icon: TrendingUp, color: "#10b981" },
  { key: "purchases_total", label: "إجمالي المشتريات", icon: TrendingDown, color: "#f59e0b" },
  { key: "products_count",  label: "عدد الأصناف",       icon: Package, color: "#8b5cf6" },
  { key: "low_stock",       label: "أصناف ناقصة",       icon: AlertCircle, color: "#ef4444" },
] as const;

export const KPI_METRICS = METRICS;

function periodRange(period: string): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (period === "today") return { from: to, to };
  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (period === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (period === "year") {
    const d = new Date(now.getFullYear(), 0, 1);
    return { from: d.toISOString().slice(0, 10), to };
  }
  return {};
}

export default function KpiWidget({ config, title }: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const metric = METRICS.find(m => m.key === config?.metric) || METRICS[0];
  const period = config?.period || "month";

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { from, to } = periodRange(period);
        const sb: any = supabase;
        let v = 0;
        if (metric.key === "sales_total") {
          let q = sb.from("invoices").select("total_amount").eq("user_id", user.id).eq("invoice_type", "sale").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)");
          if (from) q = q.gte("invoice_date", from);
          if (to) q = q.lte("invoice_date", to);
          const { data } = await q;
          v = (data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
        } else if (metric.key === "purchases_total") {
          let q = sb.from("invoices").select("total_amount").eq("user_id", user.id).eq("invoice_type", "purchase").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)");
          if (from) q = q.gte("invoice_date", from);
          if (to) q = q.lte("invoice_date", to);
          const { data } = await q;
          v = (data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
        } else if (metric.key === "products_count") {
          const { count } = await sb.from("products").select("id", { count: "exact", head: true }).eq("user_id", user.id);
          v = count || 0;
        } else if (metric.key === "low_stock") {
          const { data } = await sb.from("products").select("quantity, min_quantity").eq("user_id", user.id);
          v = (data || []).filter((r: any) => Number(r.quantity || 0) <= Number(r.min_quantity || 0)).length;
        }
        if (alive) setValue(v);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user, metric.key, period]);

  const Icon = metric.icon;
  const isMoney = metric.key === "sales_total" || metric.key === "purchases_total";
  const fmt = (n: number) => isMoney
    ? `₪${n.toLocaleString("en", { maximumFractionDigits: 0 })}`
    : n.toLocaleString("en");

  return (
    <div className="h-full w-full flex flex-col justify-between p-4 rounded-2xl bg-card border border-border/40 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{title || metric.label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${metric.color}1a`, color: metric.color }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: "JetBrains Mono", color: metric.color }}>
            {fmt(value ?? 0)}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {period === "today" ? "اليوم" : period === "week" ? "آخر 7 أيام" : period === "month" ? "هذا الشهر" : "هذه السنة"}
        </p>
      </div>
    </div>
  );
}

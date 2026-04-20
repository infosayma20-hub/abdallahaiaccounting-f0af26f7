/**
 * InsightsWidget — يستدعي edge function dashboard-insights ويعرض 3-5 نقاط ذكية.
 * Config: { period?: "today" | "week" | "month" | "year" }
 * يجمع ملخص مالي سريع (مبيعات، مشتريات، نواقص) ثم يطلب تحليل من Lovable AI.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";

interface Props {
  config: any;
  title?: string | null;
}

function periodRange(period: string): { from?: string; to?: string; label: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (period === "today") return { from: to, to, label: "اليوم" };
  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { from: d.toISOString().slice(0, 10), to, label: "آخر 7 أيام" };
  }
  if (period === "year") {
    const d = new Date(now.getFullYear(), 0, 1);
    return { from: d.toISOString().slice(0, 10), to, label: "هذه السنة" };
  }
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: d.toISOString().slice(0, 10), to, label: "هذا الشهر" };
}

export default function InsightsWidget({ config, title }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const period = config?.period || "month";

  const generate = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const sb: any = supabase;
      const { from, to, label } = periodRange(period);
      // ── Quick aggregates ──
      const [salesQ, purchQ, prodsQ, lowQ] = await Promise.all([
        sb.from("invoices").select("total_amount, invoice_date").eq("user_id", user.id).gte("invoice_date", from).lte("invoice_date", to),
        sb.from("purchases").select("total_amount, purchase_date").eq("user_id", user.id).gte("purchase_date", from).lte("purchase_date", to),
        sb.from("products").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        sb.from("products").select("name, quantity, min_quantity").eq("user_id", user.id),
      ]);
      const salesTotal = (salesQ.data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      const purchTotal = (purchQ.data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      const productsCount = prodsQ.count || 0;
      const lowStock = (lowQ.data || []).filter((r: any) => Number(r.quantity || 0) <= Number(r.min_quantity || 0));
      const lowStockNames = lowStock.slice(0, 5).map((r: any) => r.name).join("، ");
      const margin = salesTotal - purchTotal;
      const marginPct = salesTotal > 0 ? ((margin / salesTotal) * 100).toFixed(1) : "0";

      const context = [
        `الفترة: ${label}`,
        `إجمالي المبيعات: ₪${salesTotal.toLocaleString("en")}`,
        `إجمالي المشتريات: ₪${purchTotal.toLocaleString("en")}`,
        `الفارق (مبيعات - مشتريات): ₪${margin.toLocaleString("en")} (${marginPct}%)`,
        `عدد فواتير المبيعات: ${(salesQ.data || []).length}`,
        `عدد فواتير المشتريات: ${(purchQ.data || []).length}`,
        `عدد الأصناف الكلي: ${productsCount}`,
        `أصناف ناقصة المخزون: ${lowStock.length}${lowStockNames ? ` (مثل: ${lowStockNames})` : ""}`,
      ].join("\n");

      const { data, error: fnErr } = await supabase.functions.invoke("dashboard-insights", {
        body: { context, language: "ar" },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) {
        setError((data as any).message || "تعذر توليد التحليل");
      } else {
        setInsights((data as any)?.insights || "");
      }
    } catch (e: any) {
      setError(e?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [user, period]);

  useEffect(() => {
    if (config?.autoGenerate !== false) generate();
  }, [generate, config?.autoGenerate]);

  return (
    <div className="h-full w-full flex flex-col p-4 rounded-2xl bg-gradient-to-br from-primary/8 via-primary/3 to-transparent border border-primary/20 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-xs font-bold text-foreground truncate">{title || "تحليلات ذكية"}</p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="widget-no-drag p-1.5 rounded-lg hover:bg-background/60 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          title="إعادة التوليد"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-auto widget-no-drag">
        {loading && !insights ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-[11px]">يحلل البيانات...</p>
          </div>
        ) : error ? (
          <p className="text-xs text-destructive p-2">{error}</p>
        ) : insights ? (
          <div className="space-y-1.5">
            {insights.split("\n").filter(Boolean).map((line, i) => (
              <p key={i} className="text-xs text-foreground leading-relaxed">{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground p-2">اضغط على زر التحديث للحصول على تحليل.</p>
        )}
      </div>
    </div>
  );
}

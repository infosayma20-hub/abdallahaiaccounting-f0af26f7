import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, Download, RefreshCw, TrendingUp, Search } from "lucide-react";
import { toast } from "sonner";

interface Row {
  productId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  posRevenue: number;
  invoiceRevenue: number;
  currentStock: number;
  buyPrice: number;
  sellPrice: number;
}

const money = (n: number) => `₪${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function ProductProfitReportPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_product_profitability", { p_from: from, p_to: to });
    setLoading(false);
    if (error) { toast.error("تعذّر تحميل التقرير: " + error.message); return; }
    setRows(((data as any[]) || []).map((r) => ({
      ...r,
      qty: Number(r.qty || 0), revenue: Number(r.revenue || 0), cost: Number(r.cost || 0),
      profit: Number(r.profit || 0), marginPct: Number(r.marginPct || 0),
      posRevenue: Number(r.posRevenue || 0), invoiceRevenue: Number(r.invoiceRevenue || 0),
      currentStock: Number(r.currentStock || 0), buyPrice: Number(r.buyPrice || 0), sellPrice: Number(r.sellPrice || 0),
    })));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => (r.name || "").toLowerCase().includes(term) || (r.sku || "").toLowerCase().includes(term) || (r.category || "").toLowerCase().includes(term));
  }, [rows, q]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    qty: a.qty + r.qty, revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit,
  }), { qty: 0, revenue: 0, cost: 0, profit: 0 }), [filtered]);

  const exportCsv = () => {
    if (filtered.length === 0) { toast.error("لا توجد بيانات"); return; }
    const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["الكود","الصنف","الفئة","الكمية المباعة","الإيراد","التكلفة","الربح","هامش %","إيراد نقطة البيع","إيراد الفواتير","الرصيد الحالي","سعر الشراء","سعر البيع"];
    const body = filtered.map(r => [r.sku || "", r.name, r.category || "", r.qty, r.revenue, r.cost, r.profit, r.marginPct, r.posRevenue, r.invoiceRevenue, r.currentStock, r.buyPrice, r.sellPrice]);
    const totalRow = ["", "الإجمالي", "", totals.qty, totals.revenue, totals.cost, totals.profit, totals.revenue ? ((totals.profit / totals.revenue) * 100).toFixed(2) : 0, "", "", "", "", ""];
    const csv = "\uFEFF" + [headers, ...body, totalRow].map(r => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `product-profit-${from}_${to}.csv`; a.click();
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">تقرير ربحية الأصناف</h1>
            <p className="text-xs text-muted-foreground">الإيراد والتكلفة والربح لكل صنف من نقاط البيع وفواتير المبيعات.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 ml-1" /> تصدير Excel</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")}><ArrowRight className="h-4 w-4 ml-1" /> رجوع</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          <Button size="sm" onClick={load} disabled={loading} className="h-9">
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالصنف أو الكود..." className="h-9 pr-8" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "الكمية المباعة", value: totals.qty.toLocaleString() },
          { label: "إجمالي الإيراد", value: money(totals.revenue) },
          { label: "إجمالي التكلفة", value: money(totals.cost) },
          { label: "صافي الربح", value: money(totals.profit), negative: totals.profit < 0 },
        ].map((k, i) => (
          <div key={i} className="px-3 py-2 rounded border border-border bg-card">
            <p className={`text-sm font-semibold tabular-nums ${k.negative ? "text-destructive" : "text-foreground"}`}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                {["الكود","الصنف","الفئة","الكمية","الإيراد","التكلفة","الربح","الهامش %","الرصيد الحالي"].map(h => (
                  <th key={h} className="px-2 py-2 text-right whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={9} className="py-8 text-center text-muted-foreground">جارٍ التحميل…</td></tr>)}
              {!loading && filtered.length === 0 && (<tr><td colSpan={9} className="py-8 text-center text-muted-foreground">لا توجد بيانات للفترة المحددة</td></tr>)}
              {!loading && filtered.map((r, i) => (
                <tr key={(r.productId || r.name) + i} className="border-b border-border hover:bg-muted/40">
                  <td className="px-2 py-1.5 font-mono text-[11px]">{r.sku || "—"}</td>
                  <td className="px-2 py-1.5">{r.name}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.category || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-2 py-1.5 tabular-nums">{money(r.revenue)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{money(r.cost)}</td>
                  <td className={`px-2 py-1.5 tabular-nums font-semibold ${r.profit < 0 ? "text-destructive" : ""}`}>{money(r.profit)}</td>
                  <td className={`px-2 py-1.5 tabular-nums ${r.marginPct < 0 ? "text-destructive" : ""}`}>{r.marginPct.toFixed(1)}%</td>
                  <td className={`px-2 py-1.5 tabular-nums ${r.currentStock < 0 ? "text-destructive" : ""}`}>{r.currentStock.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

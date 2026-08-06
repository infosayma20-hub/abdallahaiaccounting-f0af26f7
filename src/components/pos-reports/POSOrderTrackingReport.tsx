/** تقرير تتبع الطلبيات — زمن التسليم من لحظة الطباعة، على مستوى الطلبية والصنف. */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface Props { dateFrom: Date; dateTo: Date; branchIds: string[]; compact?: boolean }

interface OrderRow { order_id: string; order_number: string | null; display_number: string | null; printed_at: string; delivered_at: string | null; target_minutes: number; elapsed_seconds: number | null; is_late: boolean }
interface ItemRow { product_name: string; delivered_at: string | null; elapsed_seconds: number | null; target_minutes: number; is_late: boolean }

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function POSOrderTrackingReport({ dateFrom, dateTo, branchIds, compact }: Props) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const branchKey = branchIds.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const from = format(dateFrom, "yyyy-MM-dd");
      const to = format(dateTo, "yyyy-MM-dd");
      let oq = supabase.from("pos_order_tracking")
        .select("order_id, order_number, display_number, printed_at, delivered_at, target_minutes, elapsed_seconds, is_late")
        .gte("business_date", from).lte("business_date", to).eq("is_cancelled", false).limit(5000);
      let iq = supabase.from("pos_order_item_tracking")
        .select("product_name, delivered_at, elapsed_seconds, target_minutes, is_late")
        .gte("business_date", from).lte("business_date", to).limit(20000);
      if (branchIds.length) { oq = oq.in("branch_id", branchIds); iq = iq.in("branch_id", branchIds); }
      const [{ data: o }, { data: i }] = await Promise.all([oq, iq]);
      if (cancelled) return;
      setOrders((o as any) || []);
      setItems((i as any) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, branchKey]);

  const stats = useMemo(() => {
    const done = orders.filter(o => o.delivered_at && o.elapsed_seconds != null);
    const avgOrder = done.length ? done.reduce((s, o) => s + (o.elapsed_seconds || 0), 0) / done.length : 0;
    const lateOrders = done.filter(o => o.is_late).length;
    const doneItems = items.filter(i => i.delivered_at && i.elapsed_seconds != null);
    const avgItem = doneItems.length ? doneItems.reduce((s, i) => s + (i.elapsed_seconds || 0), 0) / doneItems.length : 0;
    const lateItems = doneItems.filter(i => i.is_late).length;
    return {
      total: orders.length, done: done.length, avgOrder, lateOrders,
      compliance: done.length ? ((done.length - lateOrders) / done.length) * 100 : 0,
      avgItem, lateItems, doneItems: doneItems.length,
    };
  }, [orders, items]);

  const slowest = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number; late: number }>();
    items.filter(i => i.delivered_at && i.elapsed_seconds != null).forEach(i => {
      const r = map.get(i.product_name) || { name: i.product_name, count: 0, total: 0, late: 0 };
      r.count++; r.total += i.elapsed_seconds || 0; if (i.is_late) r.late++;
      map.set(i.product_name, r);
    });
    return [...map.values()].map(r => ({ ...r, avg: r.total / r.count }))
      .sort((a, b) => b.avg - a.avg).slice(0, compact ? 5 : 20);
  }, [items, compact]);

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orders.map(o => ({
      "رقم الطلبية": o.display_number || o.order_number,
      "وقت الطباعة": new Date(o.printed_at).toLocaleString("ar-PS"),
      "وقت التسليم": o.delivered_at ? new Date(o.delivered_at).toLocaleString("ar-PS") : "—",
      "المدة": o.elapsed_seconds != null ? mmss(o.elapsed_seconds) : "—",
      "الهدف (دقيقة)": o.target_minutes,
      "متأخرة": o.is_late ? "نعم" : "لا",
    }))), "الطلبيات");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slowest.map(s => ({
      "الصنف": s.name, "عدد المرات": s.count, "متوسط الزمن": mmss(s.avg), "مرات التأخير": s.late,
    }))), "أبطأ الأصناف");
    XLSX.writeFile(wb, "order-tracking.xlsx");
    toast.success("تم التصدير");
  };

  if (loading) return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const Card = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold font-mono tabular-nums ${tone || ""}`}>{value}</p>
    </div>
  );

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="طلبيات متتبعة" value={String(stats.total)} />
        <Card label="متوسط تسليم الطلبية" value={stats.avgOrder ? mmss(stats.avgOrder) : "—"} />
        <Card label="متوسط تسليم الصنف" value={stats.avgItem ? mmss(stats.avgItem) : "—"} />
        <Card label="الالتزام بالهدف" value={`${stats.compliance.toFixed(0)}%`}
          tone={stats.compliance >= 80 ? "text-emerald-600" : "text-red-600"} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">أبطأ الأصناف</h3>
        {!compact && (
          <button onClick={exportXlsx} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg border hover:bg-muted">
            <Download className="w-3.5 h-3.5" /> تصدير Excel
          </button>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">الصنف</th>
              <th className="p-2">عدد المرات</th>
              <th className="p-2">متوسط الزمن</th>
              <th className="p-2">مرات التأخير</th>
            </tr>
          </thead>
          <tbody>
            {slowest.map(s => (
              <tr key={s.name} className="border-t">
                <td className="p-2 text-right">{s.name}</td>
                <td className="p-2 text-center tabular-nums">{s.count}</td>
                <td className="p-2 text-center font-mono tabular-nums">{mmss(s.avg)}</td>
                <td className={`p-2 text-center tabular-nums ${s.late ? "text-red-600" : ""}`}>{s.late}</td>
              </tr>
            ))}
            {slowest.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">لا توجد بيانات في هذه الفترة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props { dataOwnerId: string; dateFrom: Date; dateTo: Date; }

interface Row {
  id: string; created_at: string; status: string | null; total: number | null;
  target_branch_id: string | null; target_branch_name: string | null;
  delivery_info: any; pos_order_id: string | null;
}
interface PosOrder { id: string; order_number: string | null; total: number | null; state: string | null; }

const STATUS: Record<string, string> = {
  pending: "بانتظار الكاشير", accepted: "مقبول", completed: "مكتمل",
  cancelled: "ملغي", cancelled_after_acceptance: "ملغي بعد القبول", rejected: "مرفوض",
};
const money = (n: number) => `₪${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const isCancelled = (s: string | null) => !!s && /cancel|reject/.test(s);

/** تقرير الكيوسك: ملخص الطلبات لكل كيوسك (الكيوسك مربوط بفرع واحد). قراءة فقط. */
const POSKioskReport = ({ dataOwnerId, dateFrom, dateTo }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Record<string, PosOrder>>({});
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("call_center_orders" as any)
        .select("id, created_at, status, total, target_branch_id, target_branch_name, delivery_info, pos_order_id")
        .eq("user_id", dataOwnerId)
        .ilike("source_app", "kiosk")
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000);
      const list = ((data as any[]) || []) as Row[];
      const ids = Array.from(new Set(list.map(r => r.pos_order_id).filter(Boolean))) as string[];
      const om: Record<string, PosOrder> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data: ps } = await supabase.from("pos_orders").select("id, order_number, total, state").in("id", ids.slice(i, i + 200));
        ((ps as any[]) || []).forEach(p => { om[p.id] = p; });
      }
      const bIds = Array.from(new Set(list.map(r => r.target_branch_id || r.delivery_info?.branch_id).filter(Boolean))) as string[];
      const bm: Record<string, string> = {};
      if (bIds.length) {
        const { data: bs } = await supabase.from("branches").select("id, name").in("id", bIds);
        ((bs as any[]) || []).forEach(b => { bm[b.id] = b.name; });
      }
      if (!cancel) { setRows(list); setOrders(om); setBranchNames(bm); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [dataOwnerId, dateFrom, dateTo]);

  const branchOf = (r: Row) => r.target_branch_id || r.delivery_info?.branch_id || "—";
  const invoiceOf = (r: Row) => {
    const o = r.pos_order_id ? orders[r.pos_order_id] : undefined;
    return o && o.state !== "cancelled" ? o : undefined;
  };

  const summary = useMemo(() => {
    const m = new Map<string, { name: string; count: number; invoiced: number; amount: number; cancelled: number }>();
    rows.forEach(r => {
      const k = branchOf(r);
      const name = branchNames[k] || r.target_branch_name || "غير محدد";
      const cur = m.get(k) || { name, count: 0, invoiced: 0, amount: 0, cancelled: 0 };
      cur.count++;
      const inv = invoiceOf(r);
      if (inv) { cur.invoiced++; cur.amount += Number(inv.total) || 0; }
      if (isCancelled(r.status)) cur.cancelled++;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, orders, branchNames]);

  const tot = summary.reduce((s, x) => ({ count: s.count + x.count, invoiced: s.invoiced + x.invoiced, amount: s.amount + x.amount }), { count: 0, invoiced: 0, amount: 0 });

  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>;

  const th = "px-4 py-2.5 text-xs font-semibold text-right";
  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["طلبات الكيوسك", tot.count.toLocaleString()],
          ["صارت فواتير", tot.invoiced.toLocaleString()],
          ["مبلغ الفواتير", money(tot.amount)],
          ["متوسط الطلب", money(tot.invoiced ? tot.amount / tot.invoiced : 0)],
        ].map(([l, v]) => (
          <div key={l} className="bg-card border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-lg font-bold text-foreground tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold text-foreground">ملخص لكل كيوسك</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr><th className={th}>الكيوسك (الفرع)</th><th className={th}>عدد الطلبات</th><th className={th}>صارت فواتير</th><th className={th}>ملغاة</th><th className={th}>المبلغ</th><th className={th}>متوسط الطلب</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-10">لا توجد طلبات كيوسك في هذه الفترة</td></tr>}
              {summary.map(s => (
                <tr key={s.name} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.count}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.invoiced}</td>
                  <td className="px-4 py-2.5 tabular-nums text-destructive">{s.cancelled}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{money(s.amount)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{money(s.invoiced ? s.amount / s.invoiced : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold text-foreground">قائمة طلبات الكيوسك</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr><th className={th}>التاريخ</th><th className={th}>رقم الطلب</th><th className={th}>الكيوسك (الفرع)</th><th className={th}>الحالة</th><th className={th}>مبلغ الطلب</th><th className={th}>الفاتورة المرتبطة</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => {
                const o = r.pos_order_id ? orders[r.pos_order_id] : undefined;
                const b = branchOf(r);
                return (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap" dir="ltr">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.delivery_info?.order_number || "—"}</td>
                    <td className="px-4 py-2.5">{branchNames[b] || r.target_branch_name || "—"}</td>
                    <td className={`px-4 py-2.5 ${isCancelled(r.status) ? "text-destructive" : ""}`}>{STATUS[r.status || ""] || r.status || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{money(Number(r.total) || 0)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {o ? <span className={o.state === "cancelled" ? "line-through text-muted-foreground" : ""}>{o.order_number}</span> : <span className="text-muted-foreground">لم تُفوتر</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default POSKioskReport;

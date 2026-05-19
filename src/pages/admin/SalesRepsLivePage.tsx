import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, RefreshCw, Truck, Wallet, Warehouse as WarehouseIcon, Loader2, Pencil, Lock } from "lucide-react";
import PromoteEmployeeToRepDialog from "@/components/admin/PromoteEmployeeToRepDialog";
import EditSalesRepDialog from "@/components/admin/EditSalesRepDialog";
import { useToast } from "@/hooks/use-toast";

interface RepRow {
  id: string;
  full_name: string;
  is_active: boolean;
  warehouse_name: string | null;
  cash_box_name: string | null;
  day_status: "open" | "closed" | null;
  day_id: string | null;
  total_invoices: number;
  total_cash: number;
  total_credit: number;
  total_expenses: number;
  employee_id: string | null;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);

export default function SalesRepsLivePage() {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPromote, setOpenPromote] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: reps } = await (supabase as any)
        .from("sales_representatives")
        .select("id, full_name, is_active, default_warehouse_id, cash_box_id, employee_id, employee:employees!sales_representatives_employee_id_fkey(full_name)")
        .order("full_name");

      const list = (reps as any[]) || [];
      const whIds = Array.from(new Set(list.map((r) => r.default_warehouse_id).filter(Boolean)));
      const cbIds = Array.from(new Set(list.map((r) => r.cash_box_id).filter(Boolean)));
      const repIds = list.map((r) => r.id);

      const today = new Date().toISOString().slice(0, 10);

      const [whRes, cbRes, daysRes, invRes, expRes] = await Promise.all([
        whIds.length
          ? (supabase as any).from("warehouses").select("id, name").in("id", whIds)
          : Promise.resolve({ data: [] }),
        cbIds.length
          ? (supabase as any).from("cash_boxes").select("id, name").in("id", cbIds)
          : Promise.resolve({ data: [] }),
        repIds.length
          ? (supabase as any)
              .from("van_sales_days")
              .select("id, sales_rep_id, status, total_invoices, total_sales, total_collections, day_date")
              .in("sales_rep_id", repIds)
              .eq("day_date", today)
          : Promise.resolve({ data: [] }),
        repIds.length
          ? (supabase as any)
              .from("invoices")
              .select("id, salesperson_id, payment_method, total_amount, status, is_voided, invoice_date")
              .eq("source", "rep")
              .eq("invoice_date", today)
              .eq("is_voided", false)
              .not("status", "in", "(cancelled,void,reversed)")
              .in("salesperson_id", repIds)
          : Promise.resolve({ data: [] }),
        repIds.length
          ? (supabase as any)
              .from("transactions")
              .select("amount, notes")
              .eq("payment_method", "rep_expense")
              .eq("is_deleted", false)
              .eq("transaction_date", today)
          : Promise.resolve({ data: [] }),
      ]);

      const whMap = new Map<string, string>((whRes.data || []).map((w: any) => [w.id, w.name]));
      const cbMap = new Map<string, string>((cbRes.data || []).map((c: any) => [c.id, c.name]));
      const dayMap = new Map<string, any>((daysRes.data || []).map((d: any) => [d.sales_rep_id, d]));

      // مصاريف المندوبين اليوم — group by rep_id من notes JSON
      const expMap = new Map<string, number>();
      for (const t of (expRes.data as any[]) || []) {
        try {
          const n = JSON.parse(t.notes || "{}");
          if (n?.rep_id && repIds.includes(n.rep_id)) {
            expMap.set(n.rep_id, (expMap.get(n.rep_id) || 0) + Number(t.amount || 0));
          }
        } catch {}
      }

      // Aggregate KPIs straight from invoices (source='rep') — single source of truth.
      const kpiMap = new Map<string, { count: number; cash: number; credit: number }>();
      for (const inv of (invRes.data as any[]) || []) {
        const sid = inv.salesperson_id as string | null;
        if (!sid) continue;
        if (inv.is_voided || ["void", "cancelled", "reversed"].includes((inv.status || "").toString().toLowerCase())) continue;
        const amt = Number(inv.total_amount || 0);
        const pm = (inv.payment_method || "").toString().toLowerCase();
        const cur = kpiMap.get(sid) || { count: 0, cash: 0, credit: 0 };
        cur.count += 1;
        if (pm === "cash" || pm === "نقد" || pm === "نقدي") cur.cash += amt;
        else cur.credit += amt;
        kpiMap.set(sid, cur);
      }

      const out: RepRow[] = list.map((r) => {
        const day = dayMap.get(r.id);
        const k = kpiMap.get(r.id) || { count: 0, cash: 0, credit: 0 };
        return {
          id: r.id,
          full_name: r.employee?.full_name || r.full_name,
          is_active: r.is_active,
          warehouse_name: r.default_warehouse_id ? whMap.get(r.default_warehouse_id) || null : null,
          cash_box_name: r.cash_box_id ? cbMap.get(r.cash_box_id) || null : null,
          day_status: day?.status || null,
          day_id: day?.id || null,
          total_invoices: k.count,
          total_cash: k.cash,
          total_credit: k.credit,
          total_expenses: expMap.get(r.id) || 0,
          employee_id: r.employee_id || null,
        };
      });

      setRows(out);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto refetch every 10s
  useEffect(() => {
    const t = setInterval(() => { load(); }, 10000);
    return () => clearInterval(t);
  }, [load]);

  // Realtime: any change to rep invoices or van_sales_days triggers refetch
  useEffect(() => {
    const channel = (supabase as any)
      .channel("rep-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: "source=eq.rep" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "van_sales_days" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: "payment_method=eq.rep_expense" },
        () => load()
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [load]);

  const hasAnyActivity = rows.some(
    (r) => r.day_status === "open" || r.total_invoices > 0 || r.total_cash > 0 || r.total_credit > 0 || r.total_expenses > 0
  );

  const handleForceClose = async (row: RepRow) => {
    if (!row.day_id) return;
    const ok = window.confirm(`إغلاق إجباري ليوم البيع للمندوب "${row.full_name}"؟\nسيُحتسب النقد الفعلي = إجمالي المبيعات النقدية - المصاريف.`);
    if (!ok) return;
    setClosingId(row.id);
    try {
      const actualCash = Number(row.total_cash || 0) - Number(row.total_expenses || 0);
      const { data, error } = await (supabase as any).rpc("close_van_day", {
        p_day_id: row.day_id,
        p_actual_cash: actualCash > 0 ? actualCash : 0,
        p_closing_notes: "إغلاق إجباري من الإدارة",
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "فشل الإغلاق");
      toast({ title: "تم إغلاق اليوم", description: row.full_name });
      load();
    } catch (e: any) {
      toast({ title: "فشل الإغلاق", description: e.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div dir="rtl" className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" /> متابعة المندوبين المباشرة
          </h1>
          <p className="text-sm text-muted-foreground">
            حالة يوم البيع وإجماليات النقد والآجل لكل مندوب
            {lastUpdated && (
              <span className="mx-2">• آخر تحديث: {lastUpdated.toLocaleTimeString("ar-EG")}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button onClick={() => setOpenPromote(true)}>
            <UserPlus className="w-4 h-4 ml-2" /> ترقية موظف إلى مندوب
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا يوجد مندوبون. ابدأ بترقية موظف.</CardContent></Card>
      ) : (
        <>
        {!hasAnyActivity && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              لا يوجد نشاط اليوم — لم يتم فتح يوم بيع أو تسجيل أي طلب حتى الآن.
            </CardContent>
          </Card>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{r.full_name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {!r.is_active && <Badge variant="outline">موقوف</Badge>}
                    {!r.employee_id && <Badge variant="outline" className="border-amber-300 text-amber-700">غير مرتبط بموظف</Badge>}
                    {r.day_status === "open" && <Badge>نشط — يوم مفتوح</Badge>}
                    {r.day_status === "closed" && <Badge variant="secondary">يوم مغلق</Badge>}
                    {!r.day_status && <Badge variant="outline">لم يبدأ اليوم</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <WarehouseIcon className="w-4 h-4" />
                    <span className="truncate">{r.warehouse_name || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wallet className="w-4 h-4" />
                    <span className="truncate">{r.cash_box_name || "—"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">طلبات اليوم</div>
                    <div className="font-bold text-lg">{r.total_invoices}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">إجمالي النقد</div>
                    <div className="font-bold text-lg text-primary">{fmt(r.total_cash)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">إجمالي الآجل</div>
                    <div className="font-bold text-lg text-destructive">{fmt(r.total_credit)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">مصاريف اليوم</div>
                    <div className="font-bold text-lg text-destructive">{fmt(r.total_expenses)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setEditId(r.id)}>
                    <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
                  </Button>
                  {r.day_status === "open" && (
                    <Button variant="destructive" size="sm" onClick={() => handleForceClose(r)} disabled={closingId === r.id}>
                      {closingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Lock className="w-3.5 h-3.5 ml-1" />}
                      إغلاق إجباري
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      )}

      <PromoteEmployeeToRepDialog open={openPromote} onOpenChange={setOpenPromote} onDone={load} />
      <EditSalesRepDialog open={!!editId} onOpenChange={(v) => !v && setEditId(null)} repId={editId} onDone={load} />
    </div>
  );
}

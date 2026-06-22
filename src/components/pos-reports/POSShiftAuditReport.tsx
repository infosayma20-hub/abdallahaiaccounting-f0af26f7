import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Copy, Sun, Moon, AlertTriangle, CheckCircle2, ClipboardList, Store, Info, ChevronDown, ChevronLeft, Eye } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { POSSession } from "@/hooks/usePOSReportsData";

type ShiftKind = "all" | "morning" | "evening";

function classifyShift(openedAt: string): "morning" | "evening" {
  const h = new Date(openedAt).getHours();
  // Morning 09:00–16:59, Evening 17:00–03:59
  if (h >= 9 && h < 17) return "morning";
  return "evening";
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM HH:mm", { locale: ar });
}

function shortId(id: string) {
  return id.slice(0, 8);
}

// Map raw payment method codes/labels to Arabic display.
const PAYMENT_METHOD_AR: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  credit_card: "بطاقة ائتمان",
  debit_card: "بطاقة سحب",
  employee_account: "حساب موظف",
  employee: "حساب موظف",
  account: "ذمم العميل",
  customer_account: "ذمم العميل",
  transfer: "حوالة بنكية",
  cheque: "شيك",
};
function trMethod(m: string) {
  return PAYMENT_METHOD_AR[m?.toLowerCase?.() ?? m] || m;
}

const SYNC_STATUS_AR: Record<string, string> = {
  synced: "مرحّلة",
  pending: "معلّقة",
  quarantined: "في الحجر",
  syncing: "قيد الترحيل",
  failed: "فشل الترحيل",
};
function trSyncStatus(s: string | null | undefined) {
  if (!s) return "—";
  return SYNC_STATUS_AR[s] || s;
}

interface SessionOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  total: number;
  state: string;
  was_offline: boolean | null;
  sync_status: string | null;
  transaction_id: string | null;
  voided?: boolean;
  order_note?: string | null;
  customer_name?: string | null;
  notes?: string | null;
}
interface SessionPayment {
  id: string;
  payment_method: string;
  amount: number;
  order_id?: string;
}

interface Props {
  sessions: POSSession[];
  branchName?: string | null;
}

export default function POSShiftAuditReport({ sessions }: Props) {
  const [shiftKind, setShiftKind] = useState<ShiftKind>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>("");

  // Build unique branch list from sessions
  const branchesInData = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach(s => {
      if (s.branch_id) map.set(s.branch_id, s.branch_name || s.branch_id);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const filtered = useMemo(() => {
    let out = sessions;
    if (branchFilter) out = out.filter(s => s.branch_id === branchFilter);
    if (shiftKind !== "all") out = out.filter(s => classifyShift(s.opened_at) === shiftKind);
    return out;
  }, [sessions, shiftKind, branchFilter]);

  useEffect(() => {
    if (filtered.length > 0 && !filtered.find(s => s.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
    if (filtered.length === 0) setSelectedId(null);
  }, [filtered, selectedId]);

  const selected = filtered.find(s => s.id === selectedId) || null;

  return (
    <section className="border-t border-border pt-4">
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            دراسة وردية — تدقيق محاسبي
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          {branchesInData.length > 0 && (
            <div className="flex items-center gap-1">
              <Store className="w-3 h-3 text-muted-foreground" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">كل الفروع</option>
                {branchesInData.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-1">
          {(
            [
              { k: "all", label: "الكل" },
              { k: "morning", label: "صباحي 9–17", icon: Sun },
              { k: "evening", label: "مسائي 17–3", icon: Moon },
            ] as { k: ShiftKind; label: string; icon?: any }[]
          ).map(b => (
            <button
              key={b.k}
              onClick={() => setShiftKind(b.k)}
              className={cn(
                "px-2.5 py-1 rounded border transition-colors flex items-center gap-1",
                shiftKind === b.k
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {b.icon && <b.icon className="w-3 h-3" />}
              {b.label}
            </button>
          ))}
          </div>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded">
          لا توجد ورديات ضمن هذا الفلتر.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Sessions list */}
          <div className="border border-border rounded">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
              {filtered.length} وردية
            </div>
            <div className="max-h-[640px] overflow-y-auto divide-y divide-border">
              {filtered.map(s => {
                const kind = classifyShift(s.opened_at);
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "w-full text-right px-3 py-2 hover:bg-muted/30 transition-colors",
                      active && "bg-muted/50 border-r-2 border-primary",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-foreground truncate">
                        {s.cashier_name || "غير محدد"}
                      </span>
                      {kind === "morning" ? (
                        <Sun className="w-3 h-3 text-amber-500" />
                      ) : (
                        <Moon className="w-3 h-3 text-indigo-400" />
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-between">
                      <span>{fmtTime(s.opened_at)}</span>
                      <span
                        className={cn(
                          "px-1.5 py-px rounded text-[10px]",
                          s.state === "open"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.state === "open" ? "مفتوحة" : "مغلقة"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div>
            {selected ? <ShiftDetail session={selected} /> : <Skeleton className="h-64" />}
          </div>
        </div>
      )}
    </section>
  );
}

function ShiftDetail({ session }: { session: POSSession }) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SessionOrder[]>([]);
  const [payments, setPayments] = useState<SessionPayment[]>([]);
  const [voidedPayments, setVoidedPayments] = useState<SessionPayment[]>([]);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: ords } = await supabase
        .from("pos_orders")
        .select("id, order_number, created_at, total, state, was_offline, sync_status, transaction_id, order_note, customer_name, notes")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      const rawOrders = (ords || []) as any[];
      const txIds = rawOrders.map(o => o.transaction_id).filter(Boolean) as string[];
      let voidedIds = new Set<string>();
      if (txIds.length) {
        const { data: voided } = await supabase
          .from("transactions")
          .select("id")
          .in("id", txIds)
          .eq("is_deleted", true);
        voidedIds = new Set((voided || []).map((t: any) => t.id));
      }
      const enriched: SessionOrder[] = rawOrders.map(o => ({
        ...o,
        voided: o.transaction_id ? voidedIds.has(o.transaction_id) : false,
      }));

      const orderIds = enriched.map(o => o.id);
      let pays: SessionPayment[] = [];
      let voidPays: SessionPayment[] = [];
      if (orderIds.length) {
        const { data: payRes } = await supabase
          .from("pos_payments")
          .select("id, payment_method, amount, order_id")
          .in("order_id", orderIds);
        const validOrderIds = new Set(enriched.filter(o => !o.voided && o.state === "paid").map(o => o.id));
        const voidedOrderIds = new Set(enriched.filter(o => o.voided).map(o => o.id));
        pays = (payRes || [])
          .filter((p: any) => validOrderIds.has(p.order_id))
          .map((p: any) => ({ id: p.id, payment_method: p.payment_method, amount: Number(p.amount) || 0, order_id: p.order_id }));
        voidPays = (payRes || [])
          .filter((p: any) => voidedOrderIds.has(p.order_id))
          .map((p: any) => ({ id: p.id, payment_method: p.payment_method, amount: Number(p.amount) || 0, order_id: p.order_id }));
      }
      if (!cancelled) {
        setOrders(enriched);
        setPayments(pays);
        setVoidedPayments(voidPays);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [session.id]);

  const totals = useMemo(() => {
    const paid = orders.filter(o => o.state === "paid" && !o.voided);
    const cancelled = orders.filter(o => o.state === "cancelled");
    const voided = orders.filter(o => o.voided);
    const offlineSynced = orders.filter(o => o.was_offline && o.sync_status === "synced");
    const pending = orders.filter(o => o.sync_status && !["synced", null].includes(o.sync_status));
    const netSales = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const byMethod: Record<string, { count: number; amount: number; rows: { orderId: string; orderNumber: string | null; amount: number; note: string | null }[] }> = {};
    const orderById = new Map(orders.map(o => [o.id, o]));
    payments.forEach(p => {
      const k = p.payment_method || "نقدي";
      if (!byMethod[k]) byMethod[k] = { count: 0, amount: 0, rows: [] };
      byMethod[k].count++;
      byMethod[k].amount += p.amount;
      const ord = p.order_id ? orderById.get(p.order_id) : undefined;
      byMethod[k].rows.push({
        orderId: p.order_id || "",
        orderNumber: ord?.order_number || null,
        amount: p.amount,
        note: ord?.order_note || ord?.customer_name || null,
      });
    });
    // Re-derive expected cash from real (non-voided) cash payments only.
    const cashKey = (m: string) => ["cash", "نقدي"].includes((m || "").toLowerCase());
    const realCash = payments.filter(p => cashKey(p.payment_method)).reduce((s, p) => s + p.amount, 0);
    const voidedCash = voidedPayments.filter(p => cashKey(p.payment_method)).reduce((s, p) => s + p.amount, 0);
    const recalcExpected = (session.opening_cash ?? 0) + realCash;
    const recalcVariance = session.closing_cash != null ? session.closing_cash - recalcExpected : null;
    return {
      paid, cancelled, voided, offlineSynced, pending, netSales, byMethod,
      recalcExpected, recalcVariance, voidedCash, realCash,
    };
  }, [orders, payments, voidedPayments, session.opening_cash, session.closing_cash]);

  const kind = classifyShift(session.opened_at);
  const durationMin = session.closed_at
    ? Math.round((new Date(session.closed_at).getTime() - new Date(session.opened_at).getTime()) / 60000)
    : Math.round((Date.now() - new Date(session.opened_at).getTime()) / 60000);
  const durationLabel = `${Math.floor(durationMin / 60)}س ${durationMin % 60}د`;

  const copyId = () => {
    navigator.clipboard.writeText(session.id);
    toast.success("تم نسخ Session ID");
  };

  const varianceLabel = session.cash_variance ?? null;
  const varianceColor =
    varianceLabel == null
      ? "text-muted-foreground"
      : Math.abs(varianceLabel) < 0.5
        ? "text-emerald-600"
        : varianceLabel < 0
          ? "text-destructive"
          : "text-amber-600";

  return (
    <div className="space-y-4">
      {/* Section A: Summary */}
      <div className="border border-border rounded">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
          ملخص الوردية
        </div>
        <div className="divide-y divide-border text-[13px]">
          <Row label="رقم الوردية">
            <div className="flex items-center gap-1.5">
              <code className="font-mono text-[12px]">{shortId(session.id)}…</code>
              <button onClick={copyId} className="text-muted-foreground hover:text-foreground">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </Row>
          <Row label="الكاشير">{session.cashier_name || "—"}</Row>
          <Row label="الفرع">{session.branch_name || "—"}</Row>
          <Row label="نوع الوردية">
            <Badge variant="outline" className="font-normal">
              {kind === "morning" ? "صباحي" : "مسائي"}
            </Badge>
          </Row>
          <Row label="فُتحت">{fmtTime(session.opened_at)}</Row>
          <Row label="أُغلقت">{session.closed_at ? fmtTime(session.closed_at) : "لسا مفتوحة"}</Row>
          <Row label="المدة">{durationLabel}</Row>
          <Row label="كاش افتتاحي">
            <span className="font-mono">₪{(session.opening_cash ?? 0).toLocaleString()}</span>
          </Row>
        </div>
      </div>

      {/* Section B: Server truth */}
      <div className="border border-border rounded">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border flex items-center justify-between">
          <span>الفواتير على السيرفر (الحقيقة الكاملة)</span>
          <span className="font-mono text-foreground/70">{orders.length} سجل</span>
        </div>
        {loading ? (
          <div className="p-3"><Skeleton className="h-32" /></div>
        ) : (
          <>
            <div className="px-3 py-3 text-[12px] space-y-1 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">{totals.paid.length}</span>
                <span className="text-muted-foreground">فاتورة مدفوعة</span>
                <span className="text-muted-foreground">+</span>
                <span className="text-foreground font-medium">{totals.cancelled.length}</span>
                <span className="text-muted-foreground">ملغية</span>
                {totals.voided.length > 0 && (
                  <>
                    <span className="text-muted-foreground">+</span>
                    <span className="text-destructive font-medium">{totals.voided.length}</span>
                    <span className="text-muted-foreground">محذوفة محاسبياً</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{totals.offlineSynced.length}</span>
                <span>فاتورة offline ترحّلت بنجاح</span>
                {totals.pending.length > 0 && (
                  <>
                    <span>·</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>{totals.pending.length} معلقة</span>
                  </>
                )}
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="text-right px-3 py-2 font-medium">رقم</th>
                    <th className="text-right px-3 py-2 font-medium">الوقت</th>
                    <th className="text-left px-3 py-2 font-medium">المبلغ</th>
                    <th className="text-center px-3 py-2 font-medium">أوفلاين</th>
                    <th className="text-center px-3 py-2 font-medium">الحالة</th>
                    <th className="text-center px-3 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-mono">{o.order_number || shortId(o.id)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {format(new Date(o.created_at), "HH:mm")}
                      </td>
                      <td className="px-3 py-1.5 text-left font-mono tabular-nums">
                        ₪{Number(o.total).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {o.was_offline ? (
                          <span className="text-[10px] text-amber-600">✓</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {o.voided ? (
                          <Badge variant="destructive" className="text-[10px] font-normal">
                            محذوفة
                          </Badge>
                        ) : o.state === "cancelled" ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            ملغية
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-emerald-600">{trSyncStatus(o.sync_status) || "مدفوعة"}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => setOpenOrderId(o.id)}
                          title="عرض تفاصيل الفاتورة"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Section C: Actual numbers */}
      <div className="border border-border rounded">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
          الأرقام الفعلية (بعد استبعاد المحذوفات)
        </div>
        <div className="divide-y divide-border text-[13px]">
          <Row label="صافي المبيعات">
            <span className="font-mono font-semibold text-foreground">
              ₪{totals.netSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </Row>
          {Object.entries(totals.byMethod).map(([m, v]) => (
            <ExpandableMethodRow
              key={m}
              method={m}
              count={v.count}
              amount={v.amount}
              rows={v.rows}
              onOpenOrder={(id) => setOpenOrderId(id)}
            />
          ))}
          <Row label={`ملغي (${totals.cancelled.length} فاتورة)`}>
            <span className="font-mono text-muted-foreground">
              ₪{totals.cancelled.reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()}
            </span>
          </Row>
          <Row label="كاش متوقع (مجمّد عند الإغلاق)">
            <span className="font-mono text-muted-foreground line-through">
              {session.expected_cash != null ? `₪${session.expected_cash.toLocaleString()}` : "—"}
            </span>
          </Row>
          <Row label="كاش متوقع (محسوب الآن)">
            <span className="font-mono font-semibold text-foreground">
              ₪{totals.recalcExpected.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </Row>
          <Row label="كاش فعلي عند الإغلاق">
            <span className="font-mono">
              {session.closing_cash != null ? `₪${session.closing_cash.toLocaleString()}` : "لم تُغلق"}
            </span>
          </Row>
          <Row label="فرق الكاش (مجمّد)">
            <span className={cn("font-mono", varianceColor)}>
              {varianceLabel != null ? `${varianceLabel >= 0 ? "+" : ""}₪${varianceLabel.toLocaleString()}` : "—"}
            </span>
          </Row>
          <Row label="فرق الكاش الفعلي (بعد الاستبعاد)">
            <span className={cn(
              "font-mono font-semibold",
              totals.recalcVariance == null ? "text-muted-foreground"
                : Math.abs(totals.recalcVariance) < 0.5 ? "text-emerald-600"
                : totals.recalcVariance < 0 ? "text-destructive" : "text-amber-600",
            )}>
              {totals.recalcVariance != null
                ? `${totals.recalcVariance >= 0 ? "+" : ""}₪${totals.recalcVariance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : "—"}
            </span>
          </Row>
        </div>
      </div>

      {/* Order details dialog */}
      <OrderDetailsDialog
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
        order={openOrderId ? orders.find(o => o.id === openOrderId) || null : null}
      />
    </div>
  );
}

// ── Expandable row for payment methods (shows employees / invoices) ──
function ExpandableMethodRow({
  method, count, amount, rows, onOpenOrder,
}: {
  method: string;
  count: number;
  amount: number;
  rows: { orderId: string; orderNumber: string | null; amount: number; note: string | null }[];
  onOpenOrder: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isEmployee = method === "employee_account" || method === "employee";
  return (
    <div className="divide-y divide-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors text-right"
      >
        <span className="text-muted-foreground text-[12px] flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          {trMethod(method)} ({count} دفعة)
        </span>
        <span className="font-mono text-foreground">
          ₪{amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </button>
      {open && (
        <div className="bg-muted/10 px-3 py-2">
          <table className="w-full text-[11.5px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-right py-1 font-medium w-32">رقم الفاتورة</th>
                <th className="text-right py-1 font-medium">{isEmployee ? "اسم الموظف" : "ملاحظة"}</th>
                <th className="text-left py-1 font-medium w-24">المبلغ</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="py-1 font-mono">{r.orderNumber || shortId(r.orderId)}</td>
                  <td className="py-1 text-foreground">
                    {r.note || <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="py-1 text-left font-mono tabular-nums">
                    ₪{r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1 text-center">
                    <button
                      onClick={() => onOpenOrder(r.orderId)}
                      className="text-muted-foreground hover:text-foreground"
                      title="فتح الفاتورة"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Order details dialog (items + notes) ──
function OrderDetailsDialog({
  orderId, order, onClose,
}: {
  orderId: string | null;
  order: SessionOrder | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    supabase
      .from("pos_order_lines")
      .select("id, product_name, qty, unit, unit_price, discount_amount, tax_amount, total, notes")
      .eq("order_id", orderId)
      .then(({ data }) => {
        setLines(data || []);
        setLoading(false);
      });
  }, [orderId]);

  if (!orderId) return null;
  const linesTotal = lines.reduce((s, l) => s + Number(l.total || 0), 0);

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-right">
            تفاصيل الفاتورة {order?.order_number || ""}
          </DialogTitle>
          <DialogDescription className="text-right">
            {order && (
              <span className="flex flex-wrap gap-3 text-[11px]">
                <span>الوقت: {format(new Date(order.created_at), "dd/MM HH:mm")}</span>
                <span>الإجمالي: ₪{Number(order.total).toLocaleString()}</span>
                <span>الحالة: {order.voided ? "محذوفة" : order.state === "cancelled" ? "ملغية" : "مدفوعة"}</span>
                {order.was_offline && <span className="text-amber-600">أوفلاين</span>}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {order?.order_note && (
          <div className="bg-muted/30 border border-border rounded p-2.5 text-[12px]">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">ملاحظة الفاتورة</span>
            <p className="text-foreground mt-0.5">{order.order_note}</p>
          </div>
        )}
        {order?.customer_name && (
          <div className="text-[12px]">
            <span className="text-muted-foreground">الزبون: </span>
            <span className="text-foreground">{order.customer_name}</span>
          </div>
        )}

        <div className="border border-border rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-muted/30 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            الأصناف ({lines.length})
          </div>
          {loading ? (
            <div className="p-3"><Skeleton className="h-24" /></div>
          ) : lines.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-[12px]">لا توجد أصناف</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-right px-2.5 py-1.5 font-medium">الصنف</th>
                  <th className="text-center px-2 py-1.5 font-medium w-16">الكمية</th>
                  <th className="text-left px-2 py-1.5 font-medium w-20">السعر</th>
                  <th className="text-left px-2 py-1.5 font-medium w-20">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-2.5 py-1.5">
                      <div>{l.product_name}</div>
                      {l.notes && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">📝 {l.notes}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{l.qty}</td>
                    <td className="px-2 py-1.5 text-left font-mono">₪{Number(l.unit_price).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-left font-mono font-medium">
                      ₪{Number(l.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={3} className="px-2.5 py-1.5 text-right">المجموع</td>
                  <td className="px-2 py-1.5 text-left font-mono">₪{linesTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-foreground text-[12.5px] font-medium">{label}</span>
      <span className="text-foreground font-semibold">{children}</span>
    </div>
  );
}
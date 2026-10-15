import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowLeftRight } from "lucide-react";
import ReturnDialog from "@/components/pos/ReturnDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validateSplit, type SplitLine } from "@/lib/pos/shiftCorrections";

export type ShiftCorrectionAccess = {
  enabled: boolean;
  locked_reason?: string | null;
  change_payment?: boolean;
  split_payment?: boolean;
  void_order?: boolean;
  cancel_cash_out?: boolean;
  discount_order?: boolean;
  return_order?: boolean;
  transfer_cash?: boolean;
};

/** Server-side access summary for accountant shift corrections (gate is enforced again in every RPC). */
export function useShiftCorrectionAccess(sessionId: string, reloadKey = 0) {
  const [access, setAccess] = useState<ShiftCorrectionAccess>({ enabled: false });
  useEffect(() => {
    let c = false;
    supabase.rpc("pos_shift_correction_access" as any, { p_session_id: sessionId }).then(({ data }) => {
      if (!c) setAccess(((data as any) || { enabled: false }) as ShiftCorrectionAccess);
    });
    return () => { c = true; };
  }, [sessionId, reloadKey]);
  return access;
}

export const canAct = (a: ShiftCorrectionAccess, k: keyof ShiftCorrectionAccess) =>
  a.enabled && !a.locked_reason && a[k] === true;

type PayOption = { value: string; label: string; method: "cash" | "card" | "credit"; gl?: string | null };

function usePayOptions(ownerId: string | null) {
  const [opts, setOpts] = useState<PayOption[]>([]);
  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const [{ data: apps }, { data: cs }] = await Promise.all([
        supabase.from("delivery_apps" as any).select("name, visa_gl_account_code, is_active").eq("user_id", ownerId).eq("is_active", true).order("display_order"),
        supabase.from("company_settings").select("card_bank_account_id").eq("user_id", ownerId).maybeSingle(),
      ]);
      let bankLabel = "فيزا (البنك المعرّف)";
      let bankGl: string | null = null;
      const bankId = (cs as any)?.card_bank_account_id;
      if (bankId) {
        const { data: b } = await supabase.from("bank_accounts").select("account_name, gl_account_code").eq("id", bankId).maybeSingle();
        if ((b as any)?.gl_account_code) { bankGl = (b as any).gl_account_code; bankLabel = `فيزا — ${(b as any).account_name || "البنك"} (${bankGl})`; }
      }
      const list: PayOption[] = [
        { value: "cash", label: "كاش", method: "cash" },
        { value: `card:${bankGl || ""}`, label: bankLabel, method: "card", gl: bankGl },
        ...(((apps as any[]) || []).filter(a => a.visa_gl_account_code).map(a => ({
          value: `card:${a.visa_gl_account_code}`, label: `فيزا ${a.name} (${a.visa_gl_account_code})`, method: "card" as const, gl: a.visa_gl_account_code,
        }))),
        { value: "credit", label: "ذمة (آجل)", method: "credit" },
      ];
      setOpts(list);
    })();
  }, [ownerId]);
  return opts;
}

/** Accountant actions inside the invoice dialog of the shift study. */
export function OrderCorrectionPanel({
  order, access, ownerId, onDone,
}: {
  order: { id: string; total: number; state: string; is_return?: boolean; voided?: boolean; order_number?: string | null; session_id?: string };
  access: ShiftCorrectionAccess;
  ownerId: string | null;
  onDone: () => void;
}) {
  const [owner, setOwner] = useState<string | null>(ownerId);
  const [sessionOf, setSessionOf] = useState<string | null>(order.session_id ?? null);
  useEffect(() => {
    supabase.from("pos_orders").select("user_id, session_id").eq("id", order.id).maybeSingle()
      .then(({ data }) => { setOwner(ownerId || (data as any)?.user_id || null); setSessionOf((data as any)?.session_id ?? null); });
  }, [ownerId, order.id]);
  const opts = usePayOptions(owner);
  const [payments, setPayments] = useState<any[]>([]);
  const [mode, setMode] = useState<"none" | "change" | "split" | "void" | "discount">("none");
  const [discStr, setDiscStr] = useState("");
  const [discPct, setDiscPct] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [lines, setLines] = useState<SplitLine[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("pos_payments").select("id, payment_method, amount, card_reference, is_refund").eq("order_id", order.id)
      .then(({ data }) => setPayments((data as any[]) || []));
  }, [order.id]);

  if (!access.enabled) return null;
  const active = order.state === "paid" && !order.voided && !order.is_return;
  const glLabel = (gl?: string | null) => opts.find(o => o.gl && o.gl === gl)?.label;
  const describe = (p: any) => {
    if (p.payment_method === "card") return glLabel(p.card_reference) || (p.card_reference ? `فيزا (${p.card_reference})` : "فيزا");
    return opts.find(o => o.value === p.payment_method)?.label || p.payment_method;
  };

  const optOf = (v: string) => opts.find(o => o.value === v);
  const reset = () => { setMode("none"); setReason(""); setTarget(""); setLines([]); setDiscStr(""); setDiscPct(false); };
  const discAmount = (() => { const n = Number(discStr) || 0; return Math.round((discPct ? Number(order.total) * n / 100 : n) * 100) / 100; })();

  const run = async () => {
    const r = reason.trim();
    if (r.length < 3) { toast.error("اكتب السبب (إلزامي)"); return; }
    setBusy(true);
    let error: any = null;
    if (mode === "change") {
      const o = optOf(target);
      if (!o) { setBusy(false); toast.error("اختر نوع الدفع الجديد"); return; }
      ({ error } = await supabase.rpc("pos_shift_correct_payment_v1" as any, {
        p_order_id: order.id, p_new_method: o.method, p_visa_gl_account_code: o.gl || null, p_split_payments: null, p_reason: r,
      }));
    } else if (mode === "split") {
      const err = validateSplit(lines, Number(order.total));
      if (err) { setBusy(false); toast.error(err); return; }
      const split = lines.map(l => {
        const o = optOf(l.option)!;
        return { method: o.method, amount: Number(l.amount), ...(o.gl ? { visa_gl_account_code: o.gl } : {}) };
      });
      ({ error } = await supabase.rpc("pos_shift_correct_payment_v1" as any, {
        p_order_id: order.id, p_new_method: "mixed", p_visa_gl_account_code: null, p_split_payments: split, p_reason: r,
      }));
    } else if (mode === "discount") {
      if (discAmount <= 0 || discAmount >= Number(order.total)) { setBusy(false); toast.error("قيمة الخصم غير صحيحة"); return; }
      ({ error } = await supabase.rpc("pos_shift_discount_order_v1" as any, { p_order_id: order.id, p_discount: discAmount, p_reason: r }));
    } else if (mode === "void") {
      ({ error } = await supabase.rpc("pos_shift_void_order_v1" as any, { p_order_id: order.id, p_reason: r }));
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === "void" ? "تم إلغاء الفاتورة بقيد عكسي وإرجاع المخزون" : mode === "discount" ? `تم تسجيل خصم ₪${discAmount} بقيد خصم مسموح، ونقص الكاش المتوقع` : "تم تصحيح الدفع وإعادة قيد الفاتورة");
    reset();
    onDone();
  };

  return (
    <div className="border border-primary/30 rounded p-2.5 space-y-2 text-[12px]">
      <div className="font-semibold text-primary">إجراءات المحاسب</div>
      <div className="space-y-0.5">
        <span className="text-muted-foreground text-[11px]">الدفعات الحالية:</span>
        {payments.filter(p => !p.is_refund).map(p => (
          <div key={p.id} className="flex justify-between"><span>{describe(p)}</span><span className="font-mono">₪{Number(p.amount).toLocaleString()}</span></div>
        ))}
        {payments.length === 0 && <div className="text-muted-foreground">لا توجد دفعات</div>}
      </div>

      {access.locked_reason ? (
        <div className="text-muted-foreground">{access.locked_reason}</div>
      ) : !active ? (
        <div className="text-muted-foreground">هذه الفاتورة غير قابلة للتعديل (ملغاة أو مرتجع)</div>
      ) : mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          {access.change_payment && <Button size="sm" variant="outline" onClick={() => setMode("change")}>تغيير نوع الدفع</Button>}
          {access.split_payment && <Button size="sm" variant="outline" onClick={() => { setMode("split"); setLines([{ option: "cash", amount: "" }, { option: opts[1]?.value || "", amount: "" }]); }}>تعديل المبلغ وتقسيمه</Button>}
          {access.discount_order && <Button size="sm" variant="outline" onClick={() => setMode("discount")}>خصم</Button>}
          {access.return_order && <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}>إرجاع</Button>}
          {access.void_order && <Button size="sm" variant="destructive" onClick={() => setMode("void")}>إلغاء الفاتورة</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {mode === "change" && (
            <select dir="rtl" className="w-full h-8 rounded border border-input bg-background px-2" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">— اختر نوع الدفع الجديد —</option>
              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {mode === "split" && (
            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <select dir="rtl" className="flex-1 h-8 rounded border border-input bg-background px-2" value={l.option}
                    onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, option: e.target.value } : x))}>
                    {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <Input className="w-24 h-8 font-mono" dir="ltr" inputMode="decimal" value={l.amount}
                    onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  {lines.length > 2 && <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="p-1 text-muted-foreground" title="حذف السطر"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
              <div className="flex justify-between items-center">
                <button onClick={() => setLines(ls => [...ls, { option: "cash", amount: "" }])} className="text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> سطر</button>
                <span className="text-muted-foreground">المجموع ₪{lines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toLocaleString()} من ₪{Number(order.total).toLocaleString()}</span>
              </div>
            </div>
          )}
          {mode === "discount" && (
            <div className="space-y-1.5">
              <div className="flex gap-1.5 items-center">
                <Input className="w-28 h-8 font-mono" dir="ltr" inputMode="decimal" placeholder="0" value={discStr} onChange={e => setDiscStr(e.target.value)} />
                <Button size="sm" type="button" variant={discPct ? "outline" : "default"} onClick={() => setDiscPct(false)}>₪ مبلغ</Button>
                <Button size="sm" type="button" variant={discPct ? "default" : "outline"} onClick={() => setDiscPct(true)}>% نسبة</Button>
              </div>
              <div className="text-muted-foreground">الخصم ₪{discAmount.toLocaleString()} — الفاتورة بتصير ₪{Math.max(Number(order.total) - discAmount, 0).toLocaleString()}. بيتسجل قيد خصم مسموح مقابل حساب الدفع، وبينقص الكاش المتوقع.</div>
            </div>
          )}
          {mode === "void" && <div className="text-destructive">رح ينعكس قيد الفاتورة ويرجع المخزون، والفاتورة بتضل محفوظة كملغاة.</div>}
          <Textarea dir="rtl" rows={2} placeholder="السبب (إلزامي)" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} variant={mode === "void" ? "destructive" : "default"} onClick={run}>{busy ? "جاري التنفيذ..." : "تأكيد"}</Button>
            <Button size="sm" variant="ghost" onClick={reset}>تراجع</Button>
          </div>
        </div>
      )}
      {returnOpen && owner && sessionOf && (
        <ReturnDialog
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          originalOrderId={order.id}
          originalOrderNumber={order.order_number ?? null}
          originalTotal={Number(order.total)}
          originalCurrency="ILS"
          sessionId={sessionOf}
          dataOwnerId={owner}
          exchangeRates={{}}
          shiftCorrection
          onSuccess={onDone}
        />
      )}
    </div>
  );
}

/** Move shift cash to another cash box (audited, linked to the shift). */
export function ShiftCashTransferButton({ sessionId, ownerId, fromBoxId, defaultAmount, onDone }: {
  sessionId: string; ownerId: string; fromBoxId: string; defaultAmount: number; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [boxes, setBoxes] = useState<{ id: string; name: string }[]>([]);
  const [box, setBox] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    supabase.from("cash_boxes" as any).select("id, name").eq("user_id", ownerId).neq("id", fromBoxId).order("name")
      .then(({ data }) => setBoxes(((data as any[]) || [])));
  }, [open, ownerId, fromBoxId]);
  const submit = async () => {
    const a = Number(amount);
    if (!box) { toast.error("اختر الصندوق"); return; }
    if (!(a > 0)) { toast.error("المبلغ غير صحيح"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("pos_shift_transfer_cash_v1" as any, { p_session_id: sessionId, p_to_box_id: box, p_amount: a, p_reason: reason.trim() || null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم ترحيل الكاش للصندوق، ويظهر ضمن الوردية بكشف الصندوق");
    setOpen(false); onDone();
  };
  return (
    <>
      <button type="button" title="ترحيل الكاش إلى صندوق"
        onClick={(e) => { e.stopPropagation(); setAmount(String(Math.round(defaultAmount * 100) / 100)); setReason(""); setBox(""); setOpen(true); }}
        className="mr-2 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-muted">
        <ArrowLeftRight className="w-3.5 h-3.5" /> ترحيل لصندوق
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>ترحيل كاش الوردية إلى صندوق</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[12px]">
            <select dir="rtl" className="w-full h-9 rounded border border-input bg-background px-2" value={box} onChange={e => setBox(e.target.value)}>
              <option value="">— اختر الصندوق —</option>
              {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <Input dir="ltr" inputMode="decimal" className="font-mono" value={amount} onChange={e => setAmount(e.target.value)} />
            <Textarea dir="rtl" rows={2} placeholder="ملاحظة (اختياري)" value={reason} onChange={e => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={submit}>{busy ? "جاري الترحيل..." : "ترحيل"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  payment_method_change: "تغيير/تقسيم الدفع",
  order_void: "إلغاء فاتورة",
  order_discount: "خصم على فاتورة",
  order_return: "إرجاع",
  cash_transfer: "ترحيل كاش لصندوق",
  purchase_cancel: "إلغاء مشتريات",
  purchase_edit: "تعديل مشتريات",
  expense_cancel: "إلغاء مصروف",
};

/** Before/after log of corrections made on this shift. */
export function ShiftCorrectionsLog({ sessionId, reloadKey }: { sessionId: string; reloadKey: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("pos_shift_post_close_edits" as any)
        .select("id, action, before_data, after_data, reason, performed_by_auth_user_id, performed_at, created_at")
        .eq("session_id", sessionId).order("created_at", { ascending: false });
      const list = (data as any[]) || [];
      setRows(list);
      const ids = Array.from(new Set(list.map(r => r.performed_by_auth_user_id).filter(Boolean)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const m: Record<string, string> = {};
        ((ps as any[]) || []).forEach(p => { if (p.full_name) m[p.id] = p.full_name; });
        setNames(m);
      }
    })();
  }, [sessionId, reloadKey]);
  if (!rows.length) return null;
  const summary = (r: any) => {
    const b = r.before_data || {}, a = r.after_data || {};
    if (r.action === "payment_method_change") return `${b.methods || "—"} ₪${b.amount ?? ""} ← ${a.method === "mixed" ? "مقسّم" : a.method}`;
    if (r.action === "order_void") return `₪${b.total ?? ""} — ملغاة`;
    if (r.action === "purchase_edit") return `₪${b.total_amount ?? ""} ← ₪${a.total_amount ?? ""}${a.debit_account_code && a.debit_account_code !== b.debit_account_code ? ` (حساب ${b.debit_account_code} ← ${a.debit_account_code})` : ""}`;
    return `₪${b.total_amount ?? b.amount ?? ""}`;
  };
  return (
    <div className="border border-border rounded">
      <div className="px-3 py-1.5 bg-muted/30 border-b border-border text-[11px] font-semibold">سجل تصحيحات الوردية ({rows.length})</div>
      <div className="divide-y divide-border text-[11.5px]">
        {rows.map(r => (
          <div key={r.id} className="px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="font-mono text-muted-foreground">{format(new Date(r.performed_at || r.created_at), "dd/MM HH:mm")}</span>
            <span className="font-medium">{ACTION_LABEL[r.action] || r.action}</span>
            <span className="font-mono">{summary(r)}</span>
            <span className="text-muted-foreground">بواسطة: {names[r.performed_by_auth_user_id] || "—"}</span>
            {r.reason && <span>السبب: {r.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

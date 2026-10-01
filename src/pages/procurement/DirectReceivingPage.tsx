import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Plus, RefreshCw, Send, Trash2, Camera, ScanLine, Paperclip, ClipboardList, PackagePlus } from "lucide-react";
import POSBarcodeScanner from "@/components/pos/POSBarcodeScanner";
import { useAuth } from "@/hooks/useAuth";
import { DShell, PaneBtn, beep } from "./ReceivingPage";

/**
 * استلام مباشر بدون طلبية مسبقة — مساحة موظف المستودع.
 * كل الكتابة عبر دوال direct_receiving_* المحمية؛ الموظف يرى فقط استلاماته هو.
 */

type Ctx = { employee_name: string; suppliers: { id: string; name: string }[]; branches: { id: string; name: string }[] };
type Line = { id: string; item_name: string; unit: string; quantity: number; unit_price: number; total_price: number; notes: string | null; is_temp: boolean; barcode: string | null };
type Order = {
  id: string; order_number: string; status: string; review_status: string | null; reject_reason: string | null;
  supplier_id: string | null; supplier_name: string | null; branch_id: string | null; branch_name: string | null;
  supplier_invoice_no: string | null; notes: string | null; attachment_path: string | null; total: number; lines: Line[];
};

const REVIEW_LABEL: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "قيد الاستلام", cls: "bg-muted text-foreground" },
  pending_review: { label: "بانتظار تدقيق المحاسب", cls: "bg-primary/10 text-primary" },
  approved: { label: "معتمد ومفوتر", cls: "bg-primary/15 text-primary" },
  rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive" },
  discarded: { label: "ملغى", cls: "bg-muted text-muted-foreground" },
};
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

/* طابور المسحات أثناء انقطاع الشبكة */
const QKEY = (id: string) => `direct-receiving:queue:${id}`;
const readQ = (id: string): string[] => { try { return JSON.parse(localStorage.getItem(QKEY(id)) || "[]"); } catch { return []; } };
const writeQ = (id: string, q: string[]) => localStorage.setItem(QKEY(id), JSON.stringify(q));
const isNetworkError = (e: any) => !navigator.onLine || /fetch|network|Failed to fetch/i.test(String(e?.message || e));

async function uploadPhoto(uid: string, orderId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${uid}/${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("direct-receiving").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}

/* ───────── قائمة استلاماتي ───────── */
function MyList({ ctx }: { ctx: Ctx }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ supplier: "", branch: ctx.branches.length === 1 ? ctx.branches[0].id : "", invoice: "" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("direct_receiving_my_orders" as any);
    if (error) toast.error(error.message);
    setRows((data as any[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.supplier) { toast.error("اختر المورد"); return; }
    if (!form.branch) { toast.error("اختر الفرع"); return; }
    setCreating(true);
    const { data, error } = await supabase.rpc("direct_receiving_start" as any, {
      p_supplier_id: form.supplier, p_branch_id: form.branch, p_supplier_invoice_no: form.invoice || null, p_notes: null,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    navigate(`/worker/direct-receiving/${data}`);
  };

  return (
    <DShell title="استلام مباشر" crumb="استلاماتي"
      actions={<>
        <PaneBtn icon={ArrowRight} label="رجوع" onClick={() => navigate("/worker/receiving")} />
        <PaneBtn icon={Plus} label="استلام جديد" primary onClick={() => setNewOpen(true)} />
        <PaneBtn icon={RefreshCw} label="تحديث" onClick={load} />
      </>}>
      <main className="mx-auto w-full max-w-[1100px] p-3 sm:p-5">
        {loading ? <div className="p-10 text-center text-muted-foreground">جارِ التحميل…</div> : rows.length === 0 ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center border border-dashed bg-card px-5 py-12 text-center">
            <ClipboardList className="mb-4 h-12 w-12 text-primary" />
            <h2 className="text-lg font-bold text-foreground">ما في استلامات مباشرة بعد</h2>
            <p className="mt-2 text-sm text-muted-foreground">لما توصل بضاعة بدون طلبية، اضغط «استلام جديد» وامسح الأصناف.</p>
            <Button className="mt-5 gap-2" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" />استلام جديد</Button>
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-md border bg-card">
            {rows.map(r => {
              const st = REVIEW_LABEL[r.review_status] || REVIEW_LABEL.in_progress;
              return (
                <button key={r.id} onClick={() => navigate(`/worker/direct-receiving/${r.id}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-muted/50">
                  <div className="min-w-0">
                    <div className="font-bold text-foreground">{r.supplier_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.order_number} · {r.lines} صنف · {new Date(r.created_at).toLocaleDateString("en-GB")}</div>
                    {r.review_status === "rejected" && r.reject_reason && <div className="mt-1 text-xs text-destructive">سبب الرفض: {r.reject_reason}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="text-sm font-bold text-foreground">{Number(r.total || 0).toFixed(2)} ₪</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>استلام مباشر جديد</DialogTitle><DialogDescription>اختر المورد والفرع، وبعدها امسح الأصناف.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="mb-1 block text-xs font-semibold">المورد *</label>
              <select dir="rtl" className={selectCls} value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}>
                <option value="">اختر المورد…</option>
                {ctx.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className="mb-1 block text-xs font-semibold">الفرع *</label>
              <select dir="rtl" className={selectCls} value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}>
                <option value="">اختر الفرع…</option>
                {ctx.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="mb-1 block text-xs font-semibold">رقم فاتورة المورد (اختياري)</label>
              <Input value={form.invoice} onChange={e => setForm({ ...form, invoice: e.target.value })} maxLength={60} /></div>
          </div>
          <DialogFooter><Button className="w-full" disabled={creating} onClick={create}>{creating ? "جارِ الإنشاء…" : "ابدأ الاستلام"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DShell>
  );
}

/* ───────── سطر بند: كمية + سعر + مجموع ───────── */
function LineRow({ line, editable, onSave }: { line: Line; editable: boolean; onSave: (qty: number, price: number) => Promise<void> }) {
  const [qty, setQty] = useState(String(line.quantity));
  const [price, setPrice] = useState(line.unit_price ? String(line.unit_price) : "");
  const [total, setTotal] = useState<string | null>(null);
  useEffect(() => { setQty(String(line.quantity)); setPrice(line.unit_price ? String(line.unit_price) : ""); }, [line.quantity, line.unit_price]);
  const q = Number(qty) || 0; const p = Number(price) || 0;
  const commit = (nq = q, np = p) => {
    if (nq === line.quantity && Math.round(np * 100) === Math.round(line.unit_price * 100)) return;
    void onSave(nq, np);
  };
  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-foreground">{line.item_name}</div>
          <div className="text-xs text-muted-foreground" dir="ltr">{line.barcode || "بدون باركود"}{line.unit ? ` · ${line.unit}` : ""}</div>
          {line.is_temp && <Badge variant="outline" className="mt-1 border-primary/40 text-[10px] text-primary">بند مؤقت — المحاسب بيربطه</Badge>}
        </div>
        {editable && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="حذف" onClick={() => onSave(0, p)}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-[11px] text-muted-foreground">الكمية
          <Input type="number" inputMode="decimal" min={0} step="any" dir="ltr" disabled={!editable} value={qty}
            onChange={e => setQty(e.target.value)} onBlur={() => commit()} className="h-10 text-center font-bold" /></label>
        <label className="text-[11px] text-muted-foreground">سعر الوحدة
          <Input type="number" inputMode="decimal" min={0} step="any" dir="ltr" disabled={!editable} value={price} placeholder="0"
            onChange={e => setPrice(e.target.value)} onBlur={() => commit()}
            className={`h-10 text-center ${p <= 0 && editable ? "border-destructive" : ""}`} /></label>
        <label className="text-[11px] text-muted-foreground">المجموع
          <Input type="number" inputMode="decimal" min={0} step="any" dir="ltr" disabled={!editable || q <= 0}
            value={total ?? String(Math.round(q * p * 100) / 100)}
            onFocus={e => { setTotal(String(Math.round(q * p * 100) / 100)); e.currentTarget.select(); }}
            onChange={e => { setTotal(e.target.value); const t = Number(e.target.value); if (q > 0 && Number.isFinite(t) && t >= 0) setPrice(String(Math.round((t / q) * 100) / 100)); }}
            onBlur={() => { setTotal(null); commit(q, Number(price) || 0); }}
            className="h-10 text-center font-bold" /></label>
      </div>
    </div>
  );
}

/* ───────── شاشة الاستلام ───────── */
function DirectSession({ orderId, ctx }: { orderId: string; ctx: Ctx }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [code, setCode] = useState("");
  const [camOpen, setCamOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ barcode: string; name: string; unit: string; file: File | null } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [pending, setPending] = useState(readQ(orderId).length);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("direct_receiving_get" as any, { p_order_id: orderId });
    if (error) { toast.error(error.message); navigate("/worker/direct-receiving", { replace: true }); return; }
    setOrder(data as any);
  }, [orderId, navigate]);
  useEffect(() => { load(); }, [load]);

  const editable = order?.status === "draft";

  const scanOnce = useCallback(async (barcode: string): Promise<"ok" | "unknown" | "queued" | "error"> => {
    try {
      const { data, error } = await supabase.rpc("direct_receiving_scan" as any, { p_order_id: orderId, p_barcode: barcode });
      if (error) { if (isNetworkError(error)) throw error; toast.error(error.message); return "error"; }
      const r = data as any;
      if (!r?.matched) return "unknown";
      return "ok";
    } catch (e) {
      if (isNetworkError(e)) { const q = [...readQ(orderId), barcode]; writeQ(orderId, q); setPending(q.length); return "queued"; }
      toast.error(String((e as any)?.message || e)); return "error";
    }
  }, [orderId]);

  const flush = useCallback(async () => {
    const q = readQ(orderId);
    if (!q.length || !navigator.onLine) return;
    let done = 0; let unknown = 0;
    for (const b of q) {
      const { data, error } = await supabase.rpc("direct_receiving_scan" as any, { p_order_id: orderId, p_barcode: b });
      if (error && isNetworkError(error)) break; // نوقف ونحتفظ بالباقي
      if (!error && !(data as any)?.matched) unknown++;
      done++;
    }
    const rest = q.slice(done);
    writeQ(orderId, rest); setPending(rest.length);
    if (unknown) toast.warning(`${unknown} باركود غير معرّف من المسحات المحفوظة — امسحها مرة ثانية لإضافتها كبنود مؤقتة`);
    if (done) load();
  }, [orderId, load]);
  useEffect(() => { flush(); const on = () => flush(); window.addEventListener("online", on); return () => window.removeEventListener("online", on); }, [flush]);

  const handleScan = async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode || !editable) return;
    setCode("");
    const r = await scanOnce(barcode);
    if (r === "ok") { beep(true); load(); }
    else if (r === "queued") { beep(true); toast.message("انحفظت المسحة وبتنبعت لما يرجع الإنترنت"); }
    else if (r === "unknown") { beep(false); setTemp({ barcode, name: "", unit: "قطعة", file: null }); }
    else beep(false);
    inputRef.current?.focus();
  };

  const saveTemp = async () => {
    if (!temp || !user) return;
    if (!temp.name.trim()) { toast.error("اكتب اسم الصنف"); return; }
    setBusy(true);
    try {
      const photo = temp.file ? await uploadPhoto(user.id, orderId, temp.file) : null;
      const { error } = await supabase.rpc("direct_receiving_add_temp" as any, {
        p_order_id: orderId, p_barcode: temp.barcode, p_name: temp.name.trim(), p_unit: temp.unit || "قطعة", p_photo_path: photo,
      });
      if (error) throw error;
      setTemp(null); toast.success("انضاف كبند مؤقت"); load();
    } catch (e: any) { toast.error(e?.message || "تعذر الحفظ"); }
    finally { setBusy(false); inputRef.current?.focus(); }
  };

  const saveLine = async (line: Line, qty: number, price: number) => {
    const { error } = await supabase.rpc("direct_receiving_set_line" as any, { p_line_id: line.id, p_quantity: qty, p_unit_price: price, p_notes: line.notes });
    if (error) toast.error(error.message);
    load();
  };

  const saveHeader = async (patch: Partial<Order>) => {
    if (!order) return;
    const next = { ...order, ...patch };
    const { error } = await supabase.rpc("direct_receiving_update_header" as any, {
      p_order_id: orderId, p_supplier_id: next.supplier_id, p_branch_id: next.branch_id,
      p_supplier_invoice_no: next.supplier_invoice_no, p_notes: next.notes, p_attachment_path: next.attachment_path,
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const attachInvoice = async (file: File | undefined) => {
    if (!file || !user) return;
    setBusy(true);
    try { const path = await uploadPhoto(user.id, orderId, file); await saveHeader({ attachment_path: path }); toast.success("انرفقت صورة الفاتورة"); }
    catch (e: any) { toast.error(e?.message || "تعذر رفع الصورة"); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setConfirmSubmit(false);
    if (readQ(orderId).length) { toast.error("في مسحات لسا ما انبعتت — انتظر رجوع الإنترنت"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("direct_receiving_submit" as any, { p_order_id: orderId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("انبعت الاستلام للمحاسب للتدقيق");
    navigate("/worker/direct-receiving", { replace: true });
  };

  const discard = async () => {
    if (!confirm("إلغاء هذا الاستلام؟")) return;
    const { error } = await supabase.rpc("direct_receiving_discard" as any, { p_order_id: orderId });
    if (error) { toast.error(error.message); return; }
    navigate("/worker/direct-receiving", { replace: true });
  };

  const missingPrice = useMemo(() => (order?.lines || []).filter(l => l.unit_price <= 0).length, [order]);
  if (!order) return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center text-muted-foreground">جارِ التحميل…</div>;
  const st = REVIEW_LABEL[order.review_status || "in_progress"] || REVIEW_LABEL.in_progress;

  return (
    <DShell title={`${order.order_number} — ${order.supplier_name || ""}`} crumb="استلام مباشر"
      onClick={() => editable && !temp && !camOpen && inputRef.current?.focus()}
      actions={<>
        <PaneBtn icon={ArrowRight} label="رجوع" onClick={() => navigate("/worker/direct-receiving")} />
        <PaneBtn icon={RefreshCw} label="تحديث" onClick={load} />
        {editable && <PaneBtn icon={Send} label="إرسال للمحاسب" primary disabled={busy || order.lines.length === 0} onClick={() => setConfirmSubmit(true)} />}
        {editable && <PaneBtn icon={Trash2} label="إلغاء الاستلام" onClick={discard} />}
        <div className="ms-auto flex items-center gap-3 px-2 text-xs text-muted-foreground">
          <span>{order.lines.length} صنف</span>
          <span className="text-base font-bold text-foreground">{Number(order.total || 0).toFixed(2)} ₪</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
        </div>
      </>}>
      <main className="mx-auto w-full max-w-[1100px] space-y-3 p-3 sm:p-5">
        {order.review_status === "rejected" && order.reject_reason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">سبب الرفض: {order.reject_reason}</div>
        )}
        {pending > 0 && <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-primary">{pending} مسحة محفوظة بانتظار الإنترنت</div>}

        <div className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-4">
          <label className="text-xs text-muted-foreground">المورد
            <select dir="rtl" disabled={!editable} className={selectCls} value={order.supplier_id || ""} onChange={e => saveHeader({ supplier_id: e.target.value })}>
              {ctx.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="text-xs text-muted-foreground">الفرع
            <select dir="rtl" disabled={!editable} className={selectCls} value={order.branch_id || ""} onChange={e => saveHeader({ branch_id: e.target.value })}>
              {ctx.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <label className="text-xs text-muted-foreground">رقم فاتورة المورد
            <Input disabled={!editable} defaultValue={order.supplier_invoice_no || ""} maxLength={60}
              onBlur={e => e.target.value !== (order.supplier_invoice_no || "") && saveHeader({ supplier_invoice_no: e.target.value })} className="h-10" /></label>
          <div className="text-xs text-muted-foreground">صورة الفاتورة (اختياري)
            <label className={`mt-0.5 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm ${order.attachment_path ? "border-primary text-primary" : "text-foreground"} ${!editable ? "pointer-events-none opacity-60" : ""}`}>
              <Paperclip className="h-4 w-4" />{order.attachment_path ? "مرفقة ✓ (تغيير)" : "تصوير / إرفاق"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => attachInvoice(e.target.files?.[0])} />
            </label>
          </div>
          <label className="text-xs text-muted-foreground sm:col-span-4">ملاحظات
            <Textarea disabled={!editable} defaultValue={order.notes || ""} rows={1} maxLength={500}
              onBlur={e => e.target.value !== (order.notes || "") && saveHeader({ notes: e.target.value })} /></label>
        </div>

        {editable && (
          <div className="flex items-center gap-2 rounded-md border bg-card p-3">
            <ScanLine className="h-5 w-5 shrink-0 text-muted-foreground" />
            <Input ref={inputRef} autoFocus value={code} onChange={e => setCode(e.target.value)} dir="ltr"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(code); } }}
              placeholder="امسح الباركود…" className="h-11 text-base" />
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="الكاميرا" onClick={() => setCamOpen(true)}><Camera className="h-5 w-5" /></Button>
            <Button variant="outline" className="h-11 shrink-0 gap-1" onClick={() => setTemp({ barcode: "", name: "", unit: "قطعة", file: null })}><PackagePlus className="h-4 w-4" />بدون باركود</Button>
          </div>
        )}

        <div className="overflow-hidden rounded-md border bg-card">
          <div className="border-b bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            الأصناف المستلمة ({order.lines.length}){missingPrice > 0 && editable && <span className="ms-2 text-destructive">— {missingPrice} بدون سعر</span>}
          </div>
          {order.lines.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">امسح أول صنف للبدء</div> : (
            <div className="divide-y">{order.lines.map(l => <LineRow key={l.id} line={l} editable={!!editable} onSave={(q, p) => saveLine(l, q, p)} />)}</div>
          )}
        </div>
      </main>

      <POSBarcodeScanner open={camOpen} onClose={() => setCamOpen(false)} onScan={c => { setCamOpen(false); handleScan(c); }} />

      <Dialog open={!!temp} onOpenChange={o => !o && setTemp(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>صنف غير معرّف</DialogTitle>
            <DialogDescription>{temp?.barcode ? <>الباركود <span dir="ltr" className="font-mono">{temp.barcode}</span> مش موجود. أضفه كبند مؤقت والمحاسب بيربطه.</> : "أضف صنف بدون باركود كبند مؤقت."}</DialogDescription>
          </DialogHeader>
          {temp && (
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-semibold">اسم الصنف *</label>
                <Input autoFocus value={temp.name} maxLength={200} onChange={e => setTemp({ ...temp, name: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs font-semibold">الوحدة</label>
                <Input value={temp.unit} maxLength={30} onChange={e => setTemp({ ...temp, unit: e.target.value })} /></div>
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm">
                <Camera className="h-4 w-4" />{temp.file ? "تم اختيار صورة ✓" : "صورة الصنف (اختياري)"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setTemp({ ...temp, file: e.target.files?.[0] || null })} />
              </label>
            </div>
          )}
          <DialogFooter><Button className="w-full" disabled={busy} onClick={saveTemp}>{busy ? "جارِ الحفظ…" : "إضافة البند"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>إرسال للمحاسب؟</DialogTitle>
            <DialogDescription>بعد الإرسال ما بتقدر تعدّل الاستلام. {order.lines.length} صنف بمجموع {Number(order.total || 0).toFixed(2)} ₪.</DialogDescription></DialogHeader>
          {missingPrice > 0 && <p className="text-sm text-destructive">في {missingPrice} صنف بدون سعر — لازم تكتب السعر قبل الإرسال.</p>}
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setConfirmSubmit(false)}>رجوع</Button><Button disabled={missingPrice > 0} onClick={submit}>إرسال</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DShell>
  );
}

export default function DirectReceivingPage() {
  const { user, loading } = useAuth();
  const { orderId } = useParams();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (loading || !user) return;
    supabase.rpc("direct_receiving_context" as any).then(({ data, error }) => {
      if (error) { setDenied(true); return; }
      setCtx(data as any);
    });
  }, [loading, user]);
  if (!loading && !user) return <Navigate to="/auth" replace />;
  if (denied) return <Navigate to="/choose-workspace" replace />;
  if (!ctx) return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center text-muted-foreground">جارِ التحقق من الصلاحية…</div>;
  return orderId ? <DirectSession orderId={orderId} ctx={ctx} /> : <MyList ctx={ctx} />;
}

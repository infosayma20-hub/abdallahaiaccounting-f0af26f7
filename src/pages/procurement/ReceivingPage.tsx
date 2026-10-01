import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, ScanLine, Minus, Plus, CheckCircle2, Package, RefreshCw, Barcode, Printer, StickyNote, ClipboardList, Camera } from "lucide-react";
import { receivingStatusLabel } from "@/components/procurement/ReceivingAssignDialog";
import POSBarcodeScanner from "@/components/pos/POSBarcodeScanner";
import { useAuth } from "@/hooks/useAuth";
import { BRAND } from "@/constants/brand";

type Line = {
  id: string; order_item_id: string; product_id: string | null; item_name: string; unit: string | null;
  ordered_qty: number; received_before: number; target_qty: number; scanned_qty: number; note: string | null; item_notes?: string | null; branch_name?: string | null;
  expiry_date: string | null; barcode: string | null; extra_barcodes: string[];
};
type Session = {
  id: string; status: string; order_number: string; supplier_name: string | null; expected_date: string | null; order_notes?: string | null; lines: Line[];
};

/* ───────── Feedback sounds (no external assets) ───────── */
let audioCtx: AudioContext | null = null;
function beep(ok: boolean) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.frequency.value = ok ? 1200 : 220; o.type = ok ? "sine" : "square";
    g.gain.value = 0.15; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.35));
    if (!ok && navigator.vibrate) navigator.vibrate(200);
  } catch { /* ignore */ }
}

/* ───────── Offline scan queue (survives reload / network loss) ───────── */
const QKEY = (sid: string) => `receiving:queue:${sid}`;
const readQueue = (sid: string): string[] => { try { return JSON.parse(localStorage.getItem(QKEY(sid)) || "[]"); } catch { return []; } };
const writeQueue = (sid: string, q: string[]) => localStorage.setItem(QKEY(sid), JSON.stringify(q));

/* ───────── Dynamics-style finance shell ───────── */
function DShell({ title, crumb, actions, children, onClick }: { title: string; crumb: string; actions: ReactNode; children: ReactNode; onClick?: () => void }) {
  return (
    <div dir="rtl" className="flex min-h-[100dvh] flex-col bg-muted/30" onClick={onClick}>
      <header className="flex h-16 shrink-0 items-center gap-3 bg-primary px-3 text-primary-foreground shadow-md sm:px-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-card p-1.5 shadow-sm">
          <img src={BRAND.logos.icon} alt="يونيفاي" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">يونيفاي</span>
            <span className="hidden h-4 w-px bg-primary-foreground/30 sm:block" />
            <span className="hidden text-xs text-primary-foreground/75 sm:block">إدارة المستودع</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-primary-foreground/65">
            <span>استلام البضاعة</span><span>‹</span><span className="truncate font-semibold text-primary-foreground">{crumb}</span>
          </div>
        </div>
        <div className="mr-auto hidden items-center gap-2 text-xs text-primary-foreground/70 sm:flex">
          <Package className="h-4 w-4" /> مساحة موظف المستودع
        </div>
      </header>
      <div className="sticky top-0 z-10 flex min-h-14 items-stretch gap-1 overflow-x-auto border-b bg-card px-2 shadow-sm sm:px-4">{actions}</div>
      <div className="border-b bg-background px-4 py-3 sm:px-6">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
function PaneBtn({ icon: Icon, label, onClick, primary, disabled }: { icon: any; label: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" disabled={disabled} onClick={e => { e.stopPropagation(); onClick(); }}
      className={`h-auto min-w-[84px] rounded-none flex-col gap-1 px-3 py-2 text-xs font-semibold ${primary ? "text-primary hover:bg-primary/10 hover:text-primary" : "text-foreground"}`}>
      <Icon className="h-5 w-5" />{label}
    </Button>
  );
}

/* ───────── List of my assigned orders ───────── */
function MyReceivingList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_receiving_sessions");
    if (error) toast.error(error.message);
    setRows((data as any[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <DShell title="استلام البضاعة" crumb="طلبيات الاستلام"
      actions={<><PaneBtn icon={ArrowRight} label="مساحات العمل" onClick={() => navigate("/choose-workspace", { replace: true })} /><PaneBtn icon={RefreshCw} label="تحديث" onClick={load} /></>}>
      <main className="mx-auto w-full max-w-[1500px] p-3 sm:p-5 lg:p-7">
        {loading ? <div className="p-10 text-center text-muted-foreground">جارِ التحميل…</div> : rows.length === 0 ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center border border-dashed bg-card px-5 py-12 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <ClipboardList className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">لا توجد طلبيات للاستلام</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">ستظهر هنا طلبيات الشراء المسندة إليك فور إرسالها من المسؤول.</p>
            <Button variant="outline" className="mt-6 gap-2" onClick={load}><RefreshCw className="h-4 w-4" />تحديث الطلبيات</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-card shadow-sm">
            <div className="hidden grid-cols-[1.2fr_1.5fr_0.7fr_1.2fr_0.9fr] gap-3 border-b bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground md:grid">
              <span>رقم الطلبية</span><span>المورد</span><span>الأصناف</span><span>التقدم</span><span>الحالة</span>
            </div>
            {rows.map(r => {
              const pct = r.ordered_total > 0 ? Math.min(100, Math.round((r.scanned_total / r.ordered_total) * 100)) : 0;
              const open = async () => {
                if (r.id) return navigate(`/worker/receiving/${r.id}`);
                const { data, error } = await supabase.rpc("claim_receiving_order", { p_order_id: r.order_id });
                if (error) { toast.error(error.message); load(); return; }
                navigate(`/worker/receiving/${data}`);
              };
              return (
                <Button key={r.id || r.order_id} variant="ghost" onClick={open}
                  className="grid h-auto w-full grid-cols-2 items-center gap-3 rounded-none border-b px-4 py-4 text-right font-normal last:border-b-0 hover:bg-primary/5 md:grid-cols-[1.2fr_1.5fr_0.7fr_1.2fr_0.9fr]">
                  <span className="text-base font-semibold text-primary underline-offset-2 hover:underline">{r.order_number}</span>
                  <span className="text-sm text-foreground">{r.supplier_name || "—"}{r.expected_date && <span className="block text-xs text-muted-foreground">متوقع: {r.expected_date}</span>}</span>
                  <span className="text-sm">{r.items_count}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-2 flex-1 overflow-hidden bg-muted"><span className="block h-full bg-primary" style={{ width: `${pct}%` }} /></span>
                    {Number(r.scanned_total)}/{Number(r.ordered_total)}
                  </span>
                  <span><Badge variant={r.status === "submitted" ? "default" : "outline"}>{r.status === "available" ? "جديدة — اضغط للاستلام" : receivingStatusLabel[r.status]}</Badge></span>
                </Button>
              );
            })}
          </div>
        )}
      </main>
    </DShell>
  );
}

/* ───────── Scanning screen ───────── */
function ReceivingSession({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastLineId, setLastLineId] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<Line | null>(null);
  const [editQty, setEditQty] = useState("0");
  const [editNote, setEditNote] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitNotes, setSubmitNotes] = useState("");
  const [pending, setPending] = useState<number>(readQueue(sessionId).length);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLine, setCameraLine] = useState<Line | null>(null);
  const busy = useRef(false);

  const today = new Date().toISOString().slice(0, 10);
  const editable = session?.status === "assigned" || session?.status === "in_progress";
  const dialogOpen = !!unknown || !!editLine || confirmSubmit;

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_receiving_session", { p_session_id: sessionId } as any);
    if (error) { toast.error(error.message); return; }
    setSession(data as any);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // يرجّع المؤشر لمربع المسح — إلا إذا الموظف بيكتب بحقل ثاني (تاريخ الانتهاء مثلاً)
  const focus = useCallback(() => {
    if (dialogOpen) return;
    setTimeout(() => {
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== inputRef.current && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
      inputRef.current?.focus();
    }, 30);
  }, [dialogOpen]);
  useEffect(() => { focus(); }, [focus, session]);

  const showFlash = (ok: boolean, text: string) => {
    beep(ok); setFlash({ ok, text });
    window.setTimeout(() => setFlash(f => (f && f.text === text ? null : f)), 1800);
  };

  const sendScan = useCallback(async (barcode: string): Promise<"ok" | "unknown" | "network" | "error"> => {
    const { data, error } = await supabase.rpc("receiving_scan", { p_session_id: sessionId, p_barcode: barcode } as any);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("fetch") || msg.includes("network")) return "network";
      showFlash(false, error.message); return "error";
    }
    const r = data as any;
    if (!r?.ok) return "unknown";
    setLastLineId(r.line_id);
    setSession(s => s ? { ...s, status: "in_progress", lines: s.lines.map(l => l.id === r.line_id ? { ...l, scanned_qty: Number(r.scanned_qty) } : l) } : s);
    showFlash(true, `${r.item_name} — ${Number(r.scanned_qty)}`);
    return "ok";
  }, [sessionId]);

  // Flush offline queue
  const flush = useCallback(async () => {
    const q = readQueue(sessionId);
    if (!q.length || !navigator.onLine) return;
    const rest: string[] = [];
    for (const b of q) {
      const res = await sendScan(b);
      if (res === "network") rest.push(b);
    }
    writeQueue(sessionId, rest); setPending(rest.length);
    if (rest.length === 0) load();
  }, [sessionId, sendScan, load]);

  useEffect(() => {
    flush();
    const on = () => flush();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [flush]);

  const handleScan = async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode || !editable || busy.current) return;
    busy.current = true;
    try {
      if (!navigator.onLine) {
        const q = [...readQueue(sessionId), barcode]; writeQueue(sessionId, q); setPending(q.length);
        showFlash(true, `محفوظ بدون نت (${q.length})`); return;
      }
      const res = await sendScan(barcode);
      if (res === "network") {
        const q = [...readQueue(sessionId), barcode]; writeQueue(sessionId, q); setPending(q.length);
        showFlash(true, `محفوظ بدون نت (${q.length})`);
      } else if (res === "unknown") {
        beep(false); setUnknown(barcode);
      }
    } finally { busy.current = false; }
  };

  const linkBarcode = async (line: Line) => {
    if (!unknown) return;
    const { data, error } = await supabase.rpc("receiving_link_barcode", { p_line_id: line.id, p_barcode: unknown } as any);
    if (error) { showFlash(false, error.message); return; }
    showFlash(true, (data as any)?.saved_to_product ? `تم ربط الباركود بالصنف ${line.item_name}` : `تم ربط الباركود بالبند ${line.item_name}`);
    setUnknown(null); setLastLineId(line.id); load();
  };

  const generateBarcode = async (line: Line) => {
    const { data, error } = await supabase.rpc("receiving_generate_barcode", { p_line_id: line.id } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`باركود الصنف: ${data}`);
    printLabel(line.item_name, String(data));
    load();
  };

  const saveEdit = async () => {
    if (!editLine) return;
    const qty = Number(editQty);
    if (!Number.isFinite(qty) || qty < 0) { toast.error("كمية غير صحيحة"); return; }
    const { error } = await supabase.rpc("receiving_set_line", { p_line_id: editLine.id, p_qty: qty, p_note: editNote || null, p_expiry: editExpiry || null } as any);
    if (error) { toast.error(error.message); return; }
    setEditLine(null); load();
  };

  const bump = async (line: Line, delta: number) => {
    const qty = Math.max(0, Number(line.scanned_qty) + delta);
    setSession(s => s ? { ...s, lines: s.lines.map(l => l.id === line.id ? { ...l, scanned_qty: qty } : l) } : s);
    const { error } = await supabase.rpc("receiving_set_line", { p_line_id: line.id, p_qty: qty, p_note: line.note, p_expiry: line.expiry_date } as any);
      if (error) { toast.error(error.message); load(); }
    focus();
  };

  // مسح بالكاميرا من زر صنف محدد — لازم الباركود يطابق نفس الصنف
  const cameraScanLine = async (line: Line, raw: string) => {
    const barcode = (raw || "").trim();
    if (!barcode || !editable) return;
    const fresh = session?.lines.find(x => x.id === line.id) || line;
    const codes = [fresh.barcode, ...(fresh.extra_barcodes || [])].filter(Boolean).map(c => String(c).trim());

    // صنف بدون باركود — نربط الباركود المقروء فيه ثم نسجّل المسحة
    if (codes.length === 0) {
      if (!navigator.onLine) { beep(false); showFlash(false, "ربط الباركود بحاجة إنترنت"); return; }
      const { error } = await supabase.rpc("receiving_link_barcode", { p_line_id: fresh.id, p_barcode: barcode } as any);
      if (error) { beep(false); showFlash(false, error.message); return; }
      showFlash(true, `تم ربط الباركود بالصنف ${fresh.item_name}`);
      await handleScan(barcode);
      load();
      return;
    }

    if (!codes.includes(barcode)) {
      beep(false);
      showFlash(false, `الباركود لا يطابق ${fresh.item_name}`);
      return;
    }
    await handleScan(barcode);
  };

  const submit = async () => {
    if (pending > 0) { toast.error("في مسحات محفوظة بدون نت — استنى لحد ما تنرفع"); return; }
    if (missingExpiry.length) { toast.error(`تاريخ الانتهاء إجباري: ${missingExpiry.map(l => l.item_name).join("، ")}`); return; }
    const { error } = await supabase.rpc("receiving_submit", { p_session_id: sessionId, p_notes: submitNotes || null } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إرسال الاستلام للمحاسب");
    setConfirmSubmit(false); load();
  };

  const totals = useMemo(() => {
    const lines = session?.lines || [];
    const ordered = lines.reduce((s, l) => s + Number(l.target_qty), 0);
    const scanned = lines.reduce((s, l) => s + Number(l.scanned_qty), 0);
    const done = lines.filter(l => Number(l.scanned_qty) === Number(l.target_qty)).length;
    return { ordered, scanned, done, count: lines.length };
  }, [session]);

  const missingExpiry = (session?.lines || []).filter(l => Number(l.scanned_qty) > 0 && !l.expiry_date);

  const setExpiry = async (line: Line, value: string) => {
    setSession(s => s ? { ...s, lines: s.lines.map(l => l.id === line.id ? { ...l, expiry_date: value || null } : l) } : s);
    const { error } = await supabase.rpc("receiving_set_line", { p_line_id: line.id, p_qty: Number(line.scanned_qty), p_note: line.note, p_expiry: value || null } as any);
    if (error) { toast.error(error.message); load(); }
  };

  if (!session) return <div dir="rtl" className="p-10 text-center text-muted-foreground">جارِ التحميل…</div>;

  return (
    <DShell title={`${session.order_number} — ${session.supplier_name || "—"}`} crumb="استلام طلبية" onClick={focus}
      actions={<>
        <PaneBtn icon={ArrowRight} label="رجوع" onClick={() => navigate("/worker/receiving")} />
        <PaneBtn icon={RefreshCw} label="تحديث" onClick={load} />
        {editable && <PaneBtn icon={CheckCircle2} label="إنهاء وإرسال" primary onClick={() => setConfirmSubmit(true)} />}
        <div className="flex flex-1 items-center justify-end gap-4 px-3 text-xs text-muted-foreground">
          <span>مستلم <b className="text-base text-foreground">{totals.scanned}</b></span>
          <span>مطلوب <b className="text-base text-foreground">{totals.ordered}</b></span>
          <span>مكتمل <b className="text-base text-foreground">{totals.done}/{totals.count}</b></span>
          <Badge variant={session.status === "submitted" ? "default" : "outline"}>{receivingStatusLabel[session.status]}</Badge>
        </div>
      </>}>
      <div className="space-y-3 p-3 md:p-6">
        {session.order_notes && <div className="border-r-4 border-primary bg-card px-3 py-2 text-sm font-medium text-foreground">📝 {session.order_notes}</div>}
        {/* Scan bar — compact */}
        {editable ? (
          <form onSubmit={e => { e.preventDefault(); const v = code; setCode(""); handleScan(v); }}
            className={`flex flex-wrap items-center gap-2 border bg-card px-3 py-2 transition-colors ${flash ? (flash.ok ? "border-primary" : "border-destructive") : "border-border"}`}>
            <ScanLine className="h-4 w-4 shrink-0 text-primary" />
            <Input ref={inputRef} value={code} onChange={e => setCode(e.target.value)} onBlur={focus}
              inputMode="none" autoComplete="off" placeholder="امسح الباركود…"
              className="h-9 min-w-36 flex-1 font-mono text-sm" />
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" title="مسح بالكاميرا"
              onClick={e => { e.stopPropagation(); setCameraLine(null); setCameraOpen(true); }}>
              <Camera className="h-4 w-4" />
            </Button>
            {flash && <span className={`text-sm font-bold ${flash.ok ? "text-primary" : "text-destructive"}`}>{flash.text}</span>}
            {pending > 0 && <span className="text-xs text-destructive">{pending} مسحة محفوظة بانتظار النت</span>}
          </form>
        ) : (
          <div className="rounded-xl border bg-card p-4 text-center text-muted-foreground">
            {session.status === "submitted" ? "تم إرسال الاستلام — بانتظار اعتماد المحاسب" : "الاستلام مغلق"}
          </div>
        )}
        <POSBarcodeScanner open={cameraOpen} onClose={() => { setCameraOpen(false); setCameraLine(null); }}
          onScan={c => { if (cameraLine) cameraScanLine(cameraLine); else handleScan(c); }} />

        {/* Lines */}
        <div className="overflow-hidden border bg-card">
          <div className="border-b bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground">بنود الطلبية ({totals.count})</div>
          {session.lines.map(l => {
            const diff = Number(l.scanned_qty) - Number(l.target_qty);
            const state = diff === 0 ? "done" : diff > 0 ? "over" : Number(l.scanned_qty) > 0 ? "partial" : "none";
            const cls = state === "done" ? "bg-primary/5" : state === "over" ? "bg-destructive/5" : state === "partial" ? "bg-accent/20" : "";
            return (
              <div key={l.id} className={`border-b p-3 last:border-b-0 ${cls} ${lastLineId === l.id ? "ring-2 ring-inset ring-primary" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-foreground">{l.item_name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{l.barcode || (l.extra_barcodes?.[0]) || "بدون باركود"}</span>
                      {l.unit && <span>· {l.unit}</span>}
                      {l.branch_name && <span>· 📍 {l.branch_name}</span>}
                      {l.note && <span className="text-destructive">· {l.note}</span>}
                      {Number(l.received_before) > 0 && <span>· مستلم سابقاً {Number(l.received_before)} من {Number(l.ordered_qty)}</span>}
                    </div>
                    {l.item_notes && <div className="mt-1 text-sm font-medium text-accent-foreground bg-accent/40 rounded px-2 py-0.5">📝 {l.item_notes}</div>}
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{Number(l.scanned_qty)}<span className="text-base text-muted-foreground"> / {Number(l.target_qty)}</span></div>
                    <div className={`text-xs font-bold ${state === "done" ? "text-primary" : state === "over" ? "text-destructive" : "text-muted-foreground"}`}>
                      {state === "done" ? "مكتمل" : state === "over" ? `زايد ${diff}` : `ناقص ${-diff}`}
                    </div>
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-11 w-11" title="مسح بالكاميرا لهذا الصنف"
                        onClick={e => { e.stopPropagation(); setCameraLine(l); setCameraOpen(true); }}>
                        <Camera className="h-5 w-5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-11 w-11" onClick={e => { e.stopPropagation(); bump(l, -1); }}><Minus className="h-5 w-5" /></Button>
                      <Button variant="outline" size="icon" className="h-11 w-11" onClick={e => { e.stopPropagation(); bump(l, 1); }}><Plus className="h-5 w-5" /></Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11" title="كمية وملاحظة"
                        onClick={e => { e.stopPropagation(); setEditLine(l); setEditQty(String(l.scanned_qty)); setEditNote(l.note || ""); setEditExpiry(l.expiry_date || ""); }}>
                        <StickyNote className="h-5 w-5" />
                      </Button>
                      {!l.barcode && l.product_id && (
                        <Button variant="ghost" size="icon" className="h-11 w-11" title="توليد وطباعة باركود"
                          onClick={e => { e.stopPropagation(); generateBarcode(l); }}>
                          <Barcode className="h-5 w-5" />
                        </Button>
                      )}
                      {l.barcode && (
                        <Button variant="ghost" size="icon" className="h-11 w-11" title="طباعة ملصق"
                          onClick={e => { e.stopPropagation(); printLabel(l.item_name, l.barcode!); }}>
                          <Printer className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {Number(l.scanned_qty) > 0 && (
                  <div className="mt-2 flex items-center gap-2 border-t pt-2" onClick={e => e.stopPropagation()}>
                    <span className={`text-sm font-bold ${l.expiry_date ? "text-foreground" : "text-destructive"}`}>تاريخ الانتهاء *</span>
                    {editable ? (
                      <Input type="date" min={today} value={l.expiry_date || ""} onChange={e => setExpiry(l, e.target.value)}
                        onBlur={focus}
                        className={`h-11 flex-1 sm:flex-none sm:w-48 ${l.expiry_date ? "" : "border-destructive"}`} />
                    ) : <span className="text-sm">{l.expiry_date || "—"}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {editable && (
          <Button size="lg" className="h-14 w-full text-lg md:hidden" onClick={() => setConfirmSubmit(true)}>
            <CheckCircle2 className="ml-2 h-6 w-6" />إنهاء الاستلام وإرساله للمحاسب
          </Button>
        )}
      </div>
      {/* Unknown barcode */}
      <Dialog open={!!unknown} onOpenChange={o => { if (!o) { setUnknown(null); focus(); } }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>باركود غير معروف</DialogTitle>
            <DialogDescription>
              الباركود <span className="font-mono font-bold">{unknown}</span> مش مربوط بأي صنف بالطلبية. اختار الصنف لربطه — بينحفظ للمرات الجاية.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-auto">
            {session.lines.map(l => (
              <button key={l.id} onClick={() => linkBarcode(l)}
                className="flex w-full items-center justify-between rounded-lg border p-3 text-right hover:border-primary hover:bg-primary/5">
                <span className="font-bold">{l.item_name}</span>
                <span className="text-xs text-muted-foreground">{l.barcode ? "له باركود" : "بدون باركود"} · {Number(l.scanned_qty)}/{Number(l.target_qty)}</span>
              </button>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setUnknown(null)}>تجاهل</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit line */}
      <Dialog open={!!editLine} onOpenChange={o => { if (!o) { setEditLine(null); focus(); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>{editLine?.item_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm">الكمية المستلمة</div>
              <Input type="number" inputMode="decimal" min={0} value={editQty} onChange={e => setEditQty(e.target.value)} className="h-12 text-lg" />
            </div>
            <div>
              <div className="mb-1 text-sm">تاريخ الانتهاء *</div>
              <Input type="date" min={today} value={editExpiry} onChange={e => setEditExpiry(e.target.value)} className="h-12 text-lg" />
            </div>
            <div>
              <div className="mb-1 text-sm">ملاحظة (تالف، ناقص…)</div>
              <Textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveEdit}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit */}
      <Dialog open={confirmSubmit} onOpenChange={o => { if (!o) { setConfirmSubmit(false); focus(); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إنهاء الاستلام</DialogTitle>
            <DialogDescription>
              مستلم {totals.scanned} من {totals.ordered} — {totals.count - totals.done} أصناف فيها فرق. بعد الإرسال ما بتقدر تعدّل إلا إذا المحاسب رجّعها.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="ملاحظات للمحاسب (اختياري)" value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} rows={3} />
          <DialogFooter><Button onClick={submit}>إرسال للمحاسب</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DShell>
  );
}

/* ───────── Label printing (Code128 via JsBarcode CDN-free SVG fallback: EAN text) ───────── */
function printLabel(name: string, barcode: string) {
  const w = window.open("", "_blank", "width=420,height=320");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  w.document.write(`<html dir="rtl"><head><title>${esc(barcode)}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>@page{size:50mm 30mm;margin:2mm}body{margin:0;font-family:Cairo,Arial,sans-serif;text-align:center}
    .n{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}svg{width:100%;height:18mm}</style></head>
    <body><div class="n">${esc(name)}</div><svg id="b"></svg>
    <script>window.onload=function(){try{JsBarcode("#b","${esc(barcode)}",{format:${/^\d{13}$/.test(barcode) ? '"EAN13"' : '"CODE128"'},height:50,fontSize:14,margin:0});}catch(e){JsBarcode("#b","${esc(barcode)}",{format:"CODE128"});}setTimeout(function(){window.print()},300)}</script>
    </body></html>`);
  w.document.close();
}

export default function ReceivingPage() {
  const { user, loading: authLoading } = useAuth();
  const { sessionId } = useParams();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setAccess("denied");
      return;
    }
    let active = true;
    void Promise.all([
      supabase.from("employees").select("is_receiver, is_active, is_terminated").eq("auth_user_id", user.id).maybeSingle(),
      supabase.rpc("get_my_receiving_sessions"),
    ]).then(([employeeResult, sessionsResult]) => {
      if (!active) return;
      const employee = employeeResult.data as { is_receiver?: boolean | null; is_active?: boolean | null; is_terminated?: boolean | null } | null;
      const sessions = (sessionsResult.data as Array<{ id?: string }> | null) || [];
      const isWarehouseEmployee = employee?.is_receiver === true && employee.is_active === true && employee.is_terminated !== true;
      setAccess(isWarehouseEmployee || sessions.length > 0 ? "allowed" : "denied");
    }).catch(() => {
      if (active) setAccess("denied");
    });
    return () => { active = false; };
  }, [authLoading, user?.id]);

  if (authLoading || access === "checking") {
    return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">جارِ التحقق من صلاحية موظف المستودع…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (access === "denied") return <Navigate to="/choose-workspace" replace />;
  return sessionId ? <ReceivingSession sessionId={sessionId} /> : <MyReceivingList />;
}

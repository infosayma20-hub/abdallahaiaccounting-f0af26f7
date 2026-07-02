import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight, Loader2, Save, Trash2, Pencil, Plus, ChevronRight, ChevronLeft,
  Search, ArrowRight, XCircle, Check, TrendingUp, Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { fmtDateDisplay } from "@/lib/utils";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import { broadcastChange } from "@/lib/crossTabSync";

// Marker embedded in description so we can locate & reverse the paired
// journal transactions when a currency-exchange is edited or deleted.
const REF_TAG = (key: string) => `#FXREF#${key}#`;
const extractRef = (desc: string | null | undefined) => {
  if (!desc) return null;
  const m = desc.match(/#FXREF#([A-Za-z0-9_.-]+)#/);
  return m?.[1] || null;
};

const CURRENCIES = [
  { code: "ILS", label: "شيكل ₪", symbol: "₪", arLabel: "شيكل" },
  { code: "USD", label: "دولار $", symbol: "$", arLabel: "دولار" },
  { code: "JOD", label: "دينار JOD", symbol: "JOD", arLabel: "دينار" },
  { code: "EUR", label: "يورو €", symbol: "€", arLabel: "يورو" },
  { code: "EGP", label: "جنيه E£", symbol: "E£", arLabel: "جنيه" },
];
const curMeta = (code?: string) => CURRENCIES.find(c => c.code === (code || "ILS")) || CURRENCIES[0];

const CurrencyExchangePage = () => {
  const navigate = useNavigate();
  const [params, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();

  const editId = params.get("edit");
  const viewId = params.get("view");
  const recordId = editId || viewId;
  const isView = !!viewId;
  const readonly = isView;

  const [boxes, setBoxes] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fromBoxId, setFromBoxId] = useState("");
  const [toBoxId, setToBoxId] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Track which two fields the user last touched so the third auto-updates.
  const lastEdited = useRef<Array<"from" | "to" | "rate">>(["from", "rate"]);
  const touch = (field: "from" | "to" | "rate") => {
    lastEdited.current = [field, lastEdited.current.find(f => f !== field) || (field === "from" ? "rate" : "from")];
  };

  const fromBox = boxes.find(b => b.id === fromBoxId);
  const toBox = boxes.find(b => b.id === toBoxId);
  const fromCur = curMeta(fromBox?.currency);
  const toCur = curMeta(toBox?.currency);
  const sameCurrency = !!fromBox && !!toBox && fromCur.code === toCur.code;
  const bothForeign = !!fromBox && !!toBox && fromCur.code !== "ILS" && toCur.code !== "ILS";
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const fetchBase = useCallback(async () => {
    if (!user || !dataOwnerId) return;
    const [bRes, tRes, txRes] = await Promise.all([
      supabase.from("cash_boxes").select("*").eq("user_id", dataOwnerId).eq("is_active", true),
      supabase.from("cash_transfers").select("*").eq("user_id", dataOwnerId).eq("transfer_type", "currency_exchange").order("created_at", { ascending: false }).limit(200),
      supabase.from("transactions").select("amount, foreign_amount, debit_account_code, credit_account_code, currency").eq("user_id", dataOwnerId).eq("is_deleted", false),
    ]);
    const boxesData = bRes.data || [];
    setBoxes(boxesData);
    setRecords(tRes.data || []);
    // Compute per-box balance in that box's own currency:
    //   - ILS boxes accumulate `amount`
    //   - foreign boxes accumulate `foreign_amount` when tx currency matches
    const bals: Record<string, number> = {};
    const codeToBox: Record<string, any> = {};
    boxesData.forEach((b: any) => { if (b.gl_account_code) { bals[b.gl_account_code] = 0; codeToBox[b.gl_account_code] = b; } });
    (txRes.data || []).forEach((tx: any) => {
      const useForeign = (code: string) => {
        const box = codeToBox[code];
        return box && box.currency && box.currency !== "ILS";
      };
      const dr = tx.debit_account_code, cr = tx.credit_account_code;
      if (dr && bals[dr] !== undefined) {
        const v = useForeign(dr) ? Number(tx.foreign_amount || 0) : Number(tx.amount || 0);
        bals[dr] += v;
      }
      if (cr && bals[cr] !== undefined) {
        const v = useForeign(cr) ? Number(tx.foreign_amount || 0) : Number(tx.amount || 0);
        bals[cr] -= v;
      }
    });
    setBalances(bals);
  }, [user, dataOwnerId]);

  const loadRecord = useCallback(async (id: string) => {
    const { data } = await supabase.from("cash_transfers").select("*").eq("id", id).maybeSingle();
    if (!data) { toast({ title: "لم يتم العثور على السجل", variant: "destructive" }); return; }
    setFromBoxId(data.from_box_id || "");
    setToBoxId(data.to_box_id || "");
    setFromAmount(String(data.amount ?? ""));
    const r = Number(data.exchange_rate) || 0;
    setRate(r ? String(r) : "");
    setToAmount(r > 0 && data.amount ? (Number(data.amount) * r).toFixed(2) : "");
    setTransferDate(data.transfer_date || new Date().toISOString().split("T")[0]);
    setDescription((data.description || "").replace(/\s*#FXREF#[A-Za-z0-9_.-]+#\s*/g, "").trim());
    // Prime lastEdited so auto-calc doesn't overwrite loaded values
    lastEdited.current = ["from", "rate"];
  }, [toast]);

  const resetForm = useCallback(() => {
    setFromBoxId(""); setToBoxId(""); setFromAmount(""); setToAmount(""); setRate("");
    setNotes(""); setDescription("");
    setTransferDate(new Date().toISOString().split("T")[0]);
    lastEdited.current = ["from", "rate"];
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchBase();
      if (recordId) await loadRecord(recordId);
      else {
        const fromParam = params.get("from");
        if (fromParam) setFromBoxId(fromParam);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, dataOwnerId]);

  // Fetch default cross-rate when boxes change (unless we are loading a record with an explicit rate)
  useEffect(() => {
    if (!fromBox || !toBox || sameCurrency) return;
    if (rate) return; // don't override user/loaded rate
    (async () => {
      const fetchILSRate = async (code: string): Promise<number> => {
        if (code === "ILS") return 1;
        const { data: cur } = await supabase
          .from("currencies").select("id").eq("code", code).eq("is_active", true).maybeSingle();
        if (!cur?.id) return 0;
        const { data: r } = await supabase
          .from("exchange_rates")
          .select("mid_rate, buy_rate, sell_rate")
          .eq("currency_id", cur.id)
          .order("rate_date", { ascending: false })
          .limit(1).maybeSingle();
        return Number(r?.mid_rate || r?.sell_rate || r?.buy_rate || 0);
      };
      const [fromR, toR] = await Promise.all([fetchILSRate(fromCur.code), fetchILSRate(toCur.code)]);
      if (fromR > 0 && toR > 0) {
        const def = fromR / toR;
        setRate(def.toFixed(6));
        const f = Number(fromAmount);
        if (f > 0) setToAmount((f * def).toFixed(2));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromBoxId, toBoxId, sameCurrency]);

  // Auto-compute the third field from the two most recently edited ones.
  useEffect(() => {
    const [a, b] = lastEdited.current;
    const missing = (["from", "to", "rate"] as const).find(f => f !== a && f !== b);
    if (!missing) return;
    const f = Number(fromAmount), t = Number(toAmount), r = Number(rate);
    if (missing === "to" && f > 0 && r > 0) {
      const v = (f * r).toFixed(2); if (v !== toAmount) setToAmount(v);
    } else if (missing === "from" && t > 0 && r > 0) {
      const v = (t / r).toFixed(2); if (v !== fromAmount) setFromAmount(v);
    } else if (missing === "rate" && f > 0 && t > 0) {
      const v = (t / f).toFixed(6); if (v !== rate) setRate(v);
    }
  }, [fromAmount, toAmount, rate]);

  const currentIdx = useMemo(() => records.findIndex(t => t.id === recordId), [records, recordId]);
  const goRel = (delta: number) => {
    if (currentIdx < 0) {
      if (records[0]) setSearchParams({ view: records[0].id });
      return;
    }
    const next = records[currentIdx + delta];
    if (next) setSearchParams({ view: next.id });
    else toast({ title: delta > 0 ? "لا يوجد سجل أحدث" : "لا يوجد سجل أقدم" });
  };

  const purgeTransactionsForRef = async (ref: string) => {
    if (!dataOwnerId || !ref) return;
    await supabase
      .from("transactions")
      .update({ is_deleted: true } as any)
      .eq("user_id", dataOwnerId)
      .ilike("description", `%${REF_TAG(ref)}%`);
  };

  const performPosting = async (refKey: string) => {
    if (!fromBox || !toBox) throw new Error("الصناديق غير مكتملة");
    const fAmt = Number(fromAmount), tAmt = Number(toAmount), r = Number(rate);

    const fromIsILS = fromCur.code === "ILS";
    const ilsAmount = fromIsILS ? fAmt : tAmt;
    const foreignAmount = fromIsILS ? tAmt : fAmt;
    const foreignCurName = fromIsILS ? toCur.arLabel : fromCur.arLabel;
    const ilsPerForeign = ilsAmount / foreignAmount;

    const baseDesc = description || `صرف عملة: ${fromBox.name} (${fromCur.arLabel} ${fmt(fAmt)}) → ${toBox.name} (${toCur.arLabel} ${fmt(tAmt)}) | سعر: 1 ${fromCur.arLabel} = ${r} ${toCur.arLabel}`;
    const finalDesc = `${baseDesc}${notes ? ` — ${notes}` : ""} ${REF_TAG(refKey)}`;

    const { error: insErr } = await supabase.from("transactions").insert({
      user_id: dataOwnerId!,
      transaction_date: transferDate,
      description: finalDesc,
      debit_account_code: toBox.gl_account_code,
      credit_account_code: fromBox.gl_account_code,
      amount: ilsAmount,
      foreign_amount: foreignAmount,
      exchange_rate: ilsPerForeign,
      currency: foreignCurName,
      transaction_type: "currency_exchange",
      reference: refKey,
      idempotency_key: refKey,
      payment_method: "exchange",
    });
    if (insErr) throw insErr;
    return { finalDesc, ilsAmount, foreignAmount, r };
  };

  const validate = (): string | null => {
    if (!fromBox || !toBox) return "الصناديق غير مكتملة";
    if (fromBoxId === toBoxId) return "لا يمكن الصرف من صندوق لنفسه";
    if (sameCurrency) return "الصندوقان بنفس العملة — استخدم شاشة التحويل بين الصناديق";
    if (bothForeign) return "الصرف بين عملتين أجنبيتين يجب تنفيذه على مرحلتين عبر الشيكل";
    if (!fromBox.gl_account_code || !toBox.gl_account_code) return "أحد الصناديق لا يملك حساب دفتر أستاذ";
    const f = Number(fromAmount), t = Number(toAmount), r = Number(rate);
    if (!f || f <= 0) return "أدخل مبلغ المصدر";
    if (!t || t <= 0) return "أدخل مبلغ الوجهة";
    if (!r || r <= 0) return "أدخل سعر صرف صحيح";
    return null;
  };

  const handleSave = async () => {
    if (!user || !dataOwnerId) return;
    const err = validate();
    if (err) { toast({ title: err, variant: "destructive" }); return; }

    setSaving(true);
    try {
      if (editId) {
        const { data: existing } = await supabase.from("cash_transfers").select("description").eq("id", editId).maybeSingle();
        const oldRef = extractRef(existing?.description);
        if (oldRef) await purgeTransactionsForRef(oldRef);

        const newRef = `FX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { finalDesc, r } = await performPosting(newRef);

        await supabase.from("cash_transfers").update({
          from_box_id: fromBoxId,
          to_box_id: toBoxId,
          amount: Number(fromAmount),
          currency: fromCur.code,
          exchange_rate: r,
          transfer_date: transferDate,
          description: finalDesc,
        }).eq("id", editId);

        broadcastChange("transaction", "updated", editId);
        toast({ title: "✅ تم تحديث الصرف وإعادة الترحيل" });
      } else {
        const newRef = `FX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { finalDesc, r } = await performPosting(newRef);

        const { data: inserted } = await supabase.from("cash_transfers").insert({
          user_id: dataOwnerId,
          from_box_id: fromBoxId,
          to_box_id: toBoxId,
          amount: Number(fromAmount),
          currency: fromCur.code,
          exchange_rate: r,
          transfer_date: transferDate,
          description: finalDesc,
          transfer_type: "currency_exchange",
        }).select("id").maybeSingle();

        broadcastChange("transaction", "created", inserted?.id || newRef);
        setSuccess(true);
        toast({ title: `✅ تم صرف ${fromCur.symbol}${fmt(Number(fromAmount))} → ${toCur.symbol}${fmt(Number(toAmount))}` });
        setTimeout(() => setSuccess(false), 1800);
        if (inserted?.id) setSearchParams({ view: inserted.id });
      }
      await fetchBase();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!recordId) return;
    setDeleting(true);
    try {
      const { data: rec } = await supabase.from("cash_transfers").select("description").eq("id", recordId).maybeSingle();
      const ref = extractRef(rec?.description);
      if (ref) await purgeTransactionsForRef(ref);
      await supabase.from("cash_transfers").delete().eq("id", recordId);
      broadcastChange("transaction", "deleted", recordId);
      toast({ title: "🗑️ تم حذف الصرف وعكس القيد" });
      setConfirmDeleteOpen(false);
      resetForm();
      setSearchParams({});
      await fetchBase();
    } catch (e: any) {
      toast({ title: "خطأ في الحذف", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const filteredQuery = records.filter(t => {
    if (!queryText) return true;
    const q = queryText.toLowerCase();
    const fb = boxes.find(b => b.id === t.from_box_id)?.name?.toLowerCase() || "";
    const tb = boxes.find(b => b.id === t.to_box_id)?.name?.toLowerCase() || "";
    return fb.includes(q) || tb.includes(q) ||
      String(t.amount).includes(q) || (t.description || "").toLowerCase().includes(q);
  });

  const canSave = !readonly && !saving && !validate();

  const actionTabs: ActionTab[] = [
    {
      key: "main",
      label: "عام",
      groups: [
        {
          key: "save-group", label: "الحفظ",
          items: [
            { key: "save", label: recordId ? "حفظ التعديل" : "حفظ وترحيل", icon: Save, variant: "primary",
              onClick: handleSave, disabled: !canSave, shortcut: "Ctrl+S" },
            { key: "new", label: "جديد", icon: Plus,
              onClick: () => { resetForm(); setSearchParams({}); } },
          ],
        },
        {
          key: "record", label: "السجل",
          items: [
            { key: "edit", label: "تعديل", icon: Pencil, disabled: !recordId || !isView,
              onClick: () => recordId && setSearchParams({ edit: recordId }) },
            { key: "delete", label: "حذف", icon: Trash2, variant: "danger",
              disabled: !recordId || deleting, onClick: () => setConfirmDeleteOpen(true) },
          ],
        },
        {
          key: "nav", label: "تنقّل",
          items: [
            { key: "prev", label: "السابق", icon: ChevronRight, onClick: () => goRel(1), disabled: !records.length },
            { key: "next", label: "التالي", icon: ChevronLeft, onClick: () => goRel(-1), disabled: !records.length },
            { key: "query", label: "استعلام", icon: Search, onClick: () => setQueryOpen(true) },
            { key: "back", label: "رجوع", icon: ArrowRight, onClick: () => navigate("/finance/cash-boxes") },
          ],
        },
      ],
    },
  ];

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const titleText = viewId ? "معاينة صرف عملة" : editId ? "تعديل صرف عملة" : "صرف عملة بين صندوقين";

  // Ctrl+S shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSave) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, fromBoxId, toBoxId, fromAmount, toAmount, rate, transferDate]);

  return (
    <FinanceShell
      title={titleText}
      subtitle="قيد محاسبي واحد متزن — يظهر بالعملة الصحيحة في كل صندوق"
      breadcrumb={[
        { label: "المالية" },
        { label: "الصناديق", href: "/finance/cash-boxes" },
        { label: "صرف عملة" },
      ]}
      actionTabs={actionTabs}
    >
      <div className="max-w-5xl mx-auto space-y-4 pb-24" dir="rtl">
        {readonly && (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs">
            <Search className="h-3.5 w-3.5" /> وضع المعاينة — اضغط "تعديل" للتحرير.
          </div>
        )}

        <Card className="overflow-hidden" style={{ borderTop: "3px solid #4A9EE8" }}>
          <CardContent className="p-5 space-y-5">
            {/* Visual */}
            <div className="flex items-center justify-center gap-3 py-2">
              <div className={`flex-1 max-w-[240px] p-3 rounded-xl border-2 text-center ${fromBox ? "border-red-200 bg-red-50/50" : "border-dashed border-muted"}`}>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Wallet className="h-3 w-3" /> من صندوق</p>
                <p className="text-sm font-bold truncate">{fromBox?.name || "—"}</p>
                {fromBox && <p className="text-xs font-mono text-red-600 mt-1">{fromCur.symbol}{fmt(balances[fromBox.gl_account_code] || 0)}</p>}
                {Number(fromAmount) > 0 && <Badge variant="outline" className="mt-1 text-[10px] font-mono text-red-700 border-red-300">− {fromCur.symbol}{fmt(Number(fromAmount))}</Badge>}
              </div>
              <div className="flex flex-col items-center gap-1">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                {Number(rate) > 0 && <Badge className="text-[10px] font-mono" style={{ background: "#4A9EE8" }}>1={Number(rate).toFixed(4)}</Badge>}
              </div>
              <div className={`flex-1 max-w-[240px] p-3 rounded-xl border-2 text-center ${toBox ? "border-emerald-200 bg-emerald-50/50" : "border-dashed border-muted"}`}>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Wallet className="h-3 w-3" /> إلى صندوق</p>
                <p className="text-sm font-bold truncate">{toBox?.name || "—"}</p>
                {toBox && <p className="text-xs font-mono text-emerald-600 mt-1">{toCur.symbol}{fmt(balances[toBox.gl_account_code] || 0)}</p>}
                {Number(toAmount) > 0 && <Badge variant="outline" className="mt-1 text-[10px] font-mono text-emerald-700 border-emerald-300">+ {toCur.symbol}{fmt(Number(toAmount))}</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">من الصندوق *</Label>
                <Select value={fromBoxId} onValueChange={setFromBoxId} disabled={readonly}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="اختر الصندوق المصدر..." /></SelectTrigger>
                  <SelectContent>
                    {boxes.filter(b => b.id !== toBoxId && (b.type === "main" || b.type === "branch")).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                          {b.name}
                          <span className="text-[10px] text-muted-foreground">({curMeta(b.currency).symbol})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold">إلى الصندوق *</Label>
                <Select value={toBoxId} onValueChange={setToBoxId} disabled={readonly}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="اختر الصندوق الوجهة..." /></SelectTrigger>
                  <SelectContent>
                    {boxes.filter(b => b.id !== fromBoxId && (b.type === "main" || b.type === "branch")).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                          {b.name}
                          <span className="text-[10px] text-muted-foreground">({curMeta(b.currency).symbol})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {sameCurrency && (
              <div className="rounded-md p-2 border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
                الصندوقان بنفس العملة. استخدم شاشة "تحويل بين الصناديق" للتحويلات العادية.
              </div>
            )}
            {bothForeign && (
              <div className="rounded-md p-2 border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
                الصرف المباشر بين عملتين أجنبيتين غير مدعوم. نفّذ العملية على مرحلتين عبر صندوق الشيكل.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-bold">التاريخ *</Label>
                <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} disabled={readonly} className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs font-bold">مبلغ المصدر ({fromCur.symbol})</Label>
                <Input type="number" step="0.01" value={fromAmount}
                  onChange={e => { touch("from"); setFromAmount(e.target.value); }}
                  disabled={readonly || !fromBox || !toBox || sameCurrency || bothForeign}
                  placeholder="0.00" className="mt-1 h-10 font-mono" />
              </div>
              <div>
                <Label className="text-xs font-bold">مبلغ الوجهة ({toCur.symbol})</Label>
                <Input type="number" step="0.01" value={toAmount}
                  onChange={e => { touch("to"); setToAmount(e.target.value); }}
                  disabled={readonly || !fromBox || !toBox || sameCurrency || bothForeign}
                  placeholder="0.00" className="mt-1 h-10 font-mono" />
              </div>
              <div>
                <Label className="text-xs font-bold flex items-center gap-1"><TrendingUp className="h-3 w-3" /> سعر الصرف</Label>
                <Input type="number" step="0.000001" value={rate}
                  onChange={e => { touch("rate"); setRate(e.target.value); }}
                  disabled={readonly || !fromBox || !toBox || sameCurrency || bothForeign}
                  placeholder="0.00" className="mt-1 h-10 font-mono" />
                {fromBox && toBox && !sameCurrency && (
                  <p className="text-[10px] text-muted-foreground mt-1">1 {fromCur.arLabel} = {rate || "؟"} {toCur.arLabel}</p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">البيان</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} disabled={readonly}
                placeholder={fromBox && toBox ? `صرف عملة: ${fromBox.name} → ${toBox.name}` : "البيان..."}
                className="mt-1 h-10" />
            </div>

            <div>
              <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} disabled={readonly} className="mt-1" />
            </div>

            {/* Journal Preview */}
            {fromBox && toBox && Number(fromAmount) > 0 && Number(toAmount) > 0 && !sameCurrency && !bothForeign && (
              <div className="rounded-xl border overflow-hidden">
                <div className="p-2.5 bg-muted/30 text-xs font-bold flex items-center gap-2">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> القيد المحاسبي
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground border-t">
                      <th className="text-right p-2">الحساب</th>
                      <th className="text-right p-2 w-32">مدين</th>
                      <th className="text-right p-2 w-32">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-2">
                        <span className="text-emerald-600">●</span> {toBox.gl_account_code} — {toBox.name}
                      </td>
                      <td className="p-2 font-mono font-bold">{toCur.symbol}{fmt(Number(toAmount))}</td>
                      <td className="p-2"></td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-2">
                        <span className="text-red-600">●</span> {fromBox.gl_account_code} — {fromBox.name}
                      </td>
                      <td className="p-2"></td>
                      <td className="p-2 font-mono font-bold text-red-600">{fromCur.symbol}{fmt(Number(fromAmount))}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="p-1.5 text-center text-[10px] text-emerald-600 bg-emerald-50/50 border-t">✓ متزن — كل صندوق يظهر بعملته الفعلية على كشف الحساب</div>
              </div>
            )}

            {success && (
              <div className="flex items-center justify-center gap-2 p-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <Check className="h-4 w-4" /> تم التنفيذ بنجاح
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Query dialog */}
      <Dialog open={queryOpen} onOpenChange={setQueryOpen}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader><DialogTitle>استعلام عن عمليات صرف العملات</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="بحث بالصندوق أو المبلغ أو البيان..."
              value={queryText} onChange={e => setQueryText(e.target.value)} className="pr-8 h-9" />
          </div>
          <div className="max-h-[60vh] overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="text-right p-2">التاريخ</th>
                  <th className="text-right p-2">من</th>
                  <th className="text-right p-2">إلى</th>
                  <th className="text-right p-2">المبلغ المصدر</th>
                  <th className="text-right p-2">سعر الصرف</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuery.map(t => {
                  const fb = boxes.find(b => b.id === t.from_box_id);
                  const tb = boxes.find(b => b.id === t.to_box_id);
                  const sym = curMeta(t.currency).symbol;
                  return (
                    <tr key={t.id} className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => { setQueryOpen(false); setSearchParams({ view: t.id }); }}>
                      <td className="p-2 text-xs">{fmtDateDisplay(t.transfer_date)}</td>
                      <td className="p-2 text-xs">{fb?.name || "—"}</td>
                      <td className="p-2 text-xs">{tb?.name || "—"}</td>
                      <td className="p-2 text-xs font-mono font-bold">{sym}{fmt(Number(t.amount))}</td>
                      <td className="p-2 text-xs font-mono">{Number(t.exchange_rate || 0).toFixed(4)}</td>
                    </tr>
                  );
                })}
                {filteredQuery.length === 0 && (
                  <tr><td colSpan={5} className="text-center p-6 text-xs text-muted-foreground">لا نتائج</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> حذف عملية الصرف؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم عكس القيد المحاسبي المرتبط (تعليمه كمحذوف) وحذف سجل الصرف من الأرشيف نهائياً.
              هذا الإجراء غير قابل للتراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="bg-destructive hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FinanceShell>
  );
};

export default CurrencyExchangePage;
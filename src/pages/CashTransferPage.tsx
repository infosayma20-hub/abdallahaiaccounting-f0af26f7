import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight, Loader2, Save, Trash2, Pencil, Plus, ChevronRight, ChevronLeft,
  Search, ArrowRight, XCircle, Check, MoveLeft,
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
import useSavePostShortcut from "@/hooks/useSavePostShortcut";

// Marker embedded in description so we can locate & reverse the paired
// journal transactions when a transfer is edited or deleted.
const REF_TAG = (key: string) => `#REF#${key}#`;
const extractRef = (desc: string | null | undefined) => {
  if (!desc) return null;
  const m = desc.match(/#REF#([A-Za-z0-9_.-]+)#/);
  return m?.[1] || null;
};

const currencySymbols: Record<string, string> = {
  ILS: "₪", USD: "$", JOD: "JOD ", EUR: "€", EGP: "E£",
};
const currencyToArabic = (c: string) =>
  c === "USD" ? "دولار" : c === "JOD" ? "دينار" : c === "EUR" ? "يورو" : "شيكل";
const fxMainAccounts: Record<string, string> = {
  USD: "1111", JOD: "1112", EUR: "1113", EGP: "1114",
};

const CashTransferPage = () => {
  const navigate = useNavigate();
  const [params, setSearchParams] = useSearchParams();
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();

  const editId = params.get("edit");
  const viewId = params.get("view");
  const recordId = editId || viewId;
  const isView = !!viewId;

  const [boxes, setBoxes] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fromBoxId, setFromBoxId] = useState("");
  const [toBoxId, setToBoxId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [transferCurrency, setTransferCurrency] = useState("ILS");
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const readonly = isView;

  const fetchBase = useCallback(async () => {
    if (!user || !dataOwnerId) return;
    const [bRes, tRes, balRes] = await Promise.all([
      supabase.from("cash_boxes").select("*").eq("user_id", dataOwnerId).eq("is_active", true),
      supabase.from("cash_transfers").select("*").eq("user_id", dataOwnerId).order("created_at", { ascending: false }).limit(200),
      (supabase as any).rpc("get_all_cash_box_balances", { p_owner: dataOwnerId }),
    ]);
    const boxesData = bRes.data || [];
    setBoxes(boxesData);
    setTransfers(tRes.data || []);
    const bals: Record<string, number> = {};
    (boxesData || []).forEach((b: any) => { if (b.gl_account_code) bals[b.gl_account_code] = 0; });
    (balRes.data || []).forEach((r: any) => {
      if (r.account_code) bals[r.account_code] = Number(r.balance) || 0;
    });
    setBalances(bals);
  }, [user, dataOwnerId]);

  const loadRecord = useCallback(async (id: string) => {
    const { data } = await supabase.from("cash_transfers").select("*").eq("id", id).maybeSingle();
    if (!data) { toast({ title: "لم يتم العثور على التحويل", variant: "destructive" }); return; }
    setFromBoxId(data.from_box_id || "");
    setToBoxId(data.to_box_id || "");
    setAmount(String(data.amount ?? ""));
    setTransferDate(data.transfer_date || new Date().toISOString().split("T")[0]);
    setDescription((data.description || "").replace(/\s*#REF#[A-Za-z0-9_.-]+#\s*/g, "").trim());
    setTransferCurrency(data.currency || "ILS");
  }, [toast]);

  const resetForm = useCallback(() => {
    setFromBoxId("");
    setToBoxId("");
    setAmount("");
    setNotes("");
    setDescription("");
    setTransferCurrency("ILS");
    setTransferDate(new Date().toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchBase();
      if (recordId) await loadRecord(recordId);
      else {
        // Auto-select from query param on new
        const fromParam = params.get("from");
        if (fromParam) setFromBoxId(fromParam);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, dataOwnerId]);

  const fromBox = boxes.find(b => b.id === fromBoxId);
  const toBox = boxes.find(b => b.id === toBoxId);
  // Filter boxes strictly by the selected currency — each cash box holds ONE currency only.
  const boxesForCurrency = boxes.filter(b => (b.currency || "ILS") === transferCurrency);

  // Clear any selected box that doesn't match the active currency (avoid cross-currency posting).
  useEffect(() => {
    if (fromBox && (fromBox.currency || "ILS") !== transferCurrency) setFromBoxId("");
    if (toBox && (toBox.currency || "ILS") !== transferCurrency) setToBoxId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferCurrency]);
  const fromBal = fromBox ? (balances[fromBox.gl_account_code] || 0) : 0;
  const toBal = toBox ? (balances[toBox.gl_account_code] || 0) : 0;
  const amountNum = Number(amount) || 0;
  const isForeign = transferCurrency !== "ILS";
  const curSym = currencySymbols[transferCurrency] || "₪";
  const exceeds = !isForeign && amountNum > fromBal && fromBal > 0;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // Prev / Next by created_at order (transfers is DESC = newest first)
  const currentIdx = useMemo(() => transfers.findIndex(t => t.id === recordId), [transfers, recordId]);
  const goRel = (delta: number) => {
    if (currentIdx < 0) {
      if (transfers[0]) setSearchParams({ view: transfers[0].id });
      return;
    }
    const next = transfers[currentIdx + delta];
    if (next) setSearchParams({ view: next.id });
    else toast({ title: delta > 0 ? "لا يوجد تحويل أحدث" : "لا يوجد تحويل أقدم" });
  };

  const purgeTransactionsForRef = async (ref: string) => {
    if (!dataOwnerId || !ref) return;
    // Soft-delete matching journal entries (paired debit+credit rows share the same ref)
    await supabase
      .from("transactions")
      .update({ is_deleted: true } as any)
      .eq("user_id", dataOwnerId)
      .ilike("description", `%${REF_TAG(ref)}%`);
  };

  const performPosting = async (refKey: string) => {
    if (!fromBox || !toBox) throw new Error("الصناديق غير مكتملة");
    const targetAccount = isForeign
      ? (fxMainAccounts[transferCurrency] || toBox.gl_account_code)
      : toBox.gl_account_code;

    let ilsEquivalent = amountNum;
    let rate = 1;
    if (isForeign) {
      const { data: rateVal } = await supabase.rpc("get_exchange_rate", {
        p_currency_code: transferCurrency,
        p_rate_type: "sell",
      });
      rate = Number(rateVal) || (transferCurrency === "USD" ? 3.6 : transferCurrency === "JOD" ? 5.0 : 1);
      ilsEquivalent = amountNum * rate;
    }

    const finalDesc = `${description || `تحويل نقدي: ${fromBox.name} → ${toBox.name}`}${notes ? ` — ${notes}` : ""} ${REF_TAG(refKey)}`;

    const { data: rpcRes, error: txErr } = await supabase.rpc("create_cash_transfer_atomic", {
      p_user_id: dataOwnerId!,
      p_from_account_code: fromBox.gl_account_code,
      p_to_account_code: targetAccount,
      p_amount: ilsEquivalent,
      p_currency: currencyToArabic(transferCurrency),
      p_transfer_date: transferDate,
      p_description: finalDesc,
      p_idempotency_key: refKey,
      p_source: "manual",
      p_exchange_rate: rate,
      p_foreign_amount: isForeign ? amountNum : null,
    });
    const r = rpcRes as any;
    if (txErr || !r?.success) throw new Error(txErr?.message || r?.error || "فشل ترحيل القيد");
    return { rate, ilsEquivalent, finalDesc };
  };

  const handleSave = async () => {
    if (!user || !dataOwnerId || !fromBox || !toBox) {
      toast({ title: "الصناديق غير مكتملة", variant: "destructive" }); return;
    }
    if (fromBoxId === toBoxId) { toast({ title: "لا يمكن التحويل لنفس الصندوق", variant: "destructive" }); return; }
    if (amountNum <= 0) { toast({ title: "أدخل مبلغاً صحيحاً", variant: "destructive" }); return; }
    if (exceeds) { toast({ title: "المبلغ يتجاوز رصيد الصندوق", variant: "destructive" }); return; }
    if (!fromBox.gl_account_code || !toBox.gl_account_code) {
      toast({ title: "أحد الصناديق لا يملك حساب دفتر أستاذ", variant: "destructive" }); return;
    }

    // ─── OFFLINE CAPTURE ───
    // A plain ILS box-to-box transfer needs no server lookup, so it is stored
    // encrypted locally and replayed through the idempotent transfer RPC.
    // Foreign currency needs a live exchange rate → still requires connection.
    if (!editId && !navigator.onLine) {
      if (isForeign) {
        toast({ title: "لا يوجد اتصال", description: "التحويل بعملة أجنبية يحتاج سعر صرف مباشر", variant: "destructive" });
        return;
      }
      setSaving(true);
      try {
        const queued = await queueOfflineDocument({
          docType: "cash_transfer",
          rpc: "create_cash_transfer_offline",
          payload: {
            p_user_id: dataOwnerId,
            p_payload: {
              from_account_code: fromBox.gl_account_code,
              to_account_code: toBox.gl_account_code,
              amount: amountNum,
              currency: currencyToArabic(transferCurrency),
              transfer_date: transferDate,
              description: `${description || `تحويل نقدي: ${fromBox.name} → ${toBox.name}`}${notes ? ` — ${notes}` : ""}`,
              source: "manual",
              from_box_id: fromBoxId,
              to_box_id: toBoxId,
              exchange_rate: 1,
            },
          },
          summary: {
            title: `تحويل نقدي — ${fromBox.name} → ${toBox.name}`,
            amount: amountNum,
            currency: transferCurrency,
            doc_date: transferDate,
          },
          userId: dataOwnerId,
        });
        toast({
          title: "تم الحفظ محلياً",
          description: `سيتم ترحيل التحويل عند عودة الإنترنت (${queued.local_id.slice(0, 12)}…)`,
        });
        resetForm();
        setSearchParams({});
      } catch (e: any) {
        toast({ title: "خطأ", description: e?.message || "فشل الحفظ المحلي", variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        // Load existing to get old ref
        const { data: existing } = await supabase.from("cash_transfers").select("description").eq("id", editId).maybeSingle();
        const oldRef = extractRef(existing?.description);
        if (oldRef) await purgeTransactionsForRef(oldRef);

        // Post new pair
        const newRef = `CASH-TRANSFER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { rate, ilsEquivalent, finalDesc } = await performPosting(newRef);

        // Update audit row
        await supabase.from("cash_transfers").update({
          from_box_id: fromBoxId,
          to_box_id: toBoxId,
          amount: amountNum,
          currency: transferCurrency,
          amount_ils: ilsEquivalent,
          exchange_rate: rate,
          transfer_date: transferDate,
          description: finalDesc,
        }).eq("id", editId);

        broadcastChange("transaction", "updated", editId);
        toast({ title: "✅ تم تحديث التحويل وإعادة الترحيل" });
      } else {
        const newRef = `CASH-TRANSFER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { rate, ilsEquivalent, finalDesc } = await performPosting(newRef);

        const { data: inserted } = await supabase.from("cash_transfers").insert({
          user_id: dataOwnerId,
          from_box_id: fromBoxId,
          to_box_id: toBoxId,
          amount: amountNum,
          currency: transferCurrency,
          amount_ils: ilsEquivalent,
          exchange_rate: rate,
          transfer_date: transferDate,
          description: finalDesc,
          transfer_type: isForeign ? "manual_fx" : "manual",
        }).select("id").maybeSingle();

        broadcastChange("transaction", "created", inserted?.id || newRef);
        setSuccess(true);
        toast({ title: `✅ تم تحويل ${curSym}${fmt(amountNum)} — جاهز لتحويل جديد` });
        setTimeout(() => setSuccess(false), 1800);
        // Open a fresh empty transfer form after successful posting
        resetForm();
        setSearchParams({});
      }
      await fetchBase();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "فشل الحفظ", variant: "destructive" });
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
      toast({ title: "🗑️ تم حذف التحويل وعكس القيد" });
      setConfirmDeleteOpen(false);
      resetForm();
      setSearchParams({});
      await fetchBase();
    } catch (err: any) {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const filteredQuery = transfers.filter(t => {
    if (!queryText) return true;
    const q = queryText.toLowerCase();
    const fb = boxes.find(b => b.id === t.from_box_id)?.name?.toLowerCase() || "";
    const tb = boxes.find(b => b.id === t.to_box_id)?.name?.toLowerCase() || "";
    return fb.includes(q) || tb.includes(q) ||
      String(t.amount).includes(q) || (t.description || "").toLowerCase().includes(q);
  });

  useSavePostShortcut(handleSave, !saving && !readonly);

  const actionTabs: ActionTab[] = [
    {
      key: "main",
      label: "عام",
      groups: [
        {
          key: "save-group",
          label: "الحفظ",
          items: [
            { key: "save", label: recordId ? "حفظ التعديل" : "حفظ وترحيل", icon: Save, variant: "primary",
              onClick: handleSave, disabled: saving || readonly, shortcut: "Ctrl+Enter" },
            { key: "new", label: "جديد", icon: Plus,
              onClick: () => { resetForm(); setSearchParams({}); } },
          ],
        },
        {
          key: "record",
          label: "السجل",
          items: [
            { key: "edit", label: "تعديل", icon: Pencil, disabled: !recordId || !isView,
              onClick: () => recordId && setSearchParams({ edit: recordId }) },
            { key: "delete", label: "حذف", icon: Trash2, variant: "danger",
              disabled: !recordId || deleting, onClick: () => setConfirmDeleteOpen(true) },
          ],
        },
        {
          key: "nav",
          label: "تنقّل",
          items: [
            { key: "prev", label: "السابق", icon: ChevronRight, onClick: () => goRel(1), disabled: !transfers.length },
            { key: "next", label: "التالي", icon: ChevronLeft, onClick: () => goRel(-1), disabled: !transfers.length },
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

  const titleText = viewId ? "معاينة تحويل" : editId ? "تعديل تحويل" : "تحويل جديد بين الصناديق";

  return (
    <FinanceShell
      title={titleText}
      subtitle="قيد محاسبي مزدوج، إعادة ترحيل آمنة على التعديل، وعكس تلقائي عند الحذف"
      breadcrumb={[
        { label: "المالية" },
        { label: "الصناديق", href: "/finance/cash-boxes" },
        { label: "تحويل بين الصناديق" },
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
              <div className={`flex-1 max-w-[220px] p-3 rounded-xl border-2 text-center ${fromBox ? "border-red-200 bg-red-50/50" : "border-dashed border-muted"}`}>
                <p className="text-[10px] text-muted-foreground">من صندوق</p>
                <p className="text-sm font-bold truncate">{fromBox?.name || "—"}</p>
                {fromBox && <p className="text-xs font-mono text-red-600 mt-1">₪{fmt(fromBal)}</p>}
              </div>
              <div className="flex flex-col items-center gap-1">
                <MoveLeft className="h-5 w-5 text-primary" />
                {amountNum > 0 && <Badge className="text-xs font-mono" style={{ background: "#4A9EE8" }}>{curSym}{fmt(amountNum)}</Badge>}
              </div>
              <div className={`flex-1 max-w-[220px] p-3 rounded-xl border-2 text-center ${toBox ? "border-emerald-200 bg-emerald-50/50" : "border-dashed border-muted"}`}>
                <p className="text-[10px] text-muted-foreground">إلى صندوق</p>
                <p className="text-sm font-bold truncate">{toBox?.name || "—"}</p>
                {toBox && <p className="text-xs font-mono text-emerald-600 mt-1">₪{fmt(toBal)}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">من الصندوق * <span className="text-muted-foreground font-normal">({transferCurrency})</span></Label>
                <Select value={fromBoxId} onValueChange={(v) => {
                  setFromBoxId(v);
                  const b = boxes.find(x => x.id === v);
                  if (b?.currency && b.currency !== transferCurrency) setTransferCurrency(b.currency);
                }} disabled={readonly}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue placeholder={`اختر صندوق ${transferCurrency}...`} /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 sticky top-0 bg-popover z-10 border-b">
                      <Input
                        placeholder="بحث..."
                        value={fromSearch}
                        onChange={(e) => setFromSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 text-xs"
                      />
                    </div>
                    {boxesForCurrency.filter(b => b.id !== toBoxId).length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground text-center">لا يوجد صناديق بعملة {transferCurrency}</div>
                    )}
                    {boxesForCurrency.filter(b => b.id !== toBoxId && (
                      !fromSearch.trim() ||
                      b.name?.toLowerCase().includes(fromSearch.toLowerCase()) ||
                      b.gl_account_code?.toLowerCase().includes(fromSearch.toLowerCase())
                    )).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                          {b.name}
                          <span className="text-[10px] font-mono text-muted-foreground">{currencySymbols[b.currency||"ILS"]}{fmt(balances[b.gl_account_code] || 0)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold">إلى الصندوق * <span className="text-muted-foreground font-normal">({transferCurrency})</span></Label>
                <Select value={toBoxId} onValueChange={setToBoxId} disabled={readonly}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue placeholder={`اختر صندوق ${transferCurrency}...`} /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 sticky top-0 bg-popover z-10 border-b">
                      <Input
                        placeholder="بحث..."
                        value={toSearch}
                        onChange={(e) => setToSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 text-xs"
                      />
                    </div>
                    {boxesForCurrency.filter(b => b.id !== fromBoxId).length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground text-center">لا يوجد صناديق بعملة {transferCurrency}</div>
                    )}
                    {boxesForCurrency.filter(b => b.id !== fromBoxId && (
                      !toSearch.trim() ||
                      b.name?.toLowerCase().includes(toSearch.toLowerCase()) ||
                      b.gl_account_code?.toLowerCase().includes(toSearch.toLowerCase())
                    )).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                          {b.name}
                          <span className="text-[10px] font-mono text-muted-foreground">{currencySymbols[b.currency||"ILS"]}{fmt(balances[b.gl_account_code] || 0)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-bold">التاريخ *</Label>
                <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} disabled={readonly} className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs font-bold">العملة</Label>
                <Select value={transferCurrency} onValueChange={setTransferCurrency} disabled={readonly}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(currencySymbols).map(([code, sym]) => (
                      <SelectItem key={code} value={code}>{sym} {code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold">المبلغ * ({curSym})</Label>
                <Input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00" disabled={readonly}
                  className={`mt-1 h-10 font-mono ${exceeds ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {exceeds && <p className="text-[10px] text-red-600 mt-1">المبلغ يتجاوز الرصيد ₪{fmt(fromBal)}</p>}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">البيان</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} disabled={readonly}
                placeholder={fromBox && toBox ? `تحويل نقدي: ${fromBox.name} → ${toBox.name}` : "البيان..."}
                className="mt-1 h-10" />
            </div>

            <div>
              <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} disabled={readonly} className="mt-1" />
            </div>

            {/* Journal Preview */}
            {fromBox && toBox && amountNum > 0 && (
              <div className="rounded-xl border overflow-hidden">
                <div className="p-2.5 bg-muted/30 text-xs font-bold flex items-center gap-2">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> القيد المحاسبي
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground border-t">
                      <th className="text-right p-2">الحساب</th>
                      <th className="text-right p-2 w-28">مدين</th>
                      <th className="text-right p-2 w-28">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-2">
                        <span className="text-emerald-600">●</span>{" "}
                        {isForeign ? (fxMainAccounts[transferCurrency] || toBox.gl_account_code) : toBox.gl_account_code} — {isForeign ? `صندوق ${transferCurrency} الرئيسي` : toBox.name}
                      </td>
                      <td className="p-2 font-mono font-bold">{curSym}{fmt(amountNum)}</td>
                      <td className="p-2"></td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-2">
                        <span className="text-red-600">●</span> {fromBox.gl_account_code} — {fromBox.name}
                      </td>
                      <td className="p-2"></td>
                      <td className="p-2 font-mono font-bold text-red-600">{curSym}{fmt(amountNum)}</td>
                    </tr>
                    <tr className="border-t bg-muted/30 font-bold">
                      <td className="p-2">الإجمالي</td>
                      <td className="p-2 font-mono">{curSym}{fmt(amountNum)}</td>
                      <td className="p-2 font-mono text-red-600">{curSym}{fmt(amountNum)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="p-1.5 text-center text-[10px] text-emerald-600 bg-emerald-50/50 border-t">✓ متوازن</div>
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
          <DialogHeader><DialogTitle>استعلام عن التحويلات</DialogTitle></DialogHeader>
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
                  <th className="text-right p-2">المبلغ</th>
                  <th className="text-right p-2">العملة</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuery.map(t => {
                  const fb = boxes.find(b => b.id === t.from_box_id);
                  const tb = boxes.find(b => b.id === t.to_box_id);
                  const sym = currencySymbols[t.currency || "ILS"] || "₪";
                  return (
                    <tr key={t.id} className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => { setQueryOpen(false); setSearchParams({ view: t.id }); }}>
                      <td className="p-2 text-xs">{fmtDateDisplay(t.transfer_date)}</td>
                      <td className="p-2 text-xs">{fb?.name || "—"}</td>
                      <td className="p-2 text-xs">{tb?.name || "—"}</td>
                      <td className="p-2 text-xs font-mono font-bold">{sym}{fmt(Number(t.amount))}</td>
                      <td className="p-2 text-xs">{t.currency || "ILS"}</td>
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
              <XCircle className="h-5 w-5" /> حذف التحويل؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم عكس القيد المحاسبي المرتبط (تعليمه كمحذوف) وحذف سجل التحويل من الأرشيف نهائياً.
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

export default CashTransferPage;

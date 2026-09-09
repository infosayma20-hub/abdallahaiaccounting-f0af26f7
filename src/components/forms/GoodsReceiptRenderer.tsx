import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Search, Save, Send, PackageCheck, AlertTriangle, StickyNote, Thermometer,
  CheckCircle2, XCircle, Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { GOODS_RECEIPT_CATEGORIES } from "@/lib/hr/goodsReceiptItems";

/**
 * Goods Receipt Renderer — «استلام المواد الأولية» (OPT-02)
 * ----------------------------------------------------------
 * يُستخدم عندما يكون schema.kind === "goods_receipt".
 * الأصناف ثابتة حسب النموذج المعتمد؛ الضغط على الصنف يفتح تعبئة سريعة
 * بخمسة حقول فقط: الكمية، الصلاحية/رقم الوجبة، المطابقة، درجة الحرارة (اختياري)، ملاحظات.
 *
 * form_data:
 * { kind, receipt_date, supplier, receiver, notes,
 *   entries: [{category,item,qty,expiry,conformity,temperature,note}],
 *   summary: { count, nonConform } }
 */

type Entry = {
  qty: string;
  expiry: string;
  conformity: string; // "مطابق" | "غير مطابق"
  temperature: string;
  note: string;
};

const EMPTY: Entry = { qty: "", expiry: "", conformity: "مطابق", temperature: "", note: "" };

interface Props {
  employeeId: string;
  templateId?: string;
  initialData?: Record<string, any>;
  submitting?: boolean;
  onSubmit?: (data: Record<string, any>) => void;
  onSaveDraft?: (data: Record<string, any>) => void;
  readOnly?: boolean;
  draftKey?: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function GoodsReceiptRenderer({
  initialData, submitting, onSubmit, onSaveDraft, readOnly, draftKey,
}: Props) {
  const localDraft = useMemo(() => {
    if (!draftKey || initialData) return null;
    try {
      const raw = localStorage.getItem(`gr-draft:${draftKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [draftKey, initialData]);

  const seed = initialData || localDraft || {};
  const [receiptDate, setReceiptDate] = useState<string>(seed.receipt_date || todayISO());
  const [supplier, setSupplier] = useState<string>(seed.supplier || "");
  const [receiver, setReceiver] = useState<string>(seed.receiver || "");
  const [notes, setNotes] = useState<string>(seed.notes || "");
  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const out: Record<string, Entry> = {};
    (Array.isArray(seed.entries) ? seed.entries : []).forEach((e: any) => {
      out[e.item] = {
        qty: String(e.qty ?? ""),
        expiry: e.expiry || "",
        conformity: e.conformity || "مطابق",
        temperature: e.temperature || "",
        note: e.note || "",
      };
    });
    return out;
  });

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [openItem, setOpenItem] = useState<{ item: string; category: string } | null>(null);
  const [dialogEntry, setDialogEntry] = useState<Entry>(EMPTY);

  const filtered = useMemo(() => {
    const q = search.trim();
    return GOODS_RECEIPT_CATEGORIES
      .filter((c) => activeCat === "all" || c.key === activeCat)
      .map((c) => ({ ...c, items: q ? c.items.filter((i) => i.includes(q)) : c.items }))
      .filter((c) => c.items.length > 0);
  }, [search, activeCat]);

  const filledCount = Object.keys(entries).length;
  const nonConformCount = Object.values(entries).filter((e) => e.conformity === "غير مطابق").length;

  const buildPayload = () => {
    const list = GOODS_RECEIPT_CATEGORIES.flatMap((c) =>
      c.items
        .filter((i) => entries[i])
        .map((i) => ({
          category: c.label,
          item: i,
          qty: entries[i].qty,
          expiry: entries[i].expiry,
          conformity: entries[i].conformity,
          temperature: entries[i].temperature,
          note: entries[i].note,
        }))
    );
    return {
      kind: "goods_receipt",
      receipt_date: receiptDate,
      supplier,
      receiver,
      notes,
      entries: list,
      summary: { count: list.length, nonConform: list.filter((l) => l.conformity === "غير مطابق").length },
    };
  };

  // مسودة محلية
  useEffect(() => {
    if (!draftKey || readOnly) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(`gr-draft:${draftKey}`, JSON.stringify(buildPayload())); } catch { /* noop */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, readOnly, receiptDate, supplier, receiver, notes, entries]);

  const openFill = (item: string, category: string) => {
    if (readOnly) return;
    setOpenItem({ item, category });
    setDialogEntry(entries[item] ? { ...entries[item] } : { ...EMPTY });
  };

  const saveEntry = () => {
    if (!openItem) return;
    if (!dialogEntry.qty.trim()) { toast({ title: "أدخل الكمية المستلمة", variant: "destructive" }); return; }
    setEntries((p) => ({ ...p, [openItem.item]: { ...dialogEntry } }));
    setOpenItem(null);
  };

  const clearEntry = () => {
    if (!openItem) return;
    setEntries((p) => { const n = { ...p }; delete n[openItem.item]; return n; });
    setOpenItem(null);
  };

  const handleSubmit = () => {
    if (!receiptDate) { toast({ title: "أدخل تاريخ الاستلام", variant: "destructive" }); return; }
    if (filledCount === 0) { toast({ title: "عبّئ صنفاً واحداً على الأقل", variant: "destructive" }); return; }
    onSubmit?.(buildPayload());
    if (draftKey) { try { localStorage.removeItem(`gr-draft:${draftKey}`); } catch { /* noop */ } }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0" dir="rtl">
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-4">
        <Card>
          <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">تاريخ الاستلام</Label>
              <Input type="date" value={receiptDate} disabled={readOnly}
                onChange={(e) => setReceiptDate(e.target.value)} className="h-10 text-right" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المورد</Label>
              <Input value={supplier} disabled={readOnly} placeholder="اسم المورد"
                onChange={(e) => setSupplier(e.target.value)} className="h-10 text-right" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المستلم</Label>
              <Input value={receiver} disabled={readOnly} placeholder="اسم المستلم"
                onChange={(e) => setReceiver(e.target.value)} className="h-10 text-right" />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary">
            <PackageCheck className="h-3.5 w-3.5" /> معبّأ: <b>{filledCount}</b>
          </span>
          {nonConformCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> غير مطابق: <b>{nonConformCount}</b>
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن صنف..." className="h-10 pr-9 text-right" />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[{ key: "all", label: "الكل" }, ...GOODS_RECEIPT_CATEGORIES].map((c) => (
            <button key={c.key} type="button" onClick={() => setActiveCat(c.key)}
              className={`shrink-0 h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
                activeCat === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/60"
              }`}>
              {c.label}
            </button>
          ))}
        </div>

        {filtered.map((c) => (
          <div key={c.key} className="border rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 bg-muted/50 text-[11px] font-semibold">{c.label}</div>
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {c.items.map((item) => {
                const e = entries[item];
                const bad = e?.conformity === "غير مطابق";
                return (
                  <button key={item} type="button" onClick={() => openFill(item, c.label)}
                    className={`flex items-center gap-2 text-right border-b border-l last:border-b-0 px-2.5 h-9 text-[12px] transition-colors ${
                      e ? (bad ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20") : "hover:bg-muted/40"
                    }`}>
                    <span className="flex-1 truncate">{item}</span>
                    {e ? (
                      <>
                        <b className="tabular-nums shrink-0">{e.qty}</b>
                        {e.expiry && <span className="text-[10px] text-muted-foreground shrink-0 max-w-[70px] truncate">{e.expiry}</span>}
                        {e.temperature && <span className="text-[10px] text-muted-foreground shrink-0">{e.temperature}°</span>}
                        {e.note && <StickyNote className="h-3 w-3 text-amber-500 shrink-0" />}
                        {bad ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground shrink-0">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}


        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><StickyNote className="h-3.5 w-3.5" /> ملاحظات المستلم</Label>
          <Textarea value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)}
            rows={3} className="text-right" placeholder="ملاحظات عامة على الاستلام (اختياري)" />
        </div>
      </div>

      {!readOnly && (
        <div className="shrink-0 flex gap-2 border-t bg-background/95 backdrop-blur py-3">
          {onSaveDraft && (
            <Button type="button" variant="outline" className="gap-1.5" disabled={submitting}
              onClick={() => onSaveDraft(buildPayload())}>
              <Save className="h-4 w-4" /> حفظ كمسودة
            </Button>
          )}
          <Button type="button" className="gap-1.5 flex-1" disabled={submitting} onClick={handleSubmit}>
            <Send className="h-4 w-4" /> إرسال النموذج
          </Button>
        </div>
      )}

      {/* تعبئة سريعة — 5 حقول فقط */}
      <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right text-base">{openItem?.item}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الكمية المستلمة</Label>
              <Input autoFocus inputMode="decimal" value={dialogEntry.qty}
                onChange={(e) => setDialogEntry({ ...dialogEntry, qty: e.target.value })}
                className="h-11 text-right" placeholder="مثال: 10 كغم" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">تاريخ انتهاء الصلاحية / رقم الوجبة</Label>
              <Input value={dialogEntry.expiry}
                onChange={(e) => setDialogEntry({ ...dialogEntry, expiry: e.target.value })}
                className="h-11 text-right" placeholder="مثال: 12/2026 أو L-4471" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المطابقة</Label>
              <div className="grid grid-cols-2 gap-2">
                {["مطابق", "غير مطابق"].map((v) => (
                  <button key={v} type="button"
                    onClick={() => setDialogEntry({ ...dialogEntry, conformity: v })}
                    className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${
                      dialogEntry.conformity === v
                        ? v === "مطابق"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-red-600 text-white border-red-600"
                        : "bg-card hover:bg-muted/60"
                    }`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">

              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1">
                  <Thermometer className="h-3 w-3" /> الحرارة (اختياري)
                </Label>
                <Input inputMode="decimal" value={dialogEntry.temperature}
                  onChange={(e) => setDialogEntry({ ...dialogEntry, temperature: e.target.value })}
                  className="h-10 text-right" placeholder="-18" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1">
                  <StickyNote className="h-3 w-3 text-amber-500" /> ملاحظة
                </Label>
                <Input value={dialogEntry.note}
                  onChange={(e) => setDialogEntry({ ...dialogEntry, note: e.target.value })}
                  className="h-10 text-right" placeholder="اختياري" />
              </div>
            </div>

          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {openItem && entries[openItem.item] && (
              <Button type="button" variant="ghost" className="text-red-600 gap-1.5" onClick={clearEntry}>
                <Trash2 className="h-4 w-4" /> حذف
              </Button>
            )}
            <Button type="button" className="flex-1" onClick={saveEntry}>حفظ الصنف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

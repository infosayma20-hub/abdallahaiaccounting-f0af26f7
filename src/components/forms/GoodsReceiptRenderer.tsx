import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search, Save, Send, PackageCheck, AlertTriangle, StickyNote, Thermometer,
  ChevronDown, Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { GOODS_RECEIPT_CATEGORIES } from "@/lib/hr/goodsReceiptItems";

/**
 * Goods Receipt Renderer — «استلام المواد الأولية» (OPT-02)
 * ----------------------------------------------------------
 * تعبئة مباشرة داخل الصف (بدون نوافذ منبثقة) — مثل الإكسل:
 * الكمية + الوحدة ظاهرة دائماً، وباقي الحقول (الصلاحية/المطابقة/الحرارة/ملاحظة)
 * تفتح بالضغط على سهم التوسيع داخل نفس الصف.
 *
 * form_data:
 * { kind, receipt_date, supplier, receiver, notes,
 *   entries: [{category,item,qty,unit,expiry,conformity,temperature,note}],
 *   summary: { count, nonConform } }
 */

type Entry = {
  qty: string;
  unit: string;
  expiry: string;
  conformity: string; // "مطابق" | "غير مطابق"
  temperature: string;
  note: string;
};

const EMPTY: Entry = { qty: "", unit: "", expiry: "", conformity: "مطابق", temperature: "", note: "" };

export const GOODS_RECEIPT_UNITS = [
  "كغم", "غم", "لتر", "مل", "حبة", "علبة", "كرتونة", "كيس", "شوال", "درزن", "رول", "صحن",
];

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

/** الصف يُعتبر معبّأ إذا في كمية أو أي تفصيل مكتوب. */
const isFilled = (e?: Entry) =>
  !!e && !!(e.qty.trim() || e.expiry.trim() || e.temperature.trim() || e.note.trim());

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
        unit: e.unit || "",
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
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim();
    return GOODS_RECEIPT_CATEGORIES
      .filter((c) => activeCat === "all" || c.key === activeCat)
      .map((c) => ({ ...c, items: q ? c.items.filter((i) => i.includes(q)) : c.items }))
      .filter((c) => c.items.length > 0);
  }, [search, activeCat]);

  const filledItems = useMemo(
    () => Object.entries(entries).filter(([, e]) => isFilled(e)).map(([k]) => k),
    [entries],
  );
  const filledCount = filledItems.length;
  const nonConformCount = filledItems.filter((k) => entries[k].conformity === "غير مطابق").length;

  const patch = (item: string, part: Partial<Entry>) =>
    setEntries((p) => ({ ...p, [item]: { ...EMPTY, ...(p[item] || {}), ...part } }));

  const clearItem = (item: string) =>
    setEntries((p) => { const n = { ...p }; delete n[item]; return n; });

  const buildPayload = () => {
    const list = GOODS_RECEIPT_CATEGORIES.flatMap((c) =>
      c.items
        .filter((i) => isFilled(entries[i]))
        .map((i) => ({
          category: c.label,
          item: i,
          qty: entries[i].qty,
          unit: entries[i].unit,
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
            <div className="px-2.5 py-1.5 bg-muted/50 text-[11px] font-semibold flex items-center justify-between">
              <span>{c.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">الكمية / الوحدة</span>
            </div>
            <div>
              {c.items.map((item) => {
                const e = entries[item] || EMPTY;
                const filled = isFilled(entries[item]);
                const bad = filled && e.conformity === "غير مطابق";
                const isOpen = expanded === item;
                return (
                  <div key={item}
                    className={`border-b last:border-b-0 transition-colors ${
                      bad ? "bg-red-50 dark:bg-red-950/20" : filled ? "bg-emerald-50 dark:bg-emerald-950/20" : ""
                    }`}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <span className="flex-1 truncate text-[12px]">{item}</span>

                      <Input
                        value={e.qty}
                        disabled={readOnly}
                        inputMode="decimal"
                        type="text"
                        placeholder="0"
                        onChange={(ev) => patch(item, { qty: ev.target.value })}
                        className="h-8 w-[68px] shrink-0 text-center text-[12px] px-1 tabular-nums bg-background"
                      />

                      <select
                        value={e.unit}
                        disabled={readOnly}
                        onChange={(ev) => patch(item, { unit: ev.target.value })}
                        className="h-8 w-[74px] shrink-0 rounded-md border border-input bg-background text-[11px] px-1 text-center"
                      >
                        <option value="">الوحدة</option>
                        {GOODS_RECEIPT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>

                      {filled && (
                        <button type="button" title="مطابق / غير مطابق" disabled={readOnly}
                          onClick={() => patch(item, { conformity: e.conformity === "غير مطابق" ? "مطابق" : "غير مطابق" })}
                          className={`shrink-0 h-8 px-2 rounded-md border text-[10px] font-semibold ${
                            bad ? "bg-red-600 text-white border-red-600" : "bg-emerald-600 text-white border-emerald-600"
                          }`}>
                          {bad ? "غير مطابق" : "مطابق"}
                        </button>
                      )}

                      <button type="button" onClick={() => setExpanded(isOpen ? null : item)}
                        className="shrink-0 h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60"
                        title="تفاصيل إضافية">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-2 pb-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">الصلاحية / رقم الوجبة</Label>
                          <Input value={e.expiry} disabled={readOnly}
                            onChange={(ev) => patch(item, { expiry: ev.target.value })}
                            className="h-8 text-right text-[11px] bg-background" placeholder="12/2026 أو L-4471" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] flex items-center gap-1">
                            <Thermometer className="h-3 w-3" /> الحرارة (اختياري)
                          </Label>
                          <Input value={e.temperature} disabled={readOnly} inputMode="decimal"
                            onChange={(ev) => patch(item, { temperature: ev.target.value })}
                            className="h-8 text-right text-[11px] bg-background" placeholder="-18" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] flex items-center gap-1">
                            <StickyNote className="h-3 w-3 text-amber-500" /> ملاحظة
                          </Label>
                          <div className="flex gap-1">
                            <Input value={e.note} disabled={readOnly}
                              onChange={(ev) => patch(item, { note: ev.target.value })}
                              className="h-8 text-right text-[11px] bg-background flex-1" placeholder="اختياري" />
                            {!readOnly && filled && (
                              <Button type="button" variant="ghost" size="icon"
                                className="h-8 w-8 text-red-600 shrink-0"
                                onClick={() => { clearItem(item); setExpanded(null); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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
    </div>
  );
}

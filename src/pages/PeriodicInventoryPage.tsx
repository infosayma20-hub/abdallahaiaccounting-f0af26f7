import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import { usePeriodicInventory } from "@/hooks/usePeriodicInventory";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "@/hooks/use-toast";
import { Save, Send, Undo2, Trash2, FileBarChart, AlertCircle, ArrowRight } from "lucide-react";

const fmt = (n: number) =>
  `₪${(Number(n) || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PeriodicInventoryPage = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "جرد بضاعة آخر المدة";
    return () => { document.title = prev; };
  }, []);
  const { items, loading, saveDraft, post, reverse, remove, refresh } = usePeriodicInventory();
  const { settings } = useCompanySettings();
  const enabled = !!settings?.periodic_inventory_enabled;

  const [periodStart, setPeriodStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [openingValue, setOpeningValue] = useState("");
  const [closingValue, setClosingValue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const costingMethod = settings?.periodic_disclosure_method || "weighted_avg";

  const previewJv = useMemo(() => {
    const op = Number(openingValue) || 0;
    const cl = Number(closingValue) || 0;
    return { opening: op, closing: cl };
  }, [openingValue, closingValue]);

  const handleSaveAndPost = async () => {
    if (!periodStart || !periodEnd) {
      toast({ title: "الفترة مطلوبة", variant: "destructive" });
      return;
    }
    const op = Number(openingValue) || 0;
    const cl = Number(closingValue) || 0;
    if (op < 0 || cl < 0) {
      toast({ title: "لا يمكن إدخال قيمة سالبة", variant: "destructive" });
      return;
    }
    if (op === 0 && cl === 0) {
      toast({ title: "أدخل قيمة أول المدة أو آخر المدة على الأقل", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const id = await saveDraft({
        period_start: periodStart,
        period_end: periodEnd,
        opening_value: op,
        closing_value: cl,
        costing_method: costingMethod,
        notes: notes.trim() || null,
      });
      await post(id);
      toast({ title: "تم ترحيل قيد جرد آخر المدة بنجاح ✅" });
      setOpeningValue("");
      setClosingValue("");
      setNotes("");
    } catch (e: any) {
      toast({ title: "فشل الترحيل", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReverse = async (id: string) => {
    if (!confirm("عكس القيد المُرحّل؟ سيتم تسويد قيدَي التسوية.")) return;
    try {
      await reverse(id);
      toast({ title: "تم عكس القيد" });
    } catch (e: any) {
      toast({ title: "فشل العكس", description: e?.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("حذف المسودة نهائياً؟")) return;
    try {
      await remove(id);
      toast({ title: "تم الحذف" });
    } catch (e: any) {
      toast({ title: "فشل الحذف", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-primary" />
            جرد بضاعة آخر المدة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تسجيل قيمة المخزون في نهاية الفترة وترحيل قيود التسوية تلقائياً وفق IAS 2.
          </p>
        </div>
        <Link to="/profit-loss" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          الذهاب إلى قائمة الدخل <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {!enabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              نظام الجرد الدوري غير مفعّل
            </p>
            <p className="text-amber-800 dark:text-amber-200 mt-1">
              فعّله من الإعدادات ← المخزون ← «نظام الجرد وبضاعة آخر المدة» قبل ترحيل أي قيد.
            </p>
            <Link to="/settings?tab=inventory" className="inline-block mt-2 text-primary hover:underline text-xs">
              فتح الإعدادات ←
            </Link>
          </div>
        </div>
      )}

      {/* Entry form */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-bold text-sm">إدخال جرد جديد</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">بداية الفترة</label>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">نهاية الفترة (تاريخ الجرد)</label>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-background text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              قيمة بضاعة أول المدة (₪)
            </label>
            <input type="number" min="0" step="0.01" value={openingValue}
              onChange={e => setOpeningValue(e.target.value)} placeholder="0.00"
              className="w-full border rounded px-3 py-2 bg-background text-sm font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">
              إذا كانت هذه أول فترة جرد، أدخل 0.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              قيمة بضاعة آخر المدة (₪) — قيمة الجرد الفعلي
            </label>
            <input type="number" min="0" step="0.01" value={closingValue}
              onChange={e => setClosingValue(e.target.value)} placeholder="0.00"
              className="w-full border rounded px-3 py-2 bg-background text-sm font-mono" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">ملاحظات</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border rounded px-3 py-2 bg-background text-sm"
            placeholder="اختياري — لجنة الجرد، مرجع المستند..." />
        </div>

        {/* JV preview */}
        {(previewJv.opening > 0 || previewJv.closing > 0) && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-2 text-xs">
            <p className="font-bold">معاينة قيود التسوية:</p>
            {previewJv.opening > 0 && (
              <div className="font-mono">
                <div>Dr 5101 بضاعة أول المدة &nbsp;&nbsp;&nbsp;{fmt(previewJv.opening)}</div>
                <div className="pr-6">Cr 1148 مخزون أول المدة &nbsp;&nbsp;&nbsp;{fmt(previewJv.opening)}</div>
              </div>
            )}
            {previewJv.closing > 0 && (
              <div className="font-mono mt-2">
                <div>Dr 1149 مخزون آخر المدة &nbsp;&nbsp;{fmt(previewJv.closing)}</div>
                <div className="pr-6">Cr 5102 بضاعة آخر المدة &nbsp;&nbsp;{fmt(previewJv.closing)}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            disabled={saving || !enabled}
            onClick={handleSaveAndPost}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {saving ? "جاري الترحيل..." : "حفظ وترحيل"}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="rounded-lg border bg-card">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-sm">سجل عمليات الجرد</h2>
          <button onClick={refresh} className="text-xs text-primary hover:underline">تحديث</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-2 text-right">الفترة</th>
                <th className="p-2 text-right">أول المدة</th>
                <th className="p-2 text-right">آخر المدة</th>
                <th className="p-2 text-right">التقييم</th>
                <th className="p-2 text-right">الحالة</th>
                <th className="p-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد عمليات جرد بعد</td></tr>
              ) : items.map(it => (
                <tr key={it.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{it.period_start} → {it.period_end}</td>
                  <td className="p-2 font-mono">{fmt(it.opening_value)}</td>
                  <td className="p-2 font-mono">{fmt(it.closing_value)}</td>
                  <td className="p-2 text-xs">{it.costing_method === "fifo" ? "FIFO" : "متوسط مرجّح"}</td>
                  <td className="p-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                      it.status === "posted" ? "bg-emerald-100 text-emerald-800" :
                      it.status === "reversed" ? "bg-red-100 text-red-800" :
                      "bg-amber-100 text-amber-800"
                    }`}>
                      {it.status === "posted" ? "مُرحّل" : it.status === "reversed" ? "معكوس" : "مسودة"}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {it.status === "posted" && (
                        <button onClick={() => handleReverse(it.id)} title="عكس القيد"
                          className="p-1.5 rounded hover:bg-muted text-amber-700">
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                      {it.status === "draft" && (
                        <button onClick={() => handleDelete(it.id)} title="حذف المسودة"
                          className="p-1.5 rounded hover:bg-muted text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        وفقاً لـ IAS 2 §34 و IAS 1 §54(g). الحسابات المستخدمة: 1148 / 1149 / 5101 / 5102 — محمية من الترحيل اليدوي.
      </p>
    </div>
  );
};

export default PeriodicInventoryPage;

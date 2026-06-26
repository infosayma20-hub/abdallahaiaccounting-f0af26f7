import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

type Bill = {
  id: string; bill_number: string; supplier_id: string | null;
  bill_date: string; due_date: string | null; status: string;
  total: number; paid_amount: number; balance_due: number; currency: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-amber-100 text-amber-800" },
  posted: { label: "مُرحَّلة", cls: "bg-blue-100 text-blue-800" },
  paid: { label: "مدفوعة", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "ملغية", cls: "bg-red-100 text-red-800" },
};

export default function SpartaBillsPage() {
  const [items, setItems] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    bill_number: "", supplier_id: "", bill_date: new Date().toISOString().slice(0, 10),
    due_date: "", subtotal: 0, tax_amount: 0, notes: "", post_now: true,
  });
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("sparta_bills" as any).select("*").eq("company_id", SPARTA_HOLDING_ID).order("bill_date", { ascending: false }).limit(200);
    if (error) toast.error(error.message);
    setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); supabase.from("sparta_customers" as any).select("id,name").eq("company_id", SPARTA_HOLDING_ID).then(({ data }) => setSuppliers((data as any) || [])); }, []);

  const save = async () => {
    if (!form.bill_number) return toast.error("رقم الفاتورة مطلوب");
    const total = Number(form.subtotal) + Number(form.tax_amount);
    const { error } = await supabase.from("sparta_bills" as any).insert({
      company_id: SPARTA_HOLDING_ID,
      bill_number: form.bill_number,
      supplier_id: form.supplier_id || null,
      bill_date: form.bill_date,
      due_date: form.due_date || null,
      subtotal: form.subtotal, tax_amount: form.tax_amount, total,
      balance_due: total,
      status: form.post_now ? "posted" : "draft",
      notes: form.notes,
    });
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الفاتورة");
    setShowNew(false);
    setForm({ bill_number: "", supplier_id: "", bill_date: new Date().toISOString().slice(0, 10), due_date: "", subtotal: 0, tax_amount: 0, notes: "", post_now: true });
    load();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">فواتير المشتريات (AP)</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded border" title="تحديث"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-sm"><Plus className="h-4 w-4" /> فاتورة جديدة</button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div> :
          items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لا توجد فواتير</div> :
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs"><tr>
                <th className="text-right p-2">الرقم</th><th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">الاستحقاق</th><th className="text-right p-2">الإجمالي</th>
                <th className="text-right p-2">المدفوع</th><th className="text-right p-2">المتبقي</th>
                <th className="text-right p-2">الحالة</th>
              </tr></thead>
              <tbody>
                {items.map(b => (
                  <tr key={b.id} className="border-t">
                    <td className="p-2 font-mono">{b.bill_number}</td>
                    <td className="p-2">{b.bill_date}</td>
                    <td className="p-2">{b.due_date || "-"}</td>
                    <td className="p-2 font-mono">{Number(b.total).toFixed(2)}</td>
                    <td className="p-2 font-mono text-emerald-700">{Number(b.paid_amount).toFixed(2)}</td>
                    <td className="p-2 font-mono text-amber-700">{Number(b.balance_due).toFixed(2)}</td>
                    <td className="p-2"><span className={`text-[11px] px-2 py-0.5 rounded ${STATUS[b.status]?.cls || ""}`}>{STATUS[b.status]?.label || b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-background rounded-lg p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">فاتورة مورد جديدة</h3>
              <button onClick={() => setShowNew(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2"><label>رقم الفاتورة</label><input value={form.bill_number} onChange={e => setForm({ ...form, bill_number: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div className="col-span-2"><label>المورد</label>
                <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background">
                  <option value="">— اختر —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label>تاريخ الفاتورة</label><input type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div><label>تاريخ الاستحقاق</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div><label>المبلغ قبل الضريبة</label><input type="number" value={form.subtotal} onChange={e => setForm({ ...form, subtotal: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div><label>الضريبة</label><input type="number" value={form.tax_amount} onChange={e => setForm({ ...form, tax_amount: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div className="col-span-2"><label>ملاحظات</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={form.post_now} onChange={e => setForm({ ...form, post_now: e.target.checked })} /> ترحيل القيد مباشرة</label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded border text-sm">إلغاء</button>
              <button onClick={save} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
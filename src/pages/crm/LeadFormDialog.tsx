import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { LEAD_SOURCES, LEAD_STATUS_META, type CrmLead, PRIORITY_META } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lead?: CrmLead | null;
}

export default function LeadFormDialog({ open, onClose, onSaved, lead }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    title: lead?.title || "",
    status: lead?.status || "new",
    contact_name: lead?.contact_name || "",
    company_name: lead?.company_name || "",
    phone: lead?.phone || "",
    whatsapp: lead?.whatsapp || "",
    email: lead?.email || "",
    city: lead?.city || "",
    industry: lead?.industry || "",
    source: lead?.source || "manual",
    estimated_value: lead?.estimated_value || 0,
    probability: lead?.probability || 20,
    interested_products: lead?.interested_products || "",
    priority: lead?.priority || "medium",
    notes: lead?.notes || "",
    next_activity_date: lead?.next_activity_date || "",
  }));

  const set = <K extends keyof typeof form>(k: K, v: any) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!user) return;
    if (!form.title.trim()) {
      toast.error("عنوان العميل المحتمل مطلوب");
      return;
    }
    setSaving(true);
    const payload: any = {
      ...form,
      user_id: user.id,
      estimated_value: Number(form.estimated_value) || 0,
      probability: Number(form.probability) || 0,
      next_activity_date: form.next_activity_date || null,
    };

    const { error } = lead
      ? await supabase.from("crm_leads").update(payload).eq("id", lead.id)
      : await supabase.from("crm_leads").insert(payload);

    setSaving(false);
    if (error) {
      toast.error("تعذر الحفظ: " + error.message);
      return;
    }
    toast.success(lead ? "تم تحديث العميل المحتمل" : "تم إنشاء عميل محتمل جديد");
    onSaved();
    onClose();
  };

  const fld = "h-9 w-full rounded-md border border-slate-200 px-3 text-[13px] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none bg-white";
  const lbl = "block text-[11px] font-semibold text-slate-700 mb-1";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-base">
            {lead ? "تعديل عميل محتمل" : "عميل محتمل جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Section: Basic */}
          <div>
            <div className="text-[11px] font-bold text-blue-700 mb-2">المعلومات الأساسية</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={lbl}>عنوان الفرصة / الاهتمام *</label>
                <input className={fld} value={form.title} onChange={(e) => set("title", e.target.value)}
                  placeholder="مثال: استفسار عن نظام محاسبة" />
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>الحالة</label>
                <select className={fld} value={form.status} onChange={(e) => set("status", e.target.value as any)}>
                  {Object.entries(LEAD_STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>اسم الشخص</label>
                <input className={fld} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>اسم الشركة</label>
                <input className={fld} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Section: Contact */}
          <div>
            <div className="text-[11px] font-bold text-blue-700 mb-2">وسائل التواصل</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={lbl}>الهاتف</label>
                <input className={fld} value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className={lbl}>واتساب</label>
                <input className={fld} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className={lbl}>البريد</label>
                <input className={fld} value={form.email} onChange={(e) => set("email", e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className={lbl}>المدينة</label>
                <input className={fld} value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>القطاع / الصناعة</label>
                <input className={fld} value={form.industry} onChange={(e) => set("industry", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>المصدر</label>
                <select className={fld} value={form.source} onChange={(e) => set("source", e.target.value)}>
                  {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Sales */}
          <div>
            <div className="text-[11px] font-bold text-blue-700 mb-2">معلومات البيع</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={lbl}>القيمة المتوقعة (₪)</label>
                <input type="number" className={fld} value={form.estimated_value}
                  onChange={(e) => set("estimated_value", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>احتمالية الإغلاق %</label>
                <input type="number" min={0} max={100} className={fld} value={form.probability}
                  onChange={(e) => set("probability", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>الأولوية</label>
                <select className={fld} value={form.priority} onChange={(e) => set("priority", e.target.value as any)}>
                  {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>المنتجات / الخدمات المطلوبة</label>
                <input className={fld} value={form.interested_products}
                  onChange={(e) => set("interested_products", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>تاريخ المتابعة القادمة</label>
                <input type="date" className={fld} value={form.next_activity_date}
                  onChange={(e) => set("next_activity_date", e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>ملاحظات</label>
            <textarea className={`${fld} h-20 py-2 resize-none`} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "جاري الحفظ..." : lead ? "حفظ التعديلات" : "إنشاء العميل المحتمل"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

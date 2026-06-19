// Minimal activity form dialog — create CRM activity scoped to a contact.
// Reuses crm_activities; works as a side-effect helper inside Customer 360.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { X } from "lucide-react";
import { ACTIVITY_META } from "../types";
import type { CrmActivityType, CrmPriority } from "../types";

interface Props {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSaved: () => void;
}

const ACTIVITY_TYPES: CrmActivityType[] = [
  "call", "whatsapp", "meeting", "visit", "email",
  "quote_sent", "collection_reminder", "internal_review", "note",
];

export default function QuickActivityDialog({ open, contactId, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    activity_type: "call" as CrmActivityType,
    title: "",
    description: "",
    due_date: "",
    priority: "medium" as CrmPriority,
  });

  if (!open) return null;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!user || !form.title.trim()) {
      toast.error("الرجاء إدخال عنوان للمتابعة");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("crm_activities").insert({
      user_id: dataOwnerId!,
      contact_id: contactId,
      activity_type: form.activity_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: "pending",
    } as any);
    setSaving(false);
    if (error) {
      toast.error("تعذّر حفظ المتابعة");
      return;
    }
    toast.success("تمت إضافة المتابعة");
    onSaved();
    onClose();
  };

  const fld = "h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-400";
  const lbl = "block text-[11px] font-semibold text-slate-700 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">إضافة متابعة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className={lbl}>النوع</label>
            <select className={fld} value={form.activity_type} onChange={(e) => set("activity_type", e.target.value as CrmActivityType)}>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>{ACTIVITY_META[t].icon} {ACTIVITY_META[t].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>العنوان *</label>
            <input className={fld} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="مثال: متابعة عرض السعر" />
          </div>
          <div>
            <label className={lbl}>الوصف</label>
            <textarea
              className="min-h-[60px] w-full rounded-lg border border-slate-200 p-2 text-[13px] outline-none focus:border-blue-400"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>تاريخ الاستحقاق</label>
              <input type="date" className={fld} value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>الأولوية</label>
              <select className={fld} value={form.priority} onChange={(e) => set("priority", e.target.value as CrmPriority)}>
                <option value="low">منخفضة</option>
                <option value="medium">عادية</option>
                <option value="high">عالية</option>
                <option value="urgent">عاجلة</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200">إلغاء</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

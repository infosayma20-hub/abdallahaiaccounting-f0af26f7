import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { PRIORITY_META, STAGE_META, STAGES_ORDER, type CrmOpportunity } from "./types";
import { useCustomer360 } from "./hooks/useCustomer360";
import { evaluateCreditDecision } from "./lib/policyEngine";
import CustomerPolicyBadge from "./components/CustomerPolicyBadge";
import CreditWarningBanner from "./components/CreditWarningBanner";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  opportunity?: CrmOpportunity | null;
  defaultStage?: string;
}

interface ContactOption { id: string; contact_name: string; contact_class: string | null; }

export default function OpportunityFormDialog({ open, onClose, onSaved, opportunity, defaultStage }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [form, setForm] = useState(() => ({
    title: opportunity?.title || "",
    description: opportunity?.description || "",
    contact_id: opportunity?.contact_id || "",
    customer_name: opportunity?.customer_name || "",
    expected_value: opportunity?.expected_value || 0,
    probability: opportunity?.probability || 50,
    stage: opportunity?.stage || (defaultStage as any) || "new",
    expected_close_date: opportunity?.expected_close_date || "",
    priority: opportunity?.priority || "medium",
    notes: opportunity?.notes || "",
    lost_reason: opportunity?.lost_reason || "",
  }));

  // Live read of selected contact's policy + financials
  const { contact, policy, financials } = useCustomer360(form.contact_id || null);

  const proposedAmount = Number(form.expected_value) || 0;
  const decision = evaluateCreditDecision(contact, policy, financials, proposedAmount);

  useEffect(() => {
    if (!open || !user) return;
    supabase.from("contacts")
      .select("id, contact_name, contact_class")
      .eq("user_id", dataOwnerId!)
      .eq("is_archived", false)
      .order("contact_name")
      .limit(500)
      .then(({ data }) => setContacts((data as ContactOption[]) || []));
  }, [open, user]);

  const set = <K extends keyof typeof form>(k: K, v: any) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!user) return;
    if (!form.title.trim()) { toast.error("عنوان الفرصة مطلوب"); return; }

    // Hard block per policy if Class D + no override
    if (form.contact_id && !decision.canSellOnCredit && form.stage !== "lost") {
      const ok = window.confirm(
        "تنبيه السياسة: هذا العميل ممنوع من البيع الآجل (فئة D). هل أنت متأكد من إنشاء الفرصة؟"
      );
      if (!ok) return;
    }

    setSaving(true);
    const payload: any = {
      ...form,
      user_id: user.id,
      contact_id: form.contact_id || null,
      expected_value: Number(form.expected_value) || 0,
      probability: Number(form.probability) || 0,
      expected_close_date: form.expected_close_date || null,
      lost_reason: form.stage === "lost" ? form.lost_reason : null,
    };

    const { error } = opportunity
      ? await supabase.from("crm_opportunities").update(payload).eq("id", opportunity.id)
      : await supabase.from("crm_opportunities").insert(payload);

    setSaving(false);
    if (error) { toast.error("تعذر الحفظ: " + error.message); return; }
    toast.success(opportunity ? "تم تحديث الفرصة" : "تم إنشاء فرصة جديدة");
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
            {opportunity ? "تعديل فرصة" : "فرصة جديدة"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className={lbl}>عنوان الفرصة *</label>
            <input className={fld} value={form.title} onChange={(e) => set("title", e.target.value)}
              placeholder="مثال: عقد توريد سنوي - شركة الهلال" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>العميل (من قاعدة العملاء الرئيسية)</label>
              <select className={fld} value={form.contact_id} onChange={(e) => {
                const cid = e.target.value;
                set("contact_id", cid);
                const c = contacts.find(x => x.id === cid);
                if (c) set("customer_name", c.contact_name);
              }}>
                <option value="">— اختر عميل أو اكتب اسم جديد —</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.contact_name}{c.contact_class ? ` [${c.contact_class}]` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>اسم العميل (إن لم يكن مسجلاً)</label>
              <input className={fld} value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
            </div>
          </div>

          {/* Live policy snapshot */}
          {form.contact_id && contact && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <CustomerPolicyBadge contact={contact} policy={policy} size="md" />
                  {policy && (
                    <span className="text-[11px] text-slate-600">
                      مدة سداد: <b>{policy.payment_terms_days ?? decision.recommendedTermsDays}</b> يوم
                      {policy.discount_pct ? ` · خصم: ${policy.discount_pct}٪` : ""}
                    </span>
                  )}
                </div>
                {decision.effectiveLimit > 0 && (
                  <span className="text-[10px] text-slate-500">
                    سقف: <b>{decision.effectiveLimit.toFixed(0)} ₪</b> · متاح: <b>{decision.available.toFixed(0)} ₪</b>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Credit warning banner */}
          {form.contact_id && (decision.warnings.length > 0 || proposedAmount > 0) && (
            <CreditWarningBanner decision={decision} proposedAmount={proposedAmount} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>القيمة المتوقعة (₪)</label>
              <input type="number" className={fld} value={form.expected_value}
                onChange={(e) => set("expected_value", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>الاحتمالية %</label>
              <input type="number" min={0} max={100} className={fld} value={form.probability}
                onChange={(e) => set("probability", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>الأولوية</label>
              <select className={fld} value={form.priority} onChange={(e) => set("priority", e.target.value as any)}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>المرحلة</label>
              <select className={fld} value={form.stage} onChange={(e) => set("stage", e.target.value as any)}>
                {STAGES_ORDER.map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
                <option value="on_hold">معلّق</option>
              </select>
            </div>
            <div>
              <label className={lbl}>تاريخ الإغلاق المتوقع</label>
              <input type="date" className={fld} value={form.expected_close_date}
                onChange={(e) => set("expected_close_date", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>القيمة المرجحة (تلقائية)</label>
              <input className={`${fld} bg-slate-50 text-slate-500`} disabled
                value={(Number(form.expected_value) * Number(form.probability) / 100).toFixed(2) + " ₪"} />
            </div>
          </div>

          {form.stage === "lost" && (
            <div>
              <label className={lbl}>سبب الخسارة</label>
              <input className={fld} value={form.lost_reason} onChange={(e) => set("lost_reason", e.target.value)}
                placeholder="مثال: السعر مرتفع، اختار منافس..." />
            </div>
          )}

          <div>
            <label className={lbl}>الوصف / التفاصيل</label>
            <textarea className={`${fld} h-16 py-2 resize-none`} value={form.description}
              onChange={(e) => set("description", e.target.value)} />
          </div>

          <div>
            <label className={lbl}>ملاحظات داخلية</label>
            <textarea className={`${fld} h-16 py-2 resize-none`} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "جاري الحفظ..." : opportunity ? "حفظ التعديلات" : "إنشاء الفرصة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

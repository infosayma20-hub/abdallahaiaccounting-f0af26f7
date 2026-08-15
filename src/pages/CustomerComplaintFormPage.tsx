import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { FinanceShell, FastTabs, type ActionTab } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Save, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export function dayName(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return AR_DAYS[d.getDay()];
}
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface BranchOption { id: string; name: string }

const emptyForm = () => ({
  customer_name: "",
  phone: "",
  complaint_date: todayStr(),
  branch_id: "",
  invoice_number: "",
  details: "",
  follow_up_method: "",
  responder: "",
  compensated: false,
  notes: "",
});

export default function CustomerComplaintFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    const { data: br } = await supabase
      .from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name");
    setBranches((br || []) as BranchOption[]);
    if (isNew) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_complaints")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) { toast.error("الشكوى غير موجودة"); navigate("/customer-complaints", { replace: true }); return; }
      setForm({
        customer_name: data.customer_name || "",
        phone: data.phone || "",
        complaint_date: data.complaint_date || todayStr(),
        branch_id: data.branch_id || "",
        invoice_number: data.invoice_number || "",
        details: data.details || "",
        follow_up_method: data.follow_up_method || "",
        responder: data.responder || "",
        compensated: !!data.compensated,
        notes: data.notes || "",
      });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل الشكوى");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId, id, isNew, navigate]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!dataOwnerId) { toast.error("لا يوجد سياق شركة"); return; }
    if (!form.customer_name.trim()) { toast.error("اسم الزبون مطلوب"); return; }
    if (!form.details.trim()) { toast.error("تفاصيل الشكوى مطلوبة"); return; }
    setSaving(true);
    try {
      const payload = {
        user_id: dataOwnerId,
        customer_name: form.customer_name.trim().slice(0, 120),
        phone: form.phone.trim().slice(0, 30) || null,
        complaint_date: form.complaint_date || todayStr(),
        branch_id: form.branch_id || null,
        invoice_number: form.invoice_number.trim().slice(0, 60) || null,
        details: form.details.trim().slice(0, 4000),
        follow_up_method: form.follow_up_method.trim().slice(0, 300) || null,
        responder: form.responder.trim().slice(0, 120) || null,
        compensated: form.compensated,
        notes: form.notes.trim().slice(0, 2000) || null,
      };
      if (isNew) {
        const { data, error } = await supabase
          .from("customer_complaints")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        toast.success("تم تسجيل الشكوى");
        navigate(`/customer-complaints/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from("customer_complaints").update(payload).eq("id", id!);
        if (error) throw error;
        toast.success("تم حفظ التعديلات");
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    if (!window.confirm("هل تريد حذف هذه الشكوى نهائياً؟")) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("customer_complaints").delete().eq("id", id!);
      if (error) throw error;
      toast.success("تم حذف الشكوى");
      navigate("/customer-complaints", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحذف");
    } finally {
      setDeleting(false);
    }
  };

  const actionTabs: ActionTab[] = useMemo(() => [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "save",
          label: "حفظ",
          items: [
            { key: "save", label: saving ? "جارٍ الحفظ..." : "حفظ", icon: Save, variant: "primary", disabled: saving, onClick: () => void save() },
            { key: "new", label: "شكوى جديدة", icon: Plus, onClick: () => navigate("/customer-complaints/new") },
          ],
        },
        {
          key: "nav",
          label: "إجراءات",
          items: [
            { key: "back", label: "رجوع", icon: ArrowRight, onClick: () => navigate("/customer-complaints") },
            ...(isNew ? [] : [{ key: "del", label: "حذف", icon: Trash2, variant: "danger" as const, disabled: deleting, onClick: () => void remove() }]),
          ],
        },
      ],
    },
  ], [saving, deleting, isNew, form, dataOwnerId]);

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <FinanceShell
        title={isNew ? "تسجيل شكوى جديدة" : "تعديل شكوى"}
        breadcrumb={[{ label: "شكاوى الزبائن", href: "/customer-complaints" }, { label: isNew ? "جديدة" : form.customer_name || "شكوى" }]}
        actionTabs={actionTabs}
      >
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-3 md:p-4 max-w-5xl mx-auto pb-24">
            <FastTabs
              items={[
                {
                  key: "customer",
                  title: "بيانات الزبون",
                  summary: form.customer_name || "—",
                  defaultOpen: true,
                  children: (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>الاسم *</Label>
                        <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} maxLength={120} />
                      </div>
                      <div className="space-y-1">
                        <Label>الرقم</Label>
                        <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" maxLength={30} />
                      </div>
                      <div className="space-y-1">
                        <Label>الفرع</Label>
                        <Select value={form.branch_id || "none"} onValueChange={(v) => set("branch_id", v === "none" ? "" : v)}>
                          <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون</SelectItem>
                            {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>التاريخ</Label>
                        <Input type="date" value={form.complaint_date} onChange={(e) => set("complaint_date", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>اليوم</Label>
                        <Input value={dayName(form.complaint_date)} readOnly className="bg-muted" />
                      </div>
                      <div className="space-y-1">
                        <Label>رقم الفاتورة (إن وجد)</Label>
                        <Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} maxLength={60} />
                      </div>
                    </div>
                  ),
                },
                {
                  key: "details",
                  title: "تفاصيل الشكوى",
                  summary: form.details ? `${form.details.slice(0, 40)}…` : "—",
                  defaultOpen: true,
                  children: (
                    <div className="space-y-1">
                      <Label>تفاصيل الشكوى *</Label>
                      <Textarea rows={5} value={form.details} onChange={(e) => set("details", e.target.value)} maxLength={4000} />
                    </div>
                  ),
                },
                {
                  key: "followup",
                  title: "المتابعة والمعالجة",
                  summary: form.compensated ? "✅ تم التعويض" : "❌ بدون تعويض",
                  defaultOpen: true,
                  children: (
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label>آلية المتابعة</Label>
                        <Textarea rows={3} value={form.follow_up_method} onChange={(e) => set("follow_up_method", e.target.value)} maxLength={300} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>المستجيب للشكوى</Label>
                          <Input value={form.responder} onChange={(e) => set("responder", e.target.value)} maxLength={120} />
                        </div>
                        <div className="flex items-center justify-between border rounded-md p-3 self-end">
                          <Label className="text-sm">تم التعويض</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{form.compensated ? "✅ نعم" : "❌ لا"}</span>
                            <Switch checked={form.compensated} onCheckedChange={(v) => set("compensated", v)} />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>ملاحظات</Label>
                        <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </FinanceShell>

      {/* Sticky mobile-friendly save bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-card border-t p-2 flex gap-2 justify-end">
        <Button variant="outline" onClick={() => navigate("/customer-complaints")} className="gap-1">
          <ArrowRight className="w-4 h-4" /> رجوع
        </Button>
        <Button onClick={() => void save()} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
        </Button>
      </div>
    </div>
  );
}
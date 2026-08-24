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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Save, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PARTY_KINDS, COMP_STATUSES, COMP_CURRENCIES, CURRENCY_SYMBOLS } from "./CompensationsPage";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function dayName(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return AR_DAYS[d.getDay()];
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface BranchOption { id: string; name: string }
interface EmployeeOption { id: string; full_name: string }
interface ContactOption { id: string; contact_name: string }
interface ComplaintOption { id: string; customer_name: string; complaint_date: string }

const emptyForm = () => ({
  party_kind: "موظف" as string,
  party_name: "",
  employee_id: "",
  contact_id: "",
  branch_id: "",
  complaint_id: "",
  compensation_date: todayStr(),
  amount: "",
  currency: "ILS",
  details: "",
  status: "قيد المتابعة" as string,
  notes: "",
});

export default function CompensationFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [complaints, setComplaints] = useState<ComplaintOption[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    const [{ data: br }, { data: emps }, { data: cts }, { data: comps }] = await Promise.all([
      supabase.from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      supabase.from("employees").select("id, full_name").eq("user_id", dataOwnerId).eq("is_active", true).order("full_name"),
      supabase.from("contacts").select("id, contact_name").eq("user_id", dataOwnerId).eq("is_active", true).order("contact_name").limit(500),
      supabase.from("customer_complaints").select("id, customer_name, complaint_date").eq("user_id", dataOwnerId).order("complaint_date", { ascending: false }).limit(200),
    ]);
    setBranches((br || []) as BranchOption[]);
    setEmployees((emps || []) as EmployeeOption[]);
    setContacts((cts || []) as ContactOption[]);
    setComplaints((comps || []) as ComplaintOption[]);
    if (isNew) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("compensations")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) { toast.error("التعويض غير موجود"); navigate("/compensations", { replace: true }); return; }
      setForm({
        party_kind: data.party_kind || "أخرى",
        party_name: data.party_name || "",
        employee_id: data.employee_id || "",
        contact_id: data.contact_id || "",
        branch_id: data.branch_id || "",
        complaint_id: data.complaint_id || "",
        compensation_date: data.compensation_date || todayStr(),
        amount: data.amount != null ? String(data.amount) : "",
        currency: data.currency || "ILS",
        details: data.details || "",
        status: data.status || "قيد المتابعة",
        notes: data.notes || "",
      });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل التعويض");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId, id, isNew, navigate]);

  useEffect(() => { void load(); }, [load]);

  const pickEmployee = (empId: string) => {
    if (empId === "none") { set("employee_id", ""); return; }
    const emp = employees.find(e => e.id === empId);
    setForm(f => ({ ...f, employee_id: empId, party_name: emp?.full_name || f.party_name }));
  };

  const pickContact = (ctId: string) => {
    if (ctId === "none") { set("contact_id", ""); return; }
    const ct = contacts.find(c => c.id === ctId);
    setForm(f => ({ ...f, contact_id: ctId, party_name: ct?.contact_name || f.party_name }));
  };

  const isEmployeeKind = form.party_kind === "موظف";
  const isContactKind = form.party_kind === "شركة توصيل" || form.party_kind === "شركة أخرى" || form.party_kind === "مورد" || form.party_kind === "زبون";

  const save = async () => {
    if (!dataOwnerId) { toast.error("لا يوجد سياق شركة"); return; }
    if (!form.party_name.trim()) { toast.error("اسم الجهة المتحمِّلة مطلوب"); return; }
    if (!form.details.trim()) { toast.error("تفاصيل التعويض مطلوبة"); return; }
    const amountNum = Number(form.amount);
    if (form.amount.trim() !== "" && (Number.isNaN(amountNum) || amountNum < 0)) {
      toast.error("قيمة المبلغ غير صحيحة"); return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: dataOwnerId,
        party_kind: form.party_kind,
        party_name: form.party_name.trim().slice(0, 160),
        employee_id: isEmployeeKind ? (form.employee_id || null) : null,
        contact_id: isContactKind ? (form.contact_id || null) : null,
        branch_id: form.branch_id || null,
        complaint_id: form.complaint_id || null,
        compensation_date: form.compensation_date || todayStr(),
        amount: form.amount.trim() === "" ? 0 : amountNum,
        currency: form.currency,
        details: form.details.trim().slice(0, 4000),
        status: form.status,
        notes: form.notes.trim().slice(0, 2000) || null,
      };
      if (isNew) {
        const { error } = await supabase
          .from("compensations")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
        toast.success("تم تسجيل التعويض");
        navigate("/compensations", { replace: true });
      } else {
        const { error } = await supabase.from("compensations").update(payload).eq("id", id!);
        if (error) throw error;
        toast.success("تم حفظ التعديلات");
        navigate("/compensations", { replace: true });
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    if (!window.confirm("هل تريد حذف هذا التعويض نهائياً؟")) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("compensations").delete().eq("id", id!);
      if (error) throw error;
      toast.success("تم حذف التعويض");
      navigate("/compensations", { replace: true });
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
            { key: "new", label: "تعويض جديد", icon: Plus, onClick: () => navigate("/compensations/new") },
          ],
        },
        {
          key: "nav",
          label: "إجراءات",
          items: [
            { key: "back", label: "رجوع", icon: ArrowRight, onClick: () => navigate("/compensations") },
            ...(isNew ? [] : [{ key: "del", label: "حذف", icon: Trash2, variant: "danger" as const, disabled: deleting, onClick: () => void remove() }]),
          ],
        },
      ],
    },
  ], [saving, deleting, isNew, form, dataOwnerId]);

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <FinanceShell
        title={isNew ? "تسجيل تعويض جديد" : "تعديل تعويض"}
        breadcrumb={[{ label: "التعويضات", href: "/compensations" }, { label: isNew ? "جديد" : form.party_name || "تعويض" }]}
        actionTabs={actionTabs}
      >
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-3 md:p-4 max-w-5xl mx-auto pb-24">
            <FastTabs
              items={[
                {
                  key: "party",
                  title: "الجهة المتحمِّلة",
                  summary: form.party_name ? `${form.party_kind} • ${form.party_name}` : "—",
                  defaultOpen: true,
                  children: (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>نوع الجهة *</Label>
                        <Select value={form.party_kind} onValueChange={(v) => setForm(f => ({ ...f, party_kind: v, employee_id: "", contact_id: "" }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PARTY_KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {isEmployeeKind && (
                        <div className="space-y-1">
                          <Label>اختيار من الموظفين</Label>
                          <Select value={form.employee_id || "none"} onValueChange={pickEmployee}>
                            <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— بدون ربط —</SelectItem>
                              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {isContactKind && (
                        <div className="space-y-1">
                          <Label>اختيار من جهات الاتصال (اختياري)</Label>
                          <Select value={form.contact_id || "none"} onValueChange={pickContact}>
                            <SelectTrigger><SelectValue placeholder="مثال: ويلز، يمي، دايال..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— بدون ربط —</SelectItem>
                              {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label>اسم الجهة *</Label>
                        <Input value={form.party_name} onChange={(e) => set("party_name", e.target.value)} maxLength={160} placeholder="اسم الموظف أو الشركة" />
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
                        <Input type="date" value={form.compensation_date} onChange={(e) => set("compensation_date", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>اليوم</Label>
                        <Input value={dayName(form.compensation_date)} readOnly className="bg-muted" />
                      </div>
                    </div>
                  ),
                },
                {
                  key: "amount",
                  title: "قيمة التعويض",
                  summary: form.amount ? `${form.amount} ${CURRENCY_SYMBOLS[form.currency] || form.currency}` : "—",
                  defaultOpen: true,
                  children: (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>المبلغ</Label>
                        <Input
                          value={form.amount}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^\d*\.?\d{0,2}$/.test(v) || v === "") set("amount", v);
                          }}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                        <p className="text-[11px] text-muted-foreground">تخزين تشغيلي فقط — لا يولّد أي قيد محاسبي حالياً.</p>
                      </div>
                      <div className="space-y-1">
                        <Label>العملة</Label>
                        <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {COMP_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>شكوى مرتبطة (اختياري)</Label>
                        <Select value={form.complaint_id || "none"} onValueChange={(v) => set("complaint_id", v === "none" ? "" : v)}>
                          <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون</SelectItem>
                            {complaints.map(c => <SelectItem key={c.id} value={c.id}>{c.customer_name} — {c.complaint_date}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "details",
                  title: "تفاصيل التعويض",
                  summary: form.details ? `${form.details.slice(0, 40)}…` : "—",
                  defaultOpen: true,
                  children: (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>تفاصيل المشكلة والتعويض *</Label>
                        <Textarea rows={5} value={form.details} onChange={(e) => set("details", e.target.value)} maxLength={4000} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>الحالة</Label>
                          <Select value={form.status} onValueChange={(v) => set("status", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {COMP_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>ملاحظات</Label>
                          <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
                        </div>
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
        <Button variant="outline" onClick={() => navigate("/compensations")} className="gap-1">
          <ArrowRight className="w-4 h-4" /> رجوع
        </Button>
        <Button onClick={() => void save()} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Bell, Users, Building2, Shield, CheckCircle2, XCircle, AlertCircle, History, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type AudienceType = "employees" | "department" | "role" | "company";

interface Template {
  id: string;
  code: string;
  name: string;
  category: string;
  title_template: string;
  body_template: string;
  icon: string | null;
  variables: string[];
  is_system: boolean;
}

interface Employee { id: string; full_name: string; department_id: string | null; auth_user_id: string | null; }
interface Department { id: string; name: string; }

interface Broadcast {
  id: string;
  title: string;
  body: string;
  audience_type: string;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  error_summary: string | null;
}

const ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "مدراء النظام" },
  { value: "accountant_senior", label: "محاسبين أول" },
  { value: "accountant", label: "محاسبين" },
  { value: "hr_manager", label: "موارد بشرية" },
  { value: "branch_manager", label: "مدراء فروع" },
  { value: "cashier", label: "كاشيرز" },
  { value: "sales_rep", label: "مندوبين" },
  { value: "employee", label: "موظفين" },
];

const CATEGORY_LABELS: Record<string, string> = {
  circular: "تعميم", greeting: "تهنئة", reminder: "تذكير",
  meeting: "اجتماع", payroll: "راتب", alert: "تنبيه",
  announcement: "إعلان", general: "عام",
};

const VAR_EXAMPLES: Record<string, string> = {
  time: "08:00 ص",
  name: "أحمد",
  month: "يناير",
  when: "غداً الساعة 10:00 ص",
  location: "قاعة الاجتماعات",
  holiday_name: "عيد الفطر",
  message: "نص الرسالة هنا...",
};

function applyVariables(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? `{{${k}}}`);
}


export default function NotificationsAdminPage() {
  // --- data ---
  const [templates, setTemplates] = useState<Template[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  const CATEGORY_ORDER = ["circular", "announcement", "meeting", "reminder", "payroll", "alert", "greeting", "general"];

  // --- form ---
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [audienceType, setAudienceType] = useState<AudienceType>("company");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [empSearch, setEmpSearch] = useState("");
  const [sending, setSending] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  // Group templates by category for cleaner dropdown
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, Template[]> = {};
    templates.forEach((t) => {
      const k = t.category || "general";
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });
    Object.values(groups).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name, "ar")));
    return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => ({ category: c, items: groups[c] }));
  }, [templates]);

  // ---- load ----
  const loadAll = async () => {
    setLoading(true);
    try {
      const [tplRes, empRes, depRes, histRes] = await Promise.all([
        supabase.from("notification_templates").select("*").eq("is_active", true).order("is_system", { ascending: false }).order("category"),
        supabase.from("employees").select("id,full_name,department_id,auth_user_id").eq("is_active", true).order("full_name"),
        supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
        supabase.from("notification_broadcasts").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      setTemplates((tplRes.data ?? []) as any);
      setEmployees((empRes.data ?? []) as any);
      setDepartments((depRes.data ?? []) as any);
      setHistory((histRes.data ?? []) as any);
    } catch (e: any) {
      toast.error("تعذر تحميل البيانات: " + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAll(); }, []);

  // ---- when template changes, prefill ----
  useEffect(() => {
    if (!selectedTemplate) return;
    setTitle(selectedTemplate.title_template);
    setBody(selectedTemplate.body_template);
    const init: Record<string, string> = {};
    (selectedTemplate.variables ?? []).forEach((v) => (init[v] = ""));
    setVarValues(init);
  }, [selectedTemplate]);

  const finalTitle = useMemo(() => applyVariables(title, varValues), [title, varValues]);
  const finalBody = useMemo(() => applyVariables(body, varValues), [body, varValues]);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return q ? employees.filter((e) => e.full_name?.toLowerCase().includes(q)) : employees;
  }, [empSearch, employees]);

  const audienceCount = useMemo(() => {
    if (audienceType === "employees") return selectedEmployeeIds.length;
    if (audienceType === "department") return employees.filter((e) => e.department_id === selectedDepartmentId && e.auth_user_id).length;
    if (audienceType === "company") return employees.filter((e) => !!e.auth_user_id).length;
    return null; // role: unknown until sent
  }, [audienceType, selectedEmployeeIds, selectedDepartmentId, employees]);

  const canSend = !!finalTitle.trim() && !!finalBody.trim() && (
    (audienceType === "employees" && selectedEmployeeIds.length > 0) ||
    (audienceType === "department" && !!selectedDepartmentId) ||
    (audienceType === "role" && !!selectedRole) ||
    audienceType === "company"
  );

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const audience_filter: any = {};
      if (audienceType === "employees") audience_filter.employee_ids = selectedEmployeeIds;
      if (audienceType === "department") audience_filter.department_id = selectedDepartmentId;
      if (audienceType === "role") audience_filter.role = selectedRole;

      const { data, error } = await supabase.functions.invoke("notifications-broadcast", {
        body: {
          title: finalTitle,
          body: finalBody,
          template_id: selectedTemplateId || null,
          audience_type: audienceType,
          audience_filter,
          path: "/",
        },
      });
      if (error) throw error;
      const sent = data?.sent ?? 0;
      const failed = data?.failed ?? 0;
      const total = data?.recipients ?? 0;
      if (total === 0) toast.warning("ما في مستقبلين مطابقين للمعايير");
      else if (failed === 0) toast.success(`تم الإرسال لـ ${sent} موظف ✅`);
      else toast.warning(`تم الإرسال لـ ${sent} من أصل ${total} (فشل ${failed})`);
      // reset partial
      setSelectedEmployeeIds([]);
      loadAll();
    } catch (e: any) {
      toast.error("فشل الإرسال: " + (e.message ?? e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div dir="rtl" className="w-full min-h-full p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">مركز الإشعارات</h1>
          <p className="text-xs text-muted-foreground">إرسال إشعارات للموظفين والمدراء والمحاسبين والموارد البشرية</p>
        </div>
      </div>

      <Tabs defaultValue="compose" dir="rtl">
        <TabsList>
          <TabsTrigger value="compose"><Send className="w-4 h-4 ml-1" /> إنشاء وإرسال</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 ml-1" /> السجل</TabsTrigger>
        </TabsList>

        {/* ---- COMPOSE TAB ---- */}
        <TabsContent value="compose" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* LEFT: form */}
            <Card className="p-4 space-y-4">
              <div>
                <Label className="flex items-center gap-1 mb-2"><FileText className="w-4 h-4" /> النموذج</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} dir="rtl">
                  <SelectTrigger><SelectValue placeholder="اختر نموذج جاهز (اختياري)" /></SelectTrigger>
                  <SelectContent className="max-h-[360px]">
                    {groupedTemplates.map((group, gi) => (
                      <div key={group.category}>
                        {gi > 0 && <div className="h-px bg-border my-1" />}
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          {CATEGORY_LABELS[group.category] ?? group.category}
                        </div>
                        {group.items.map((t) => (
                          <SelectItem key={t.id} value={t.id} className="py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">{t.icon ?? "🔔"}</span>
                              <span className="text-sm">{t.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (selectedTemplate.variables ?? []).length > 0 && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <Label className="text-xs">متغيرات النموذج</Label>
                  {selectedTemplate.variables.map((v) => (
                    <div key={v}>
                      <Label className="text-[11px] text-muted-foreground">{`{{${v}}}`}</Label>
                      <Input
                        value={varValues[v] ?? ""}
                        onChange={(e) => setVarValues({ ...varValues, [v]: e.target.value })}
                        placeholder={VAR_EXAMPLES[v] ? `مثال: ${VAR_EXAMPLES[v]}` : `قيمة ${v}`}
                        className="h-8"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label className="mb-1">العنوان</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: 📢 تعميم إداري" />
              </div>

              <div>
                <Label className="mb-1">المحتوى</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="نص الإشعار..." />
              </div>

              {(title.includes("{{") || body.includes("{{")) && (
                <div className="space-y-1 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <Label className="text-[11px] text-primary">👁️ معاينة مباشرة (هذا ما سيُرسل فعلياً)</Label>
                  <p className="text-sm font-semibold text-foreground">{finalTitle || "—"}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{finalBody || "—"}</p>
                </div>
              )}

              <div>
                <Label className="mb-2 flex items-center gap-1"><Users className="w-4 h-4" /> الجمهور</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "company", label: "كل الشركة", icon: Building2 },
                    { value: "department", label: "قسم", icon: Building2 },
                    { value: "role", label: "حسب الدور", icon: Shield },
                    { value: "employees", label: "موظفين محددين", icon: Users },
                  ] as const).map((opt) => {
                    const Icon = opt.icon;
                    const active = audienceType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAudienceType(opt.value)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition ${
                          active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {audienceType === "department" && (
                <div>
                  <Label className="mb-1">القسم</Label>
                  <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                    <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {audienceType === "role" && (
                <div>
                  <Label className="mb-1">الدور</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger><SelectValue placeholder="اختر الدور" /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {audienceType === "employees" && (
                <div>
                  <Label className="mb-1">اختر موظفين ({selectedEmployeeIds.length})</Label>
                  <Input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="بحث بالاسم..."
                    className="mb-2 h-8"
                  />
                  <ScrollArea className="h-48 border rounded-lg p-2">
                    {filteredEmployees.map((e) => {
                      const checked = selectedEmployeeIds.includes(e.id);
                      const hasAccount = !!e.auth_user_id;
                      return (
                        <label
                          key={e.id}
                          className={`flex items-center gap-2 p-1.5 rounded text-sm cursor-pointer hover:bg-muted ${!hasAccount ? "opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!hasAccount}
                            onChange={(ev) =>
                              setSelectedEmployeeIds(
                                ev.target.checked
                                  ? [...selectedEmployeeIds, e.id]
                                  : selectedEmployeeIds.filter((x) => x !== e.id),
                              )
                            }
                          />
                          <span>{e.full_name}</span>
                          {!hasAccount && <Badge variant="outline" className="text-[10px] mr-auto">بدون حساب</Badge>}
                        </label>
                      );
                    })}
                  </ScrollArea>
                </div>
              )}
            </Card>

            {/* RIGHT: preview */}
            <Card className="p-4 space-y-4">
              <Label className="text-xs text-muted-foreground">معاينة الإشعار</Label>
              <div className="bg-gradient-to-br from-card to-muted/30 border rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{finalTitle || "العنوان"}</div>
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{finalBody || "نص الإشعار..."}</div>
                    <div className="text-[10px] text-muted-foreground mt-2">أموالي • الآن</div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الجمهور:</span>
                  <span className="font-medium">
                    {audienceType === "company" && "كل الشركة"}
                    {audienceType === "department" && (departments.find((d) => d.id === selectedDepartmentId)?.name ?? "—")}
                    {audienceType === "role" && (ROLES.find((r) => r.value === selectedRole)?.label ?? "—")}
                    {audienceType === "employees" && `${selectedEmployeeIds.length} موظف`}
                  </span>
                </div>
                {audienceCount !== null && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>عدد المستقبلين المتوقع:</span>
                    <span>{audienceCount}</span>
                  </div>
                )}
              </div>

              <Button onClick={send} disabled={!canSend || sending} className="w-full" size="lg">
                {sending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Send className="w-4 h-4 ml-2" />}
                إرسال الإشعار
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                الإرسال فوري عبر Push Notification لكل الأجهزة المسجلة
              </p>
            </Card>
          </div>
        </TabsContent>

        {/* ---- HISTORY TAB ---- */}
        <TabsContent value="history" className="mt-4">
          <Card className="p-4">
            {loading ? (
              <div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : history.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground text-sm">لا توجد إشعارات مرسلة بعد</div>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="border rounded-lg p-3 hover:bg-muted/30 transition">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="font-semibold text-sm flex-1 truncate">{h.title}</div>
                      <StatusBadge status={h.status} />
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mb-2">{h.body}</div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                      <span>{format(new Date(h.created_at), "yyyy/MM/dd HH:mm")}</span>
                      <span>•</span>
                      <span>الجمهور: {h.audience_type}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" /> {h.sent_count}
                      </span>
                      {h.failed_count > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="w-3 h-3" /> {h.failed_count}
                        </span>
                      )}
                      <span className="text-muted-foreground">من أصل {h.recipients_count}</span>
                      {h.error_summary && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="w-3 h-3" /> {h.error_summary}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: "مكتمل", cls: "bg-emerald-500/15 text-emerald-700" },
    partial: { label: "جزئي", cls: "bg-amber-500/15 text-amber-700" },
    failed: { label: "فشل", cls: "bg-red-500/15 text-red-700" },
    pending: { label: "قيد التنفيذ", cls: "bg-blue-500/15 text-blue-700" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}
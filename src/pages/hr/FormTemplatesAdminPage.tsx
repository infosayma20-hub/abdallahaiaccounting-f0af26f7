import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus, Edit2, Eye, Loader2, Copy as CopyIcon, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DynamicFormRenderer from "@/components/forms/DynamicFormRenderer";
import FormSchemaBuilder, { BuilderSchema } from "@/components/hr/FormSchemaBuilder";
import { downloadEmployeeFormWord } from "@/lib/employee-forms/exportFormWord";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { AlertTriangle, RotateCcw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  schema: any;
  frequency: string;
  target_job_title_names: string[];
  target_employee_ids: string[];
  is_active: boolean;
  is_system: boolean;
  user_id: string | null;
  cloned_from_template_id?: string | null;
};

// Collect all field keys from a schema for safe-edit comparison
const collectKeys = (schema: any): { sections: string[]; fields: string[] } => {
  const out = { sections: [] as string[], fields: [] as string[] };
  if (!schema || !Array.isArray(schema.sections)) return out;
  for (const s of schema.sections) {
    if (s?.key) out.sections.push(String(s.key));
    if (Array.isArray(s?.fields)) {
      for (const f of s.fields) if (f?.key) out.fields.push(`${s.key}.${f.key}`);
    }
  }
  return out;
};

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "تسويق", operations: "عمليات", hr: "موارد بشرية",
  quality: "جودة", finance: "مالية", general: "عام",
};
const FREQ_LABELS: Record<string, string> = {
  once: "مرة واحدة", daily: "يومي", weekly: "أسبوعي",
  monthly: "شهري", quarterly: "ربعي", yearly: "سنوي",
};

export default function FormTemplatesAdminPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  // Templates must belong to the TENANT owner, otherwise clones created by an
  // HR manager are invisible to the owner/admins (is_team_member check).
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id || null;
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [originalSchema, setOriginalSchema] = useState<any>(null);
  const [submissionsCount, setSubmissionsCount] = useState<Record<string, number>>({});
  const [confirmCloneEdit, setConfirmCloneEdit] = useState<Template | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<Template | null>(null);
  const [saveWarning, setSaveWarning] = useState<{ removed: string[]; onConfirm: () => void } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: tpls } = await supabase
        .from("form_templates")
        .select("*")
        .eq("is_deleted", false)
        .order("is_system", { ascending: false })
        .order("created_at", { ascending: false });
      const list = (tpls || []) as Template[];
      // Prefer company clones: hide any system template that has an active clone
      // owned by the current tenant.
      const clonedFromIds = new Set(
        list.filter((t) => !t.is_system && t.cloned_from_template_id).map((t) => t.cloned_from_template_id as string),
      );
      const filtered = list.filter((t) => !(t.is_system && clonedFromIds.has(t.id)));
      setTemplates(filtered);

      if (list.length) {
        const { data: subs } = await supabase
          .from("employee_forms")
          .select("template_id")
          .in("template_id", list.map((t) => t.id));
        const counts: Record<string, number> = {};
        (subs || []).forEach((s: any) => {
          if (s.template_id) counts[s.template_id] = (counts[s.template_id] || 0) + 1;
        });
        setSubmissionsCount(counts);
      }
    } catch (err: any) {
      toast({ title: "تعذر التحميل", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const performSave = async () => {
    if (!editing) return;
    try {
      // Parse schema if string
      let schema = editing.schema;
      if (typeof schema === "string") schema = JSON.parse(schema);
      if (!schema || !Array.isArray(schema.sections)) {
        throw new Error("الهيكل غير صالح: يجب أن يحتوي على sections");
      }

      if (editing.id) {
        const { error } = await supabase
          .from("form_templates")
          .update({
            name: editing.name,
            description: editing.description,
            category: editing.category,
            schema,
            frequency: editing.frequency,
            target_job_title_names: editing.target_job_title_names,
            target_employee_ids: editing.target_employee_ids,
            is_active: editing.is_active,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("form_templates").insert({
          name: editing.name,
          description: editing.description,
          category: editing.category || "general",
          schema,
          frequency: editing.frequency || "once",
          target_job_title_names: editing.target_job_title_names || [],
          target_employee_ids: editing.target_employee_ids || [],
          is_active: editing.is_active ?? true,
          is_system: false,
          cloned_from_template_id: editing.cloned_from_template_id || null,
          user_id: ownerId,
        });
        if (error) throw error;
      }
      toast({ title: "تم الحفظ" });
      setEditing(null);
      setOriginalSchema(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = () => {
    if (!editing) return;
    // Compare original vs new to detect removed/renamed keys
    if (originalSchema) {
      try {
        let newSchema = editing.schema;
        if (typeof newSchema === "string") newSchema = JSON.parse(newSchema);
        const before = collectKeys(originalSchema);
        const after = collectKeys(newSchema);
        const afterSet = new Set([...after.sections.map((k) => `s:${k}`), ...after.fields.map((k) => `f:${k}`)]);
        const removed: string[] = [];
        before.sections.forEach((k) => { if (!afterSet.has(`s:${k}`)) removed.push(`قسم: ${k}`); });
        before.fields.forEach((k) => { if (!afterSet.has(`f:${k}`)) removed.push(`حقل: ${k}`); });
        if (removed.length > 0) {
          setSaveWarning({ removed, onConfirm: () => { setSaveWarning(null); performSave(); } });
          return;
        }
      } catch { /* fall through to save */ }
    }
    performSave();
  };

  // Safe schema for the builder (always an object with sections)
  const normalizeSchema = (s: any): BuilderSchema => {
    if (!s) return { sections: [] };
    if (typeof s === "string") {
      try { const p = JSON.parse(s); return p && Array.isArray(p.sections) ? p : { sections: [] }; }
      catch { return { sections: [] }; }
    }
    return Array.isArray(s.sections) ? s : { sections: [] };
  };

  const deepClone = (v: any) => JSON.parse(JSON.stringify(v ?? null));

  const cloneAsCustom = async (tpl: Template) => {
    const schema = deepClone(tpl.schema);
    setEditing({
      ...tpl,
      id: "" as any,
      is_system: false,
      name: `${tpl.name} (نسخة)`,
      schema,
      cloned_from_template_id: null,
    });
    setOriginalSchema(null);
  };

  const openEditor = (tpl: Template) => {
    if (tpl.is_system) {
      setConfirmCloneEdit(tpl);
      return;
    }
    setOriginalSchema(deepClone(tpl.schema));
    setEditing({ ...tpl, schema: deepClone(tpl.schema) });
  };

  const cloneForEdit = async (tpl: Template) => {
    // Create the clone immediately, then open editor on the fresh clone.
    try {
      let schema = tpl.schema;
      if (typeof schema === "string") schema = JSON.parse(schema);
      const { data, error } = await supabase
        .from("form_templates")
        .insert({
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          schema: deepClone(schema),
          frequency: tpl.frequency,
          target_job_title_names: tpl.target_job_title_names || [],
          target_employee_ids: tpl.target_employee_ids || [],
          is_active: tpl.is_active ?? true,
          is_system: false,
          cloned_from_template_id: tpl.id,
          user_id: ownerId,
        })
        .select("*")
        .single();
      if (error) throw error;
      const clone = data as Template;
      toast({ title: "تم إنشاء نسخة قابلة للتعديل" });
      setConfirmCloneEdit(null);
      setOriginalSchema(deepClone(clone.schema));
      setEditing({ ...clone, schema: deepClone(clone.schema) });
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر إنشاء النسخة", description: err.message, variant: "destructive" });
    }
  };

  const revertToOriginal = async (tpl: Template) => {
    if (!tpl.cloned_from_template_id) return;
    try {
      const { error } = await supabase
        .from("form_templates")
        .update({ is_deleted: true, is_active: false })
        .eq("id", tpl.id);
      if (error) throw error;
      toast({ title: "تم الرجوع للقالب الأصلي" });
      setConfirmRevert(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر الرجوع", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "container max-w-6xl mx-auto p-4 md:p-6 space-y-4"} dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {embedded ? <div /> : (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">قوالب النماذج الديناميكية</h1>
            <p className="text-xs text-muted-foreground">
              نماذج يعبيها الموظفون من بورتالهم حسب المنصب الوظيفي.
            </p>
          </div>
        </div>
        )}
        <Button
          onClick={() =>
            setEditing({
              id: "" as any,
              name: "نموذج جديد",
              description: "",
              category: "general",
              schema: { sections: [{ key: "main", title: "البيانات الأساسية", type: "fields", fields: [{ key: "note", label: "ملاحظة", type: "textarea" }] }] },
              frequency: "once",
              target_job_title_names: [],
              target_employee_ids: [],
              is_active: true,
              is_system: false,
              user_id: null,
            } as Template)
          }
        >
          <Plus className="h-4 w-4 ml-1" />
          قالب جديد
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">النموذج</th>
                    <th className="text-right p-3 font-medium whitespace-nowrap">الفئة</th>
                    <th className="text-right p-3 font-medium whitespace-nowrap">التكرار</th>
                    <th className="text-center p-3 font-medium whitespace-nowrap">المستهدفون</th>
                    <th className="text-center p-3 font-medium whitespace-nowrap">التعبئات</th>
                    <th className="text-center p-3 font-medium whitespace-nowrap">الحالة</th>
                    <th className="text-center p-3 font-medium whitespace-nowrap">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {templates.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20 align-top">
                      <td className="p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{t.name}</span>
                          {t.is_system && (
                            <Badge variant="secondary" className="text-[10px] h-5">قالب نظام</Badge>
                          )}
                          {!t.is_system && t.cloned_from_template_id && (
                            <Badge variant="outline" className="text-[10px] h-5 border-amber-500/50 text-amber-700 dark:text-amber-400">
                              نسخة معدّلة
                            </Badge>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 max-w-[320px]">
                            {t.description}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {CATEGORY_LABELS[t.category] || t.category}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {FREQ_LABELS[t.frequency] || t.frequency}
                      </td>
                      <td className="p-3 text-center text-[11px] text-muted-foreground whitespace-nowrap">
                        {t.target_job_title_names.length} منصب / {t.target_employee_ids.length} موظف
                      </td>
                      <td className="p-3 text-center tabular-nums">{submissionsCount[t.id] || 0}</td>
                      <td className="p-3 text-center">
                        <Badge variant={t.is_active ? "default" : "outline"} className="text-[10px] h-5">
                          {t.is_active ? "نشط" : "متوقف"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="معاينة" onClick={() => setPreview(t)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="تعديل" onClick={() => openEditor(t)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="تصدير كنموذج Word فارغ"
                            onClick={() => {
                              downloadEmployeeFormWord({
                                title: t.name,
                                schema: typeof t.schema === "string" ? JSON.parse(t.schema) : t.schema,
                                data: {},
                                includeEmpty: true,
                              });
                              toast({ title: "جارٍ تنزيل النموذج Word" });
                            }}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                          {t.is_system && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => cloneAsCustom(t)} title="استنساخ كقالب جديد">
                              <CopyIcon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!t.is_system && t.cloned_from_template_id && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirmRevert(t)} title="رجوع للقالب الأصلي">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                        لا توجد قوالب.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">معاينة: {preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <DynamicFormRenderer schema={preview.schema} readOnly />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog (JSON editor for now) */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setOriginalSchema(null); } }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editing?.id ? "تعديل القالب" : "قالب جديد"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.cloned_from_template_id && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    أنت تعدّل نسخة مخصصة لشركتك من قالب نظام. تجنّب تغيير مفاتيح الأقسام والحقول الموجودة حتى لا تتأثر التعبئات السابقة.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">اسم النموذج *</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">الفئة</Label>
                  <Select
                    value={editing.category}
                    onValueChange={(v) => setEditing({ ...editing, category: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">تسويق</SelectItem>
                      <SelectItem value="operations">عمليات</SelectItem>
                      <SelectItem value="hr">موارد بشرية</SelectItem>
                      <SelectItem value="quality">جودة</SelectItem>
                      <SelectItem value="finance">مالية</SelectItem>
                      <SelectItem value="general">عام</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">الوصف</Label>
                  <Textarea
                    rows={2}
                    value={editing.description || ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">التكرار</Label>
                  <Select
                    value={editing.frequency}
                    onValueChange={(v) => setEditing({ ...editing, frequency: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">مرة واحدة</SelectItem>
                      <SelectItem value="daily">يومي</SelectItem>
                      <SelectItem value="weekly">أسبوعي</SelectItem>
                      <SelectItem value="monthly">شهري</SelectItem>
                      <SelectItem value="quarterly">ربعي</SelectItem>
                      <SelectItem value="yearly">سنوي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Switch
                    checked={editing.is_active}
                    onCheckedChange={(c) => setEditing({ ...editing, is_active: c })}
                  />
                  <Label className="text-xs">نشط</Label>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">
                    المناصب المستهدفة (افصل بفاصلة)
                  </Label>
                  <Input
                    value={editing.target_job_title_names.join(", ")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        target_job_title_names: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="مدير التسويق, مدير العمليات"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-2 block">بناء النموذج</Label>
                <Tabs defaultValue="builder" dir="rtl">
                  <TabsList className="w-full grid grid-cols-3 h-9">
                    <TabsTrigger value="builder" className="text-xs">🧱 محرر مرئي</TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs">👁️ معاينة</TabsTrigger>
                    <TabsTrigger value="json" className="text-xs">{`{ } JSON متقدم`}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="builder" className="mt-3">
                    <FormSchemaBuilder
                      value={normalizeSchema(editing.schema)}
                      onChange={(s) => setEditing({ ...editing, schema: s })}
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-3">
                    <div className="rounded-xl border bg-muted/20 p-3 max-h-[60vh] overflow-y-auto">
                      <DynamicFormRenderer schema={normalizeSchema(editing.schema) as any} readOnly />
                    </div>
                  </TabsContent>
                  <TabsContent value="json" className="mt-3">
                    <Textarea
                      rows={14}
                      className="font-mono text-[11px]"
                      dir="ltr"
                      value={typeof editing.schema === "string"
                        ? editing.schema
                        : JSON.stringify(editing.schema, null, 2)}
                      onChange={(e) => setEditing({ ...editing, schema: e.target.value as any })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      للاستخدامات المتقدمة فقط — تعديلات تظهر بالمحرر المرئي بعد إغلاق وإعادة فتح التبويب.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <Button onClick={handleSave}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm cloning a system template so it becomes editable */}
      <AlertDialog open={!!confirmCloneEdit} onOpenChange={(o) => !o && setConfirmCloneEdit(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تعديل قالب نظام</AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-6">
              قوالب النظام محمية ولا يمكن تعديلها مباشرة. سيتم إنشاء نسخة قابلة للتعديل خاصة بشركتك من قالب
              <span className="font-semibold"> «{confirmCloneEdit?.name}» </span>
              وستحلّ محلّ الأصل في قائمة النماذج المتاحة للموظفين. القالب الأصلي يبقى محفوظاً ويمكن الرجوع إليه لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCloneEdit && cloneForEdit(confirmCloneEdit)}>
              إنشاء نسخة والتعديل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm reverting a company clone back to the original system template */}
      <AlertDialog open={!!confirmRevert} onOpenChange={(o) => !o && setConfirmRevert(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">الرجوع للقالب الأصلي</AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-6">
              سيتم إخفاء هذه النسخة المعدّلة وسيعود القالب الأصلي للظهور للموظفين. التعبئات السابقة تبقى محفوظة كما هي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRevert && revertToOriginal(confirmRevert)}>
              رجوع للأصل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Warn before saving if fields/sections were removed or renamed */}
      <AlertDialog open={!!saveWarning} onOpenChange={(o) => !o && setSaveWarning(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              تحذير: تم حذف أو إعادة تسمية عناصر
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-6">
              العناصر التالية موجودة في القالب الأصلي لكنها لم تعد في النسخة الجديدة. أي بيانات مرتبطة بها في التعبئات السابقة ستبقى محفوظة لكنها لن تظهر في الواجهة:
              <ul className="mt-2 space-y-1 text-xs bg-muted/40 rounded p-2 max-h-40 overflow-y-auto">
                {saveWarning?.removed.map((k, i) => <li key={i}>• {k}</li>)}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>مراجعة</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveWarning?.onConfirm()}>
              متابعة الحفظ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
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
import { FileText, Plus, Edit2, Eye, Loader2, Copy as CopyIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DynamicFormRenderer from "@/components/forms/DynamicFormRenderer";
import FormSchemaBuilder, { BuilderSchema } from "@/components/hr/FormSchemaBuilder";

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
};

export default function FormTemplatesAdminPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [submissionsCount, setSubmissionsCount] = useState<Record<string, number>>({});

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
      setTemplates(list);

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

  const handleSave = async () => {
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
        });
        if (error) throw error;
      }
      toast({ title: "تم الحفظ" });
      setEditing(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" });
    }
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

  const cloneAsCustom = async (tpl: Template) => {
    setEditing({
      ...tpl,
      id: "" as any,
      is_system: false,
      name: `${tpl.name} (نسخة)`,
    });
  };

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold">{t.name}</span>
                      {t.is_system && (
                        <Badge variant="secondary" className="text-[10px] h-5">
                          قالب نظام
                        </Badge>
                      )}
                      <Badge variant={t.is_active ? "default" : "outline"} className="text-[10px] h-5">
                        {t.is_active ? "نشط" : "متوقف"}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-5">
                    {t.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {t.frequency}
                  </Badge>
                  <span>•</span>
                  <span>المستهدفون: {t.target_job_title_names.length} منصب / {t.target_employee_ids.length} موظف</span>
                  <span>•</span>
                  <span>التعبئات: {submissionsCount[t.id] || 0}</span>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setPreview(t)}>
                    <Eye className="h-3.5 w-3.5 ml-1" />
                    معاينة
                  </Button>
                  {t.is_system ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => cloneAsCustom(t)}>
                      <CopyIcon className="h-3.5 w-3.5 ml-1" />
                      استنساخ
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(t)}>
                      <Edit2 className="h-3.5 w-3.5 ml-1" />
                      تعديل
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editing?.id ? "تعديل القالب" : "قالب جديد"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
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
    </div>
  );
}
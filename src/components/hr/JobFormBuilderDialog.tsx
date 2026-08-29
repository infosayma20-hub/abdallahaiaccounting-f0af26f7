import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  JOB_FORM_SECTIONS, JOB_FORM_PERSONAL_FIELDS, JOB_QUESTION_TYPES,
  MAX_CUSTOM_QUESTIONS, parseJobFormConfig, newQuestionId,
  type JobFormConfig, type JobCustomQuestion, type JobQuestionType,
} from "@/lib/hr/jobApplicationForm";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  linkId: string;
  title: string;
  description: string | null;
  formConfig: unknown;
  onSaved: (patch: { title: string; description: string; form_config: JobFormConfig }) => void;
};

export default function JobFormBuilderDialog({
  open, onOpenChange, linkId, title, description, formConfig, onSaved,
}: Props) {
  const [cfg, setCfg] = useState<JobFormConfig>(() => parseJobFormConfig(formConfig));
  const [t, setT] = useState(title);
  const [d, setD] = useState(description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCfg(parseJobFormConfig(formConfig));
    setT(title);
    setD(description || "");
  }, [open, formConfig, title, description]);

  const patchQuestion = (id: string, patch: Partial<JobCustomQuestion>) =>
    setCfg((c) => ({ ...c, questions: c.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  const move = (idx: number, dir: -1 | 1) =>
    setCfg((c) => {
      const qs = [...c.questions];
      const j = idx + dir;
      if (j < 0 || j >= qs.length) return c;
      [qs[idx], qs[j]] = [qs[j], qs[idx]];
      return { ...c, questions: qs };
    });

  const addQuestion = () =>
    setCfg((c) =>
      c.questions.length >= MAX_CUSTOM_QUESTIONS
        ? c
        : {
            ...c,
            questions: [
              ...c.questions,
              { id: newQuestionId(), label: "", type: "text" as JobQuestionType, required: false },
            ],
          });

  const save = async () => {
    if (!t.trim()) return toast.error("عنوان النموذج مطلوب");
    const bad = cfg.questions.find((q) => !q.label.trim());
    if (bad) return toast.error("يوجد سؤال بدون نص");
    const badOpts = cfg.questions.find((q) => q.type === "select" && (q.options || []).length === 0);
    if (badOpts) return toast.error(`أضف خيارات للسؤال: ${badOpts.label}`);

    setSaving(true);
    const clean: JobFormConfig = {
      ...cfg,
      questions: cfg.questions.map((q) => ({
        ...q,
        label: q.label.trim(),
        options: q.type === "select" ? (q.options || []).map((o) => o.trim()).filter(Boolean) : undefined,
      })),
    };
    const { error } = await supabase
      .from("job_application_links")
      .update({ title: t.trim(), description: d.trim() || null, form_config: clean as any })
      .eq("id", linkId);
    setSaving(false);
    if (error) return toast.error(error.message);
    onSaved({ title: t.trim(), description: d.trim(), form_config: clean });
    toast.success("تم حفظ النموذج");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-right">بناء نموذج التوظيف</DialogTitle></DialogHeader>

        <div className="space-y-5">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">عنوان النموذج</Label>
              <Input value={t} onChange={(e) => setT(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">وصف مختصر</Label>
              <Input value={d} onChange={(e) => setD(e.target.value)} placeholder="املأ البيانات التالية بدقة" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold mb-2">حقول البيانات الشخصية</h3>
            <p className="text-[11px] text-muted-foreground mb-2">
              الاسم، رقم الهاتف، والوظيفة المطلوبة إجبارية دائماً ولا يمكن إيقافها.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {JOB_FORM_PERSONAL_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-2 border rounded-lg px-2 py-1.5 text-xs">
                  <span>{f.label}</span>
                  <Switch
                    checked={cfg.personal[f.key]}
                    onCheckedChange={(v) => setCfg((c) => ({ ...c, personal: { ...c.personal, [f.key]: v } }))}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold mb-2">أقسام النموذج</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {JOB_FORM_SECTIONS.map((s) => (
                <label key={s.key} className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2">
                  <span>
                    <span className="text-xs font-medium block">{s.label}</span>
                    <span className="text-[10.5px] text-muted-foreground">{s.hint}</span>
                  </span>
                  <Switch
                    checked={cfg.sections[s.key]}
                    onCheckedChange={(v) => setCfg((c) => ({ ...c, sections: { ...c.sections, [s.key]: v } }))}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">أسئلة مخصّصة ({cfg.questions.length}/{MAX_CUSTOM_QUESTIONS})</h3>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={addQuestion}>
                <Plus className="h-3.5 w-3.5" /> إضافة سؤال
              </Button>
            </div>

            {cfg.questions.length === 0 ? (
              <p className="text-xs text-muted-foreground border rounded-lg p-3 text-center">
                لا توجد أسئلة مخصّصة — النموذج سيعرض الأقسام المفعّلة أعلاه فقط.
              </p>
            ) : (
              <div className="space-y-2">
                {cfg.questions.map((q, i) => (
                  <div key={q.id} className="border rounded-lg p-2 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto_auto] gap-2 items-center">
                      <Input
                        placeholder="نص السؤال"
                        value={q.label}
                        onChange={(e) => patchQuestion(q.id, { label: e.target.value })}
                      />
                      <Select value={q.type} onValueChange={(v) => patchQuestion(q.id, { type: v as JobQuestionType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {JOB_QUESTION_TYPES.map((tp) => (
                            <SelectItem key={tp.key} value={tp.key}>{tp.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <Switch checked={q.required} onCheckedChange={(v) => patchQuestion(q.id, { required: v })} />
                        إجباري
                      </label>
                      <div className="flex items-center">
                        <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === cfg.questions.length - 1}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="icon"
                          onClick={() => setCfg((c) => ({ ...c, questions: c.questions.filter((x) => x.id !== q.id) }))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {q.type === "select" && (
                      <div>
                        <Label className="text-[11px]">الخيارات (سطر لكل خيار)</Label>
                        <Textarea
                          rows={3}
                          value={(q.options || []).join("\n")}
                          onChange={(e) => patchQuestion(q.id, { options: e.target.value.split("\n") })}
                          placeholder={"خيار 1\nخيار 2"}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={save} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ النموذج
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Save, Eye, Trash2, ArrowUp, ArrowDown, Send, Users } from "lucide-react";
import { FinanceShell, FastTabs } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { LESSON_TYPE_LABELS, useTrainingCourse } from "@/hooks/training/useTraining";

interface EmployeeRow { id: string; full_name: string; branch_id: string | null }

export default function TrainingCourseEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const { course, lessons, questions, loading, refetch } = useTrainingCourse(isNew ? undefined : id);

  const [form, setForm] = useState({
    title: "", description: "", category: "", status: "draft",
    is_mandatory: false, pass_score: 60, duration_minutes: 30,
  });
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title, description: course.description || "", category: course.category || "",
        status: course.status, is_mandatory: course.is_mandatory,
        pass_score: course.pass_score, duration_minutes: course.duration_minutes || 30,
      });
    }
  }, [course]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("employees").select("id, full_name, branch_id").eq("is_active", true).order("full_name");
      setEmployees((data || []) as EmployeeRow[]);
    })();
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    (async () => {
      const [aRes, eRes] = await Promise.all([
        supabase.from("training_assignments").select("employee_id").eq("course_id", id),
        supabase.from("training_enrollments").select("*").eq("course_id", id),
      ]);
      setAssigned(new Set(((aRes.data || []) as any[]).map((r) => r.employee_id)));
      setEnrollments((eRes.data || []) as any[]);
    })();
  }, [id, isNew]);

  const save = async () => {
    if (!form.title.trim()) return toast.error("العنوان مطلوب");
    setSaving(true);
    if (isNew) {
      const { data, error } = await supabase.from("training_courses")
        .insert({ ...form, user_id: dataOwnerId, created_by: dataOwnerId } as any)
        .select("id").maybeSingle();
      setSaving(false);
      if (error || !data) return toast.error("تعذّر الحفظ");
      toast.success("تم إنشاء الدورة");
      navigate(`/training/courses/${(data as any).id}`, { replace: true });
    } else {
      const { error } = await supabase.from("training_courses").update(form as any).eq("id", id!);
      setSaving(false);
      if (error) return toast.error("تعذّر الحفظ");
      toast.success("تم الحفظ");
      refetch();
    }
  };

  const moveLesson = async (index: number, dir: -1 | 1) => {
    const a = lessons[index], b = lessons[index + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("training_lessons").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("training_lessons").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    refetch();
  };

  const deleteLesson = async (lessonId: string) => {
    await supabase.from("training_lessons").delete().eq("id", lessonId);
    toast.success("تم حذف الشريحة");
    refetch();
  };

  const addQuestion = async () => {
    if (isNew) return;
    await supabase.from("training_quiz_questions").insert({
      course_id: id, user_id: dataOwnerId, sort_order: questions.length + 1,
      question: "سؤال جديد", options: ["خيار 1", "خيار 2"], correct_index: 0,
    } as any);
    refetch();
  };

  const updateQuestion = async (qid: string, patch: Record<string, any>) => {
    await supabase.from("training_quiz_questions").update(patch as any).eq("id", qid);
    refetch();
  };

  const toggleAssign = async (empId: string) => {
    if (isNew || !id) return;
    if (assigned.has(empId)) {
      await supabase.from("training_assignments").delete().eq("course_id", id).eq("employee_id", empId);
      setAssigned((s) => { const n = new Set(s); n.delete(empId); return n; });
    } else {
      await supabase.from("training_assignments").insert({ course_id: id, employee_id: empId, user_id: dataOwnerId, assigned_by: dataOwnerId } as any);
      setAssigned((s) => new Set(s).add(empId));
    }
  };

  const assignAll = async () => {
    if (isNew || !id) return;
    const rows = employees.filter((e) => !assigned.has(e.id))
      .map((e) => ({ course_id: id, employee_id: e.id, user_id: dataOwnerId, assigned_by: dataOwnerId }));
    if (!rows.length) return;
    const { error } = await supabase.from("training_assignments").insert(rows as any);
    if (error) return toast.error("تعذّر التكليف");
    setAssigned(new Set(employees.map((e) => e.id)));
    toast.success(`تم تكليف ${rows.length} موظف`);
  };

  const progressByEmp = useMemo(() => {
    const m = new Map<string, any>();
    enrollments.forEach((e) => m.set(e.employee_id, e));
    return m;
  }, [enrollments]);

  if (!isNew && loading) return <div className="p-8 text-center text-muted-foreground" dir="rtl">جاري التحميل…</div>;

  return (
    <FinanceShell
      title={isNew ? "دورة جديدة" : form.title || "دورة"}
      breadcrumb={[
        { label: "التطبيقات", href: "/apps" },
        { label: "الورشات والدورات", href: "/training" },
        { label: isNew ? "جديدة" : "تفاصيل الدورة" },
      ]}
      actionTabs={[
        {
          key: "general", label: "عام",
          groups: [
            {
              key: "save", label: "حفظ",
              items: [
                { key: "save", label: saving ? "جاري الحفظ…" : "حفظ", icon: Save, variant: "primary", onClick: save, disabled: saving },
                { key: "publish", label: "نشر للموظفين", icon: Send, disabled: isNew, onClick: async () => { setForm((f) => ({ ...f, status: "published" })); if (!isNew) { await supabase.from("training_courses").update({ status: "published" }).eq("id", id!); toast.success("تم النشر"); refetch(); } } },
              ],
            },
            {
              key: "content", label: "المحتوى",
              items: [
                { key: "lesson", label: "شريحة جديدة", icon: Plus, disabled: isNew, onClick: () => navigate(`/training/courses/${id}/lessons/new`) },
                { key: "play", label: "عرض تقديمي", icon: Eye, disabled: isNew, onClick: () => navigate(`/training/courses/${id}/play`) },
              ],
            },
          ],
        },
      ]}
    >
      <div className="p-3" dir="rtl">
        <FastTabs
          items={[
            {
              key: "details", title: "تفاصيل الدورة", defaultOpen: true,
              summary: <span className="text-[12px] text-muted-foreground">{form.status === "published" ? "منشورة" : "مسودة"}</span>,
              children: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-[12px] text-muted-foreground">عنوان الدورة</label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[12px] text-muted-foreground">الوصف</label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">التصنيف</label>
                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">المدة (دقيقة)</label>
                    <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} className="h-9 text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">درجة النجاح %</label>
                    <Input type="number" value={form.pass_score} onChange={(e) => setForm({ ...form, pass_score: Number(e.target.value) })} className="h-9 text-[13px]" />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch checked={form.is_mandatory} onCheckedChange={(v) => setForm({ ...form, is_mandatory: v })} />
                    <span className="text-[13px]">دورة إلزامية</span>
                  </div>
                </div>
              ),
            },
            {
              key: "lessons", title: "الشرائح والمحتوى",
              summary: <span className="text-[12px] text-muted-foreground">{lessons.length} شريحة</span>,
              children: (
                <div className="space-y-2">
                  <Button size="sm" variant="outline" disabled={isNew} onClick={() => navigate(`/training/courses/${id}/lessons/new`)}>
                    <Plus className="h-4 w-4 ml-1" /> شريحة جديدة
                  </Button>
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-muted/60 border-b border-border">
                        <tr className="text-right">
                          <th className="px-3 py-2 w-12">#</th>
                          <th className="px-3 py-2">العنوان</th>
                          <th className="px-3 py-2">المحور</th>
                          <th className="px-3 py-2">النوع</th>
                          <th className="px-3 py-2 w-40">ترتيب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lessons.map((l, idx) => (
                          <tr key={l.id} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <button className="font-medium text-primary hover:underline" onClick={() => navigate(`/training/courses/${id}/lessons/${l.id}`)}>
                                {l.title}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{l.section || "—"}</td>
                            <td className="px-3 py-2"><Badge variant="outline">{LESSON_TYPE_LABELS[l.lesson_type] || l.lesson_type}</Badge></td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => moveLesson(idx, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === lessons.length - 1} onClick={() => moveLesson(idx, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteLesson(l.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {lessons.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">لا توجد شرائح بعد.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            },
            {
              key: "quiz", title: "اختبار الدورة", defaultOpen: false,
              summary: <span className="text-[12px] text-muted-foreground">{questions.length} سؤال</span>,
              children: (
                <div className="space-y-3">
                  <Button size="sm" variant="outline" disabled={isNew} onClick={addQuestion}><Plus className="h-4 w-4 ml-1" /> سؤال جديد</Button>
                  {questions.map((qq, qi) => (
                    <div key={qq.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-muted-foreground">س{qi + 1}</span>
                        <Input
                          defaultValue={qq.question}
                          onBlur={(e) => e.target.value !== qq.question && updateQuestion(qq.id, { question: e.target.value })}
                          className="h-8 text-[13px]"
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                          onClick={async () => { await supabase.from("training_quiz_questions").delete().eq("id", qq.id); refetch(); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {qq.options.map((op, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={qq.correct_index === oi}
                              onChange={() => updateQuestion(qq.id, { correct_index: oi })}
                            />
                            <Input
                              defaultValue={op}
                              onBlur={(e) => {
                                if (e.target.value === op) return;
                                const opts = [...qq.options]; opts[oi] = e.target.value;
                                updateQuestion(qq.id, { options: opts });
                              }}
                              className="h-8 text-[13px]"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="text-[12px]"
                          onClick={() => updateQuestion(qq.id, { options: [...qq.options, "خيار جديد"] })}>
                          + إضافة خيار
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: "trainees", title: "المتدربون والإنجاز", defaultOpen: false,
              summary: <span className="text-[12px] text-muted-foreground">{assigned.size} مكلّف • {enrollments.filter((e) => e.completed_at).length} أنهى</span>,
              children: (
                <div className="space-y-2">
                  <Button size="sm" variant="outline" disabled={isNew} onClick={assignAll}><Users className="h-4 w-4 ml-1" /> تكليف جميع الموظفين</Button>
                  <div className="rounded-lg border border-border overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-muted/60 border-b border-border sticky top-0">
                        <tr className="text-right">
                          <th className="px-3 py-2 w-16">مكلّف</th>
                          <th className="px-3 py-2">الموظف</th>
                          <th className="px-3 py-2">التقدم</th>
                          <th className="px-3 py-2">النتيجة</th>
                          <th className="px-3 py-2">الإنهاء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((e) => {
                          const en = progressByEmp.get(e.id);
                          const done = en?.completed_lesson_ids?.length || 0;
                          return (
                            <tr key={e.id} className="border-b border-border/60">
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={assigned.has(e.id)} onChange={() => toggleAssign(e.id)} disabled={isNew} />
                              </td>
                              <td className="px-3 py-2">{e.full_name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{lessons.length ? `${done} / ${lessons.length}` : "—"}</td>
                              <td className="px-3 py-2">{en?.score != null ? `${en.score}%` : "—"}</td>
                              <td className="px-3 py-2">{en?.completed_at ? new Date(en.completed_at).toLocaleDateString("ar") : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </FinanceShell>
  );
}
import { useEffect, useMemo, useState } from "react";
import { GraduationCap, ChevronLeft, ChevronRight, CheckCircle2, Award, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LessonSlideView } from "@/components/training/LessonSlideView";
import type { TrainingCourse, TrainingLesson, TrainingQuestion } from "@/hooks/training/useTraining";

interface Props { employeeId: string }

export default function EmployeeTrainingTab({ employeeId }: Props) {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCourse, setOpenCourse] = useState<TrainingCourse | null>(null);

  const load = async () => {
    setLoading(true);
    const [cRes, eRes] = await Promise.all([
      supabase.from("training_courses").select("*").eq("status", "published").order("created_at", { ascending: false }),
      supabase.from("training_enrollments").select("*").eq("employee_id", employeeId),
    ]);
    setCourses((cRes.data || []) as any);
    setEnrollments((eRes.data || []) as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employeeId]);

  const enrollmentOf = (courseId: string) => enrollments.find((e) => e.course_id === courseId);

  if (openCourse) {
    return (
      <CoursePlayer
        course={openCourse}
        employeeId={employeeId}
        enrollment={enrollmentOf(openCourse.id)}
        onBack={() => { setOpenCourse(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-3 p-3" dir="rtl">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold">دوراتي التدريبية</h2>
      </div>

      {loading && <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل…</div>}
      {!loading && courses.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-10">لا توجد دورات متاحة حالياً.</div>
      )}

      {courses.map((c) => {
        const en = enrollmentOf(c.id);
        const done = !!en?.completed_at;
        return (
          <Card key={c.id} className="rounded-2xl border-border">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{c.title}</div>
                  {c.description && <div className="text-[12px] text-muted-foreground line-clamp-2">{c.description}</div>}
                </div>
                {c.is_mandatory && <Badge variant="outline" className="shrink-0 text-[10px]">إلزامية</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-muted-foreground">
                  {done ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> مكتملة {en?.score != null ? `· ${en.score}%` : ""}
                    </span>
                  ) : en ? "قيد التقدّم" : `${c.duration_minutes || 0} دقيقة`}
                </div>
                <Button size="sm" className="h-8 rounded-xl text-xs" onClick={() => setOpenCourse(c)}>
                  {done ? "مراجعة" : en ? "متابعة" : "ابدأ الدورة"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CoursePlayer({ course, employeeId, enrollment, onBack }: {
  course: TrainingCourse; employeeId: string; enrollment: any; onBack: () => void;
}) {
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [i, setI] = useState(enrollment?.last_lesson_index || 0);
  const [phase, setPhase] = useState<"lessons" | "quiz" | "result">("lessons");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>(enrollment?.completed_lesson_ids || []);

  useEffect(() => {
    (async () => {
      const [lRes, qRes] = await Promise.all([
        supabase.from("training_lessons").select("*").eq("course_id", course.id).order("sort_order"),
        supabase.from("training_quiz_questions").select("*").eq("course_id", course.id).order("sort_order"),
      ]);
      setLessons((lRes.data || []) as any);
      setQuestions(((qRes.data || []) as any[]).map((q) => ({ ...q, options: Array.isArray(q.options) ? q.options : [] })));
      setLoading(false);
    })();
  }, [course.id]);

  const saveProgress = async (idx: number, lessonIds: string[]) => {
    await supabase.from("training_enrollments").upsert({
      course_id: course.id, employee_id: employeeId, user_id: course.user_id,
      last_lesson_index: idx, completed_lesson_ids: lessonIds,
    } as any, { onConflict: "course_id,employee_id" });
  };

  useEffect(() => {
    const l = lessons[i];
    if (!l) return;
    const next = seen.includes(l.id) ? seen : [...seen, l.id];
    if (next.length !== seen.length) setSeen(next);
    saveProgress(i, next);
    // eslint-disable-next-line
  }, [i, lessons.length]);

  const progress = useMemo(() => (lessons.length ? Math.round(((i + 1) / lessons.length) * 100) : 0), [i, lessons.length]);

  const submitQuiz = async () => {
    const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
    const pct = questions.length ? Math.round((correct / questions.length) * 100) : 100;
    setScore(pct);
    setPhase("result");
    const passed = pct >= (course.pass_score || 0);
    await supabase.from("training_enrollments").upsert({
      course_id: course.id, employee_id: employeeId, user_id: course.user_id,
      last_lesson_index: i, completed_lesson_ids: seen, score: pct,
      completed_at: passed ? new Date().toISOString() : null,
    } as any, { onConflict: "course_id,employee_id" });
    toast[passed ? "success" : "error"](passed ? "أحسنت! اجتزت الدورة" : "لم تجتز الدورة، أعد المحاولة");
  };

  const finishWithoutQuiz = async () => {
    await supabase.from("training_enrollments").upsert({
      course_id: course.id, employee_id: employeeId, user_id: course.user_id,
      last_lesson_index: i, completed_lesson_ids: seen, completed_at: new Date().toISOString(),
    } as any, { onConflict: "course_id,employee_id" });
    toast.success("تم إنهاء الدورة");
    onBack();
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">جاري التحميل…</div>;

  return (
    <div className="flex flex-col min-h-full" dir="rtl">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <div className="text-[12px] font-semibold truncate">{course.title}</div>
          <span className="text-[11px] text-muted-foreground">{phase === "lessons" ? `${i + 1}/${lessons.length}` : ""}</span>
        </div>
        <div className="h-1 mt-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${phase === "lessons" ? progress : 100}%` }} />
        </div>
      </div>

      <div className="flex-1 p-3">
        {phase === "lessons" && (lessons[i]
          ? <LessonSlideView lesson={lessons[i]} />
          : <div className="text-center text-sm text-muted-foreground py-10">لا يوجد محتوى.</div>)}

        {phase === "quiz" && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm">الاختبار النهائي</h3>
            {questions.map((q, qi) => (
              <Card key={q.id} className="rounded-2xl">
                <CardContent className="p-3 space-y-2">
                  <div className="text-[13px] font-medium">{qi + 1}. {q.question}</div>
                  <div className="space-y-1.5">
                    {q.options.map((op, oi) => (
                      <button
                        key={oi}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                        className={`w-full text-right text-[13px] rounded-xl border px-3 py-2 transition-colors ${
                          answers[q.id] === oi ? "border-primary bg-primary/10" : "border-border"
                        }`}
                      >{op}</button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button className="w-full h-11 rounded-2xl" disabled={Object.keys(answers).length < questions.length} onClick={submitQuiz}>
              إرسال الإجابات
            </Button>
          </div>
        )}

        {phase === "result" && (
          <div className="text-center py-10 space-y-3">
            <Award className={`h-12 w-12 mx-auto ${score! >= (course.pass_score || 0) ? "text-emerald-500" : "text-muted-foreground"}`} />
            <div className="text-2xl font-bold">{score}%</div>
            <div className="text-sm text-muted-foreground">
              {score! >= (course.pass_score || 0) ? "مبروك، اجتزت الدورة بنجاح" : `درجة النجاح المطلوبة ${course.pass_score}%`}
            </div>
            <div className="flex gap-2 justify-center">
              {score! < (course.pass_score || 0) && (
                <Button variant="outline" className="rounded-2xl" onClick={() => { setAnswers({}); setScore(null); setPhase("quiz"); }}>إعادة المحاولة</Button>
              )}
              <Button className="rounded-2xl" onClick={onBack}>إنهاء</Button>
            </div>
          </div>
        )}
      </div>

      {phase === "lessons" && (
        <div className="sticky bottom-0 bg-background border-t border-border p-2 flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" disabled={i === 0} onClick={() => setI((v) => v - 1)}>
            <ChevronRight className="h-4 w-4 ml-1" /> السابق
          </Button>
          {i < lessons.length - 1 ? (
            <Button size="sm" className="rounded-xl" onClick={() => setI((v) => v + 1)}>
              التالي <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          ) : questions.length ? (
            <Button size="sm" className="rounded-xl" onClick={() => setPhase("quiz")}>ابدأ الاختبار</Button>
          ) : (
            <Button size="sm" className="rounded-xl" onClick={finishWithoutQuiz}>إنهاء الدورة</Button>
          )}
        </div>
      )}
    </div>
  );
}
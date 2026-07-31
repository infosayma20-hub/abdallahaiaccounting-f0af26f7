import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonSlideView } from "@/components/training/LessonSlideView";
import { useTrainingCourse } from "@/hooks/training/useTraining";

/** عرض تقديمي للدورة بملء الشاشة (بدون نوافذ منبثقة) */
export default function TrainingPlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { course, lessons, loading } = useTrainingCourse(id);
  const [i, setI] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setI((v) => Math.min(v + 1, lessons.length - 1));
      if (e.key === "ArrowRight") setI((v) => Math.max(v - 1, 0));
      if (e.key === "Escape") navigate(`/training/courses/${id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lessons.length, id, navigate]);

  if (loading) return <div className="p-8 text-center text-muted-foreground" dir="rtl">جاري التحميل…</div>;
  if (!course) return <div className="p-8 text-center text-muted-foreground" dir="rtl">الدورة غير موجودة</div>;

  const lesson = lessons[i];

  return (
    <div dir="rtl" className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card px-4 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">عرض تقديمي</div>
          <h1 className="text-[15px] font-bold truncate">{course.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">{lessons.length ? i + 1 : 0} / {lessons.length}</span>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/training/courses/${course.id}`)}>
            <X className="h-4 w-4 ml-1" /> إغلاق
          </Button>
        </div>
      </div>

      <div className="h-1 bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${lessons.length ? ((i + 1) / lessons.length) * 100 : 0}%` }} />
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          {lesson ? <LessonSlideView lesson={lesson} /> : (
            <div className="text-center text-muted-foreground py-16">لا توجد شرائح في هذه الدورة بعد.</div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between">
        <Button size="sm" variant="outline" disabled={i === 0} onClick={() => setI((v) => v - 1)}>
          <ChevronRight className="h-4 w-4 ml-1" /> السابق
        </Button>
        <Button size="sm" disabled={i >= lessons.length - 1} onClick={() => setI((v) => v + 1)}>
          التالي <ChevronLeft className="h-4 w-4 mr-1" />
        </Button>
      </div>
    </div>
  );
}
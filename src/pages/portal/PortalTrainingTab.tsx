import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Loader2, ChevronLeft, ChevronRight, Users, CheckCircle2 } from "lucide-react";
import { LessonSlideView } from "@/components/training/LessonSlideView";
import type { TrainingCourse, TrainingLesson } from "@/hooks/training/useTraining";

interface Props { theme: "dark" | "light" }

interface Row extends TrainingCourse { lessonCount: number; assigned: number; completed: number }

/**
 * عارض الورشات والدورات لبوابة الإدارة (كمال، مصعب…).
 * الوصول عبر RLS: is_team_member(auth.uid(), training_courses.user_id).
 */
export default function PortalTrainingTab({ theme }: Props) {
  const dark = theme === "dark";
  const c = dark
    ? { bg: "#0a0a0a", card: "#161616", border: "#262626", text: "#F1F5F9", muted: "#A1A1AA", chip: "#1e1e1e" }
    : { bg: "#F8FAFC", card: "#FFFFFF", border: "#E2E8F0", text: "#0D1B2E", muted: "#64748B", chip: "#F1F5F9" };

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [cRes, lRes, aRes, eRes] = await Promise.all([
        supabase.from("training_courses").select("*").order("created_at", { ascending: false }),
        supabase.from("training_lessons").select("id,course_id"),
        supabase.from("training_assignments").select("course_id"),
        supabase.from("training_enrollments").select("course_id,completed_at"),
      ]);
      if (cancelled) return;
      if (cRes.error) { setError(cRes.error.message); setLoading(false); return; }
      const lessons = (lRes.data || []) as any[];
      const assigns = (aRes.data || []) as any[];
      const enrolls = (eRes.data || []) as any[];
      setRows(((cRes.data || []) as any[]).map((co) => ({
        ...co,
        lessonCount: lessons.filter((l) => l.course_id === co.id).length,
        assigned: assigns.filter((a) => a.course_id === co.id).length,
        completed: enrolls.filter((e) => e.course_id === co.id && e.completed_at).length,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const openCourse = useMemo(() => rows.find((r) => r.id === openId) || null, [rows, openId]);

  if (openCourse) return <CourseSlides course={openCourse} theme={theme} onBack={() => setOpenId(null)} />;

  return (
    <div dir="rtl" style={{ background: c.bg, minHeight: "100%", padding: 12, fontFamily: "Cairo" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <GraduationCap size={18} color={c.text} />
        <h2 style={{ color: c.text, fontSize: 15, fontWeight: 800, margin: 0 }}>الورشات والدورات</h2>
      </div>

      {loading && (
        <div style={{ color: c.muted, display: "flex", justifyContent: "center", padding: 32 }}>
          <Loader2 className="animate-spin" size={20} />
        </div>
      )}
      {error && <div style={{ color: "#DC2626", fontSize: 12 }}>تعذّر تحميل الدورات: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: c.muted, fontSize: 13, textAlign: "center", padding: 32 }}>لا توجد دورات بعد.</div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenId(r.id)}
            style={{
              background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 12,
              textAlign: "right", cursor: "pointer", fontFamily: "Cairo",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: c.text, fontWeight: 700, fontSize: 14 }}>{r.title}</div>
                {r.description && <div style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{r.description}</div>}
              </div>
              <span style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 999,
                background: r.status === "published" ? "rgba(16,185,129,0.12)" : c.chip,
                color: r.status === "published" ? "#10B981" : c.muted, whiteSpace: "nowrap",
              }}>{r.status === "published" ? "منشورة" : r.status === "archived" ? "مؤرشفة" : "مسودة"}</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, color: c.muted, fontSize: 11 }}>
              <span>{r.lessonCount} شريحة</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={12} /> {r.assigned} مكلّف</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> {r.completed} أنهى</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CourseSlides({ course, theme, onBack }: { course: TrainingCourse; theme: "dark" | "light"; onBack: () => void }) {
  const dark = theme === "dark";
  const c = dark
    ? { bg: "#0a0a0a", card: "#161616", border: "#262626", text: "#F1F5F9", muted: "#A1A1AA" }
    : { bg: "#F8FAFC", card: "#FFFFFF", border: "#E2E8F0", text: "#0D1B2E", muted: "#64748B" };
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [i, setI] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("training_lessons").select("*").eq("course_id", course.id).order("sort_order");
      setLessons((data || []) as any);
      setLoading(false);
    })();
  }, [course.id]);

  return (
    <div dir="rtl" style={{ background: c.bg, minHeight: "100%", fontFamily: "Cairo" }}>
      <div style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={onBack} style={{
          background: c.card, border: `1px solid ${c.border}`, borderRadius: 10,
          padding: "6px 10px", cursor: "pointer", color: c.text, fontFamily: "Cairo", fontSize: 12,
        }}>← رجوع</button>
        <div style={{ color: c.text, fontSize: 13, fontWeight: 700, flex: 1, textAlign: "center" }}>{course.title}</div>
        <span style={{ color: c.muted, fontSize: 11 }}>{lessons.length ? i + 1 : 0}/{lessons.length}</span>
      </div>

      <div style={{ height: 3, background: dark ? "#1e1e1e" : "#E2E8F0", margin: "0 12px", borderRadius: 999 }}>
        <div style={{ height: "100%", width: `${lessons.length ? ((i + 1) / lessons.length) * 100 : 0}%`, background: "#0D1B2E", borderRadius: 999, transition: "width .2s" }} />
      </div>

      <div className={dark ? "dark" : ""} style={{ padding: 12 }}>
        {loading ? (
          <div style={{ color: c.muted, textAlign: "center", padding: 32 }}>جاري التحميل…</div>
        ) : lessons[i] ? (
          <div className="bg-background rounded-xl p-2">
            <LessonSlideView lesson={lessons[i]} />
          </div>
        ) : (
          <div style={{ color: c.muted, textAlign: "center", padding: 32 }}>لا يوجد محتوى في هذه الدورة.</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", padding: 12, gap: 8 }}>
        <button
          disabled={i === 0}
          onClick={() => setI((v) => v - 1)}
          style={{
            background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: "8px 14px",
            color: c.text, opacity: i === 0 ? 0.4 : 1, cursor: i === 0 ? "default" : "pointer",
            fontFamily: "Cairo", fontSize: 12, display: "flex", alignItems: "center", gap: 4,
          }}
        ><ChevronRight size={14} /> السابق</button>
        <button
          disabled={i >= lessons.length - 1}
          onClick={() => setI((v) => v + 1)}
          style={{
            background: "#0D1B2E", border: "none", borderRadius: 12, padding: "8px 14px",
            color: "#fff", opacity: i >= lessons.length - 1 ? 0.4 : 1,
            cursor: i >= lessons.length - 1 ? "default" : "pointer",
            fontFamily: "Cairo", fontSize: 12, display: "flex", alignItems: "center", gap: 4,
          }}
        >التالي <ChevronLeft size={14} /></button>
      </div>
    </div>
  );
}
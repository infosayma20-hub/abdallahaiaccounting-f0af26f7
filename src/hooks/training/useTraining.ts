import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LessonContent {
  bullets?: string[];
  note?: string;
  quote?: { text: string; source?: string };
  steps?: { n: number; title: string; desc?: string }[];
  columns?: { title: string; items: string[] }[];
  badge?: { title: string; items: string[] };
}

export interface TrainingCourse {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  cover_image_url: string | null;
  status: string;
  is_mandatory: boolean;
  pass_score: number;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingLesson {
  id: string;
  course_id: string;
  user_id: string;
  sort_order: number;
  section: string | null;
  title: string;
  subtitle: string | null;
  lesson_type: string;
  content: LessonContent;
}

export interface TrainingQuestion {
  id: string;
  course_id: string;
  user_id: string;
  sort_order: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

export interface TrainingEnrollment {
  id: string;
  course_id: string;
  employee_id: string;
  user_id: string;
  last_lesson_index: number;
  completed_lesson_ids: string[];
  score: number | null;
  completed_at: string | null;
  acknowledged_at: string | null;
  started_at: string;
}

/** قائمة الدورات للإدارة (الورشات والدورات) */
export function useTrainingCourses() {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("training_courses")
      .select("*")
      .order("created_at", { ascending: false });
    setCourses((data || []) as unknown as TrainingCourse[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { courses, loading, refetch };
}

/** تفاصيل دورة واحدة مع شرائحها وأسئلتها */
export function useTrainingCourse(courseId?: string) {
  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!courseId) { setLoading(false); return; }
    setLoading(true);
    const [cRes, lRes, qRes] = await Promise.all([
      supabase.from("training_courses").select("*").eq("id", courseId).maybeSingle(),
      supabase.from("training_lessons").select("*").eq("course_id", courseId).order("sort_order"),
      supabase.from("training_quiz_questions").select("*").eq("course_id", courseId).order("sort_order"),
    ]);
    setCourse((cRes.data || null) as unknown as TrainingCourse | null);
    setLessons((lRes.data || []) as unknown as TrainingLesson[]);
    setQuestions((qRes.data || []) as unknown as TrainingQuestion[]);
    setLoading(false);
  }, [courseId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { course, lessons, questions, loading, refetch };
}

export const COURSE_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  published: "منشورة",
  archived: "مؤرشفة",
};

export const LESSON_TYPE_LABELS: Record<string, string> = {
  cover: "غلاف",
  section: "فاصل محور",
  content: "محتوى",
  warning: "محظورات",
};
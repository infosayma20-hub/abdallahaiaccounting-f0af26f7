-- helper: is the current auth user an active employee of this owner tenant?
CREATE OR REPLACE FUNCTION public.is_employee_of_owner(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.auth_user_id = auth.uid() AND e.user_id = _owner AND e.is_active
  );
$$;

-- ══ courses ══
CREATE TABLE public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft',
  is_mandatory boolean NOT NULL DEFAULT false,
  pass_score integer NOT NULL DEFAULT 0,
  duration_minutes integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_courses TO authenticated;
GRANT ALL ON public.training_courses TO service_role;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages courses" ON public.training_courses FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'))
  WITH CHECK (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'));
CREATE POLICY "Employees read published courses" ON public.training_courses FOR SELECT TO authenticated
  USING (status = 'published' AND public.is_employee_of_owner(user_id));

-- ══ lessons ══
CREATE TABLE public.training_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  section text,
  title text NOT NULL,
  subtitle text,
  lesson_type text NOT NULL DEFAULT 'content',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_training_lessons_course ON public.training_lessons(course_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_lessons TO authenticated;
GRANT ALL ON public.training_lessons TO service_role;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages lessons" ON public.training_lessons FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'))
  WITH CHECK (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'));
CREATE POLICY "Employees read lessons of published courses" ON public.training_lessons FOR SELECT TO authenticated
  USING (public.is_employee_of_owner(user_id) AND EXISTS (
    SELECT 1 FROM public.training_courses c WHERE c.id = course_id AND c.status = 'published'
  ));

-- ══ quiz questions ══
CREATE TABLE public.training_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL DEFAULT 0,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_training_quiz_course ON public.training_quiz_questions(course_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_quiz_questions TO authenticated;
GRANT ALL ON public.training_quiz_questions TO service_role;
ALTER TABLE public.training_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages quiz" ON public.training_quiz_questions FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'))
  WITH CHECK (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'));
CREATE POLICY "Employees read quiz of published courses" ON public.training_quiz_questions FOR SELECT TO authenticated
  USING (public.is_employee_of_owner(user_id) AND EXISTS (
    SELECT 1 FROM public.training_courses c WHERE c.id = course_id AND c.status = 'published'
  ));

-- ══ assignments ══
CREATE TABLE public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  user_id uuid NOT NULL,
  assigned_by uuid,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, employee_id)
);
CREATE INDEX idx_training_assignments_emp ON public.training_assignments(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_assignments TO authenticated;
GRANT ALL ON public.training_assignments TO service_role;
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages assignments" ON public.training_assignments FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'))
  WITH CHECK (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'));
CREATE POLICY "Employees read own assignments" ON public.training_assignments FOR SELECT TO authenticated
  USING (employee_id = public.get_employee_id_for_user(auth.uid()));

-- ══ enrollments / progress ══
CREATE TABLE public.training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_lesson_index integer NOT NULL DEFAULT 0,
  completed_lesson_ids uuid[] NOT NULL DEFAULT '{}',
  score integer,
  completed_at timestamptz,
  acknowledged_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, employee_id)
);
CREATE INDEX idx_training_enrollments_emp ON public.training_enrollments(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_enrollments TO authenticated;
GRANT ALL ON public.training_enrollments TO service_role;
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages enrollments" ON public.training_enrollments FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'))
  WITH CHECK (public.is_team_member(auth.uid(), user_id) OR public.has_role(auth.uid(), 'hr_manager'));
CREATE POLICY "Employees manage own enrollment" ON public.training_enrollments FOR ALL TO authenticated
  USING (employee_id = public.get_employee_id_for_user(auth.uid()))
  WITH CHECK (employee_id = public.get_employee_id_for_user(auth.uid()));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.training_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_training_courses_touch BEFORE UPDATE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION public.training_touch_updated_at();
CREATE TRIGGER trg_training_lessons_touch BEFORE UPDATE ON public.training_lessons
  FOR EACH ROW EXECUTE FUNCTION public.training_touch_updated_at();
CREATE TRIGGER trg_training_quiz_touch BEFORE UPDATE ON public.training_quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.training_touch_updated_at();
CREATE TRIGGER trg_training_enrollments_touch BEFORE UPDATE ON public.training_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.training_touch_updated_at();
CREATE TABLE public.job_application_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'طلب توظيف',
  description text,
  branch_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_application_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_application_links TO authenticated;
GRANT ALL ON public.job_application_links TO service_role;
ALTER TABLE public.job_application_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active links"
ON public.job_application_links FOR SELECT TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Team can manage own links"
ON public.job_application_links FOR ALL TO authenticated
USING (public.is_team_member(auth.uid(), user_id))
WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid REFERENCES public.job_application_links(id) ON DELETE SET NULL,
  branch_id uuid,
  full_name text NOT NULL,
  national_id text,
  gender text,
  birth_date date,
  birth_place text,
  marital_status text,
  children_count integer,
  address text,
  phone text NOT NULL,
  email text,
  desired_position text,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  courses jsonb NOT NULL DEFAULT '[]'::jsonb,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  referees jsonb NOT NULL DEFAULT '[]'::jsonb,
  shift_preference text,
  job_type text,
  work_location text,
  smoker boolean,
  works_friday boolean,
  has_driving_license boolean,
  driving_license_type text,
  notes text,
  attachment_path text,
  status text NOT NULL DEFAULT 'new',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  source text NOT NULL DEFAULT 'public_link',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_applications_user_created ON public.job_applications (user_id, created_at DESC);
CREATE INDEX idx_job_applications_status ON public.job_applications (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view company applications"
ON public.job_applications FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can update company applications"
ON public.job_applications FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id))
WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can insert company applications"
ON public.job_applications FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can delete company applications"
ON public.job_applications FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER trg_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_job_application_links_updated_at
BEFORE UPDATE ON public.job_application_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notify_on_job_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target   RECORD;
  v_title    text := '🧾 طلب توظيف جديد';
  v_body     text;
  v_path     text;
  v_lines    text[] := '{}';
BEGIN
  v_lines := array_append(v_lines, '👤 ' || NEW.full_name);
  IF NULLIF(TRIM(COALESCE(NEW.desired_position,'')), '') IS NOT NULL THEN
    v_lines := array_append(v_lines, '💼 الوظيفة المطلوبة: ' || NEW.desired_position);
  END IF;
  IF NULLIF(TRIM(COALESCE(NEW.phone,'')), '') IS NOT NULL THEN
    v_lines := array_append(v_lines, '📞 ' || NEW.phone);
  END IF;
  v_lines := array_append(v_lines,
    '🕒 ' || to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD HH24:MI'));
  v_body := array_to_string(v_lines, E'\n');
  v_path := '/hr/job-applications?app=' || NEW.id::text;

  FOR v_target IN
    SELECT DISTINCT auth_user_id FROM (
      SELECT p.auth_user_id
        FROM public.malaki_portal_users p
       WHERE p.user_id = NEW.user_id
         AND p.role = 'owner'
         AND p.is_active
         AND p.auth_user_id IS NOT NULL
      UNION
      SELECT ur.user_id AS auth_user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('hr_manager'::app_role, 'admin'::app_role)
         AND public.is_team_member(ur.user_id, NEW.user_id)
    ) t
  LOOP
    INSERT INTO public.notification_log (user_id, type, channel, title, body, path)
    VALUES (v_target.auth_user_id, 'job_application_new', 'in_app', v_title, v_body, v_path);

    BEGIN
      PERFORM public.enqueue_notification(
        v_target.auth_user_id,
        'job_application_new',
        v_title,
        v_body,
        v_path,
        jsonb_build_object('source_id', NEW.id::text),
        'low',
        3::smallint,
        'jobapp:' || NEW.id::text || ':u:' || v_target.auth_user_id::text,
        NEW.created_at,
        NULL
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_on_job_application
AFTER INSERT ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.notify_on_job_application();

CREATE POLICY "Team can read job application files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-applications');

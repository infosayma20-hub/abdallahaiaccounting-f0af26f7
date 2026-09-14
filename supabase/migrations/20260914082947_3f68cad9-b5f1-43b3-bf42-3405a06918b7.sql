-- 1) ربط سجل النموذج بالموظف المقيَّم (اختياري، لا يمس السجلات القديمة)
ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS subject_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_forms_subject_employee
  ON public.employee_forms (subject_employee_id, created_at DESC)
  WHERE subject_employee_id IS NOT NULL;

COMMENT ON COLUMN public.employee_forms.subject_employee_id IS
  'الموظف الذي يتحدث عنه النموذج (مثل الموظف المقيَّم في نماذج التقييم). صاحب السجل يبقى employee_id (من عبّأ النموذج).';

-- 2) تذكير ربع سنوي بتقييم الموظفين (للمشتركين فقط)
CREATE OR REPLACE FUNCTION public.notify_evaluation_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sub    RECORD;
  v_rec    RECORD;
  v_lines  text[];
  v_count  int;
  v_title  text;
  v_body   text;
  v_week   text := to_char((now() AT TIME ZONE 'Asia/Hebron')::date, 'IYYY-"W"IW');
BEGIN
  FOR v_sub IN
    SELECT s.*
      FROM public.form_notification_subscribers s
     WHERE s.is_active
       AND s.form_type = 'evaluation_due'
       AND s.auth_user_id IS NOT NULL
  LOOP
    v_lines := '{}';
    v_count := 0;

    FOR v_rec IN
      WITH scope_emp AS (
        SELECT e.id, e.full_name, e.created_at
          FROM public.employees e
         WHERE e.user_id = v_sub.user_id
           AND e.is_active
           AND (
             v_sub.scope = 'all'
             OR e.branch_id IN (
               SELECT bma.branch_id FROM public.branch_manager_assignments bma
                WHERE bma.user_id = v_sub.auth_user_id
             )
           )
      ), last_eval AS (
        SELECT f.subject_employee_id AS emp_id, max(f.created_at) AS last_at
          FROM public.employee_forms f
         WHERE f.subject_employee_id IS NOT NULL
           AND f.user_id = v_sub.user_id
           AND f.template_id IN (
             SELECT t.id FROM public.form_templates t
              WHERE t.schema -> 'sections' @> '[{"key":"criteria"}]'::jsonb
           )
         GROUP BY 1
      )
      SELECT se.full_name, le.last_at
        FROM scope_emp se
        LEFT JOIN last_eval le ON le.emp_id = se.id
       WHERE (le.last_at IS NULL AND se.created_at < now() - interval '90 days')
          OR le.last_at < now() - interval '90 days'
       ORDER BY le.last_at NULLS FIRST, se.full_name
    LOOP
      v_count := v_count + 1;
      IF v_count <= 20 THEN
        v_lines := array_append(
          v_lines,
          '• ' || v_rec.full_name || ' — ' ||
          CASE WHEN v_rec.last_at IS NULL
               THEN 'لم يُقيَّم بعد'
               ELSE 'آخر تقييم ' || to_char(v_rec.last_at AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD')
          END
        );
      END IF;
    END LOOP;

    CONTINUE WHEN v_count = 0;

    v_title := '⭐ تذكير: ' || v_count::text || ' موظف بحاجة تقييم';
    v_body  := 'التقييم كل 3 شهور. الموظفون المستحقون:' || E'\n'
               || array_to_string(v_lines, E'\n')
               || CASE WHEN v_count > 20
                       THEN E'\n' || '… و' || (v_count - 20)::text || ' آخرين'
                       ELSE '' END;

    BEGIN
      PERFORM public.enqueue_notification(
        v_sub.auth_user_id, 'evaluation_due', v_title, v_body,
        '/hr/evaluations',
        jsonb_build_object('week', v_week, 'due_count', v_count),
        'low', 3::smallint,
        'evaldue:' || v_week || ':u:' || v_sub.auth_user_id::text,
        now(), NULL
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.notify_evaluation_due() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('notify-evaluation-due-weekly')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-evaluation-due-weekly');

SELECT cron.schedule(
  'notify-evaluation-due-weekly',
  '0 5 * * 0',
  $cron$SELECT public.notify_evaluation_due();$cron$
);
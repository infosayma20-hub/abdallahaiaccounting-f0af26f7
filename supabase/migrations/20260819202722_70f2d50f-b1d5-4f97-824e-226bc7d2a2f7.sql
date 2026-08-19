ALTER TABLE public.attendance_events
  ADD COLUMN IF NOT EXISTS checkout_kind text;

ALTER TABLE public.attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_checkout_kind_check;

ALTER TABLE public.attendance_events
  ADD CONSTRAINT attendance_events_checkout_kind_check
  CHECK (
    checkout_kind IS NULL
    OR (event_type = 'check_out' AND checkout_kind IN ('temporary', 'end_of_day'))
  );

COMMENT ON COLUMN public.attendance_events.checkout_kind IS
  'نية الموظف عند الخروج: temporary = مغادرة مؤقتة سيعود بعدها (تُحتسب ضمن سقف المغادرات), end_of_day = إنهاء دوام (لا تُحتسب مغادرة). NULL = بصمات قديمة أو بصمات دخول.';

-- =========================================================================
-- B2.2.1 — DB-LEVEL ATTENDANCE DAY LOCK
-- =========================================================================

-- 1) Table
CREATE TABLE IF NOT EXISTS public.hr_attendance_locks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid NOT NULL,                  -- tenant owner (matches project pattern)
  attendance_date date NOT NULL,
  branch_id       uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','unlocked')),
  locked_by       uuid NOT NULL,
  locked_at       timestamptz NOT NULL DEFAULT now(),
  reason          text,
  unlocked_by     uuid,
  unlocked_at     timestamptz,
  unlock_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_attendance_locks_unique UNIQUE (auth_user_id, attendance_date, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_attendance_locks_owner_date
  ON public.hr_attendance_locks(auth_user_id, attendance_date)
  WHERE status = 'locked';

-- 2) updated_at trigger
CREATE OR REPLACE FUNCTION public.set_hr_attendance_locks_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_hr_attendance_locks_updated_at ON public.hr_attendance_locks;
CREATE TRIGGER trg_hr_attendance_locks_updated_at
BEFORE UPDATE ON public.hr_attendance_locks
FOR EACH ROW EXECUTE FUNCTION public.set_hr_attendance_locks_updated_at();

-- 3) RLS
ALTER TABLE public.hr_attendance_locks ENABLE ROW LEVEL SECURITY;

-- READ: tenant owner OR team member
CREATE POLICY "Locks: read by tenant team"
ON public.hr_attendance_locks FOR SELECT
USING (auth.uid() = auth_user_id OR public.is_team_member(auth.uid(), auth_user_id));

-- INSERT/UPDATE/DELETE: only admin or hr_manager within tenant scope
CREATE POLICY "Locks: insert by admin/hr_manager"
ON public.hr_attendance_locks FOR INSERT
WITH CHECK (
  (auth.uid() = auth_user_id OR public.is_team_member(auth.uid(), auth_user_id))
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
);

CREATE POLICY "Locks: update by admin/hr_manager"
ON public.hr_attendance_locks FOR UPDATE
USING (
  (auth.uid() = auth_user_id OR public.is_team_member(auth.uid(), auth_user_id))
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
);

CREATE POLICY "Locks: delete by admin/hr_manager"
ON public.hr_attendance_locks FOR DELETE
USING (
  (auth.uid() = auth_user_id OR public.is_team_member(auth.uid(), auth_user_id))
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
);

-- 4) Helper: check if a (tenant, date) is locked
CREATE OR REPLACE FUNCTION public.is_attendance_day_locked(_owner uuid, _date date, _branch uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hr_attendance_locks
    WHERE auth_user_id = _owner
      AND attendance_date = _date
      AND status = 'locked'
      AND (branch_id IS NULL OR _branch IS NULL OR branch_id = _branch)
  );
$$;

-- 5) Guard trigger for attendance_days
CREATE OR REPLACE FUNCTION public.guard_attendance_days_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _owner uuid;
  _date  date;
  _branch uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _owner := OLD.auth_user_id; _date := OLD.attendance_date; _branch := OLD.branch_id;
  ELSE
    _owner := NEW.auth_user_id; _date := NEW.attendance_date; _branch := NEW.branch_id;
    -- Block changing date of an already-locked record too
    IF TG_OP = 'UPDATE' AND public.is_attendance_day_locked(OLD.auth_user_id, OLD.attendance_date, OLD.branch_id) THEN
      RAISE EXCEPTION 'اليوم % مغلق ولا يمكن تعديل سجلات الحضور. الرجاء فتح اليوم أولاً.', to_char(OLD.attendance_date,'YYYY-MM-DD')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF public.is_attendance_day_locked(_owner, _date, _branch) THEN
    RAISE EXCEPTION 'اليوم % مغلق ولا يمكن تعديل سجلات الحضور. الرجاء فتح اليوم أولاً.', to_char(_date,'YYYY-MM-DD')
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_attendance_days_lock ON public.attendance_days;
CREATE TRIGGER trg_guard_attendance_days_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_days
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_days_lock();

-- 6) Guard trigger for correction_requests
CREATE OR REPLACE FUNCTION public.guard_correction_requests_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _owner uuid;
  _date  date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _owner := OLD.auth_user_id; _date := OLD.attendance_date;
  ELSE
    _owner := NEW.auth_user_id; _date := NEW.attendance_date;
    IF TG_OP = 'UPDATE' AND public.is_attendance_day_locked(OLD.auth_user_id, OLD.attendance_date) THEN
      RAISE EXCEPTION 'اليوم % مغلق ولا يمكن تعديل طلبات التصحيح. الرجاء فتح اليوم أولاً.', to_char(OLD.attendance_date,'YYYY-MM-DD')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF public.is_attendance_day_locked(_owner, _date) THEN
    RAISE EXCEPTION 'اليوم % مغلق ولا يمكن إنشاء/تعديل طلبات التصحيح. الرجاء فتح اليوم أولاً.', to_char(_date,'YYYY-MM-DD')
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_correction_requests_lock ON public.correction_requests;
CREATE TRIGGER trg_guard_correction_requests_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.correction_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_correction_requests_lock();

-- 7) Guard trigger for attendance_events (use event_time::date as the day)
CREATE OR REPLACE FUNCTION public.guard_attendance_events_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _owner uuid;
  _date  date;
  _branch uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _owner := OLD.auth_user_id; _date := (OLD.event_time AT TIME ZONE 'Asia/Hebron')::date; _branch := OLD.branch_id;
  ELSE
    _owner := NEW.auth_user_id; _date := (NEW.event_time AT TIME ZONE 'Asia/Hebron')::date; _branch := NEW.branch_id;
  END IF;

  IF public.is_attendance_day_locked(_owner, _date, _branch) THEN
    RAISE EXCEPTION 'اليوم % مغلق ولا يمكن إضافة/حذف بصمات. الرجاء فتح اليوم أولاً.', to_char(_date,'YYYY-MM-DD')
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_attendance_events_lock ON public.attendance_events;
CREATE TRIGGER trg_guard_attendance_events_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_events_lock();

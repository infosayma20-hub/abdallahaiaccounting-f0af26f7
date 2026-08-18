CREATE OR REPLACE FUNCTION public.attendance_break_recompute_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_attendance_day_totals(OLD.attendance_day_id);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_attendance_day_totals(NEW.attendance_day_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_attendance_break_sync_biu ON public.attendance_breaks;
DROP TRIGGER IF EXISTS trg_attendance_break_sync_ad ON public.attendance_breaks;
CREATE TRIGGER trg_attendance_break_sync_biu
AFTER INSERT OR UPDATE ON public.attendance_breaks
FOR EACH ROW EXECUTE FUNCTION public.attendance_break_recompute_trigger();
CREATE TRIGGER trg_attendance_break_sync_ad
AFTER DELETE ON public.attendance_breaks
FOR EACH ROW EXECUTE FUNCTION public.attendance_break_recompute_trigger();

ALTER FUNCTION public.recompute_attendance_day(uuid, date) SECURITY DEFINER;
ALTER FUNCTION public.recompute_attendance_day_totals(uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.recompute_attendance_day(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_attendance_day_totals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day_totals(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.attendance_break_recompute_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_break_recompute_trigger() TO service_role;
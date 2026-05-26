-- Restore full SELECT on base tables so the existing UI keeps working.
-- RLS policies still enforce row-level access; the _safe views remain
-- available for screens that should mask sensitive columns.
GRANT SELECT ON public.employees TO authenticated;
GRANT SELECT ON public.travel_booking_passengers TO authenticated;
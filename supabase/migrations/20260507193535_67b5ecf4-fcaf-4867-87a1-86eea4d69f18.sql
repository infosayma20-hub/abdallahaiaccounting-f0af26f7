DROP VIEW IF EXISTS public.branches_safe;
CREATE VIEW public.branches_safe AS
SELECT id, user_id, name, address, latitude, longitude, radius_meters, is_active,
       qr_rotation_minutes, created_at, updated_at, require_gps
FROM public.branches;
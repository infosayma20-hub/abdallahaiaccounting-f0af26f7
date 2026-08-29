CREATE OR REPLACE VIEW public.branches_safe AS
SELECT id,
    user_id,
    name,
    address,
    latitude,
    longitude,
    radius_meters,
    is_active,
    qr_rotation_minutes,
    created_at,
    updated_at,
    require_gps,
    require_attendance_selfie,
    qr_mode,
    allow_manual_code
   FROM public.branches;
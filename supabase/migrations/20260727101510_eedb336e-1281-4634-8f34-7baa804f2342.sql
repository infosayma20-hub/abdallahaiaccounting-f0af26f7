UPDATE public.attendance_events
SET status = 'invalid',
    notes = COALESCE(NULLIF(notes,''), '') || ' | invalidated by HR: not the employee (Malik Kayed confirmed only morning check-in)'
WHERE id IN (
  '4f023e87-ffad-445e-be5b-118edc3d0382',
  '9ef37b2c-a5c7-45eb-b142-276f578a1793'
);
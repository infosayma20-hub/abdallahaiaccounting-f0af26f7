ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS default_terminal_id uuid REFERENCES public.pos_terminals(id) ON DELETE SET NULL;

-- Name-matched call-center terminals first
UPDATE public.pos_users u
SET default_terminal_id = t.id,
    branch_id = COALESCE(u.branch_id, t.branch_id),
    updated_at = now()
FROM public.pos_terminals t
WHERE u.is_call_center = true
  AND u.default_terminal_id IS NULL
  AND t.is_active = true
  AND btrim(t.name) = btrim(u.name);

-- Everyone else -> Faisal branch call-center station
UPDATE public.pos_users u
SET default_terminal_id = '96a5be6e-74c8-4b4e-8e6e-9242105084dd',
    branch_id = '6296a204-7c0a-419f-9904-ec11889e012f',
    updated_at = now()
WHERE u.is_call_center = true
  AND u.default_terminal_id IS NULL;
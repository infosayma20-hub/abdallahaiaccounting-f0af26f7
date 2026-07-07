UPDATE public.pos_printers
SET terminal_ids = ARRAY['3ac78d8d-b2f2-4608-95ab-4d395c230cf8']::uuid[],
    updated_at = now()
WHERE id = '11911aeb-2472-4e4c-b079-9347ad17ea2c';
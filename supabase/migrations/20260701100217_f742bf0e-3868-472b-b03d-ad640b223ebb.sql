UPDATE public.pos_printers
SET terminal_ids = ARRAY['11beade8-24bb-4d37-81a0-2cd050973f0f']::uuid[],
    is_default = false
WHERE id = '207f50f5-2428-4cec-9160-7f1d3358f0de';
UPDATE public.pos_printers
SET is_default = false, updated_at = now()
WHERE branch_id = '15af6bae-d196-4e1f-bd19-88a70f395ccb'
  AND print_categories @> ARRAY['receipt']::text[]
  AND id <> '86fa53aa-2a9e-44ae-94e7-5e9ac1fd067a';

UPDATE public.pos_printers
SET is_default = true, is_active = true, updated_at = now()
WHERE id = '86fa53aa-2a9e-44ae-94e7-5e9ac1fd067a';
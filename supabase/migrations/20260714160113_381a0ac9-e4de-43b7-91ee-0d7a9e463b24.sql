
-- Pin printers to specific POS terminals in Tayra branch (15af6bae)
-- كاشير 1 (c11d5cfb) → newcash (1ac92765)
-- كاشير 2 (32c7e753) → Cash (4e806129) [already set, ensure exclusive]
-- كاش الحلويات (3ac78d8d) → RONGTA (c2862f5c) [already set]
-- Also remove كاشير 1 & كاشير 2 & كاش الحلويات terminals from any other printer

-- 1. Set newcash to only كاشير 1
UPDATE public.pos_printers
SET terminal_ids = ARRAY['c11d5cfb-d0a6-445c-816c-1dc4215fc7b8']::uuid[]
WHERE id = '1ac92765-c3f4-4696-a9b6-1c748fe50df5';

-- 2. Set Cash to only كاشير 2 (remove دلفري 217c316f)
UPDATE public.pos_printers
SET terminal_ids = ARRAY['32c7e753-21ca-43d1-bce3-b770d743e7df']::uuid[]
WHERE id = '4e806129-99ee-4d01-990a-14829b6a1cbd';

-- 3. Set RONGTA to only كاش الحلويات
UPDATE public.pos_printers
SET terminal_ids = ARRAY['3ac78d8d-b2f2-4608-95ab-4d395c230cf8']::uuid[]
WHERE id = 'c2862f5c-4040-48a3-8087-f99534b51c83';

-- 4. Remove كاشير 1 terminal from all other printers in branch
UPDATE public.pos_printers
SET terminal_ids = array_remove(terminal_ids, 'c11d5cfb-d0a6-445c-816c-1dc4215fc7b8'::uuid)
WHERE branch_id = '15af6bae-d196-4e1f-bd19-88a70f395ccb'
  AND id <> '1ac92765-c3f4-4696-a9b6-1c748fe50df5'
  AND 'c11d5cfb-d0a6-445c-816c-1dc4215fc7b8'::uuid = ANY(terminal_ids);

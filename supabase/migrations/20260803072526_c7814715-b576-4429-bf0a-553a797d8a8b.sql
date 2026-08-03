UPDATE public.cheques
SET party_name = 'مساهمة الشريك احمد ابو عواد',
    notes = COALESCE(NULLIF(TRIM(notes), ''), 'باقي حساب المساهمة'),
    updated_at = now()
WHERE id = 'f7ab361f-237a-452e-8072-bc85ff97cdb0';
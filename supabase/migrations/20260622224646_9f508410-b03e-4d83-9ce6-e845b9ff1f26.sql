UPDATE public.pos_sessions
SET closing_cash = 3297,
    cash_variance = 3297 - expected_cash,
    notes = COALESCE(notes,'') || E'\n[تصحيح] أضيف 100$ (=285₪) من صندوق الدولار لم يُحتسب وقت الإغلاق — يُعادل الفرق الفعلي صفر.'
WHERE id = '0dcc64d6-af09-4dd2-b718-c05f5f7a6df3';
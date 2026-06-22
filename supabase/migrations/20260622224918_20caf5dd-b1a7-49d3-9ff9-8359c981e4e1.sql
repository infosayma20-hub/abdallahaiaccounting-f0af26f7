-- 1) Void order 0012 (wrong card 99 entry)
UPDATE public.transactions
SET is_deleted = true,
    notes = COALESCE(notes,'') || E'\n[إلغاء يدوي] تسجيل فيزا 99 خطأ — التحصيل الفعلي كان 100$ على الفاتورة POS-20260622-0008.'
WHERE id = '84ee9f75-8186-4d58-960b-bc5fc3166ae7';

-- 2) Revert session closing cash to actual ILS drawer count (100$ is in USD drawer)
UPDATE public.pos_sessions
SET closing_cash = 3012,
    cash_variance = 3012 - expected_cash,
    notes = COALESCE(
      regexp_replace(notes, E'\n\\[تصحيح\\] أضيف 100\\$ \\(=285₪\\)[^\n]*', '', 'g'),
      ''
    ) || E'\n[توثيق] الكاش الفعلي 3012₪ في درج الشيكل + 100$ في صندوق الدولار (فاتورة POS-20260622-0008). لا يوجد عجز حقيقي.'
WHERE id = '0dcc64d6-af09-4dd2-b718-c05f5f7a6df3';
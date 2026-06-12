-- Fiscal Period DB-Level Guard — Acceptance Test
-- ------------------------------------------------
-- يتحقق أن التريغر trg_check_fiscal_period يرفض INSERT و UPDATE و DELETE
-- على transactions داخل فترة مقفلة، ويسمح بالعمليات نفسها بعد إعادة فتحها.
--
-- شغّله يدوياً في SQL editor (Supabase) ضمن transaction واحدة حتى يتم
-- التراجع تلقائياً مهما كانت النتيجة — لا تأثير على البيانات الإنتاجية.

BEGIN;

-- 1) أنشئ فترة مغلقة لاختبار اليوم (استبدل :uid بـ user_id حقيقي)
--    لو ما عندك tenant اختباري، استبدل القيمة قبل التشغيل.
\set test_uid '00000000-0000-0000-0000-000000000000'

INSERT INTO public.fiscal_periods (user_id, period_name, start_date, end_date, status)
VALUES (:'test_uid'::uuid, 'AUDIT-LOCK', CURRENT_DATE, CURRENT_DATE, 'closed');

-- 2) محاولة INSERT — يجب أن تفشل
DO $$
BEGIN
  BEGIN
    INSERT INTO public.transactions (
      user_id, transaction_date, amount, debit_account_code, credit_account_code, description
    ) VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid, CURRENT_DATE, 1, '1110', '4100', 'audit-test'
    );
    RAISE EXCEPTION 'FAIL: INSERT was not blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%الفترة المحاسبية%' THEN
      RAISE EXCEPTION 'FAIL: wrong error on INSERT: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS: INSERT blocked — %', SQLERRM;
  END;
END $$;

-- 3) أدرج قيد قديم خارج الفترة (لإثبات UPDATE/DELETE)
INSERT INTO public.transactions (
  id, user_id, transaction_date, amount, debit_account_code, credit_account_code, description
) VALUES (
  gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid,
  CURRENT_DATE - INTERVAL '60 days', 1, '1110', '4100', 'audit-old'
) RETURNING id \gset old_tx_

-- 4) UPDATE يحرّكه لتاريخ مقفل — يجب أن يفشل
DO $$
BEGIN
  BEGIN
    UPDATE public.transactions SET transaction_date = CURRENT_DATE WHERE id = :'old_tx_id'::uuid;
    RAISE EXCEPTION 'FAIL: UPDATE into locked period was not blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%الفترة المحاسبية%' THEN
      RAISE EXCEPTION 'FAIL: wrong error on UPDATE: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS: UPDATE blocked — %', SQLERRM;
  END;
END $$;

-- 5) أدرج قيد بتاريخ اليوم بتجاوز مؤقّت لاختبار DELETE
--    (نوقف التريغر مؤقتاً فقط داخل هذه الـ transaction)
ALTER TABLE public.transactions DISABLE TRIGGER trg_check_fiscal_period;
INSERT INTO public.transactions (
  id, user_id, transaction_date, amount, debit_account_code, credit_account_code, description
) VALUES (
  gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid,
  CURRENT_DATE, 1, '1110', '4100', 'audit-inside'
) RETURNING id \gset inside_tx_
ALTER TABLE public.transactions ENABLE TRIGGER trg_check_fiscal_period;

-- 6) DELETE داخل الفترة المقفلة — يجب أن يفشل (هذا هو الإصلاح الجوهري)
DO $$
BEGIN
  BEGIN
    DELETE FROM public.transactions WHERE id = :'inside_tx_id'::uuid;
    RAISE EXCEPTION 'FAIL: DELETE inside locked period was not blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%الفترة المحاسبية%' THEN
      RAISE EXCEPTION 'FAIL: wrong error on DELETE: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS: DELETE blocked — %', SQLERRM;
  END;
END $$;

-- 7) افتح الفترة وتأكد أن نفس DELETE ينجح الآن
UPDATE public.fiscal_periods SET status = 'open' WHERE period_name = 'AUDIT-LOCK';
DELETE FROM public.transactions WHERE id = :'inside_tx_id'::uuid;

-- تراجع كامل
ROLLBACK;

# المرحلة C — الخطة المعدّلة (تخطيط فقط، بدون تنفيذ)

تم فحص السكيمة الفعلية قبل الكتابة:
- `profiles` يحتوي `full_name` و `display_name` معاً → سنستخدم `coalesce(full_name, display_name)`.
- `feedback_calls.outcome` القيد الحالي: `answered, no_answer, busy, wrong_number, do_not_call` — لا يوجد `callback_requested` ولا `refused` → **migration ستوسّع القيد**.
- `feedback_calls.sentiment` القيد الحالي: `satisfied, unsatisfied, complaint, suggestion, neutral` — **ليس** positive/negative → سنستخدم القيم الموجودة فعلاً ولن نوسّعها بدون داعٍ.
- `call_center_orders` يحتوي `customer_phone` و `user_id` → سنطابق بالـ `normalize_phone`.
- `branches` يحتوي `user_id` (لا `company_id`) → التحقق من ملكية الفرع عبر `branches.user_id = v_owner`.

---

## 1) RPC: `feedback_upsert_customer` — تفرقة create/edit + التحقق من الفرع

التوقيع:
```
feedback_upsert_customer(p_phone text, p_full_name text, p_branch_id uuid)
returns table(id, display_phone, normalized_phone, full_name, last_known_branch_id, do_not_call, was_created bool)
```

السلوك:
1. `auth.uid() not null`، استخراج `v_owner = get_team_owner_id(auth.uid())`.
2. `normalize_phone(p_phone)` → إذا < 7 أرقام → `INVALID_PHONE`.
3. `p_branch_id is not null` → تحقق `exists(branches where id=p_branch_id and user_id=v_owner)` → وإلا `BRANCH_NOT_FOUND`.
4. ابحث عن صف موجود `(user_id=v_owner, normalized_phone=v_norm)`:
   - **غير موجود** → يتطلب `customers.create` (وإلا `PERMISSION_DENIED`) ثم INSERT. `was_created=true`.
   - **موجود** ولا يوجد تغيير فعلي (name/branch لم يتغيرا أو لم يُمرَّرا) → ارجع الصف كما هو. `was_created=false`. لا يحتاج صلاحية edit.
   - **موجود** ويوجد تغيير فعلي → يتطلب `customers.edit` ثم UPDATE الحقول الممرَّرة فقط (مع COALESCE للحفاظ على القديم عند null/فارغ). `was_created=false`.
5. هذه RPC **لا تلمس** `do_not_call*`.

ملاحظة الواجهة: عند الضغط على "حفظ كزبون" نعرف مسبقاً (من نتيجة البحث) أنه غير موجود فنطلب صلاحية create فقط. عند "تعديل" نطلب edit. لا يوجد لبس.

---

## 2) RPC: `feedback_log_call` — مع تحقق order ↔ customer

التوقيع: كما السابق + `p_related_order_id uuid`.

السلوك:
1. مصادقة + صلاحية `calls.create` وإلا `PERMISSION_DENIED`.
2. `v_owner = get_team_owner_id(auth.uid())`.
3. اقرأ الزبون: `customer_id` ضمن `user_id=v_owner` وإلا `CUSTOMER_NOT_FOUND`.
4. `do_not_call=true` → `DO_NOT_CALL_ACTIVE`.
5. **توسعة القيد** (في نفس migration) قبل القبول:
   - `outcome ∈ {answered, no_answer, busy, wrong_number, callback_requested, refused, do_not_call}` — أبقينا `do_not_call` لعدم كسر بيانات قديمة، وأضفنا `callback_requested, refused`.
   - `sentiment ∈ {satisfied, unsatisfied, complaint, suggestion, neutral}` — نُبقي القائمة الحالية كما هي. الواجهة ستعرض هذه القيم (لا positive/negative).
6. `rating` بين 1..5 (قيد موجود مسبقاً) — نُكرّر التحقق منعاً لأخطاء واضحة.
7. `needs_followup=true` → `followup_due_at not null` وإلا `FOLLOWUP_DUE_REQUIRED`.
8. `p_related_order_id not null` → 
   - اقرأ `call_center_orders` لصف `id=p_related_order_id and user_id=v_owner` → وإلا `ORDER_NOT_FOUND`.
   - قارن `normalize_phone(order.customer_phone) = customer.normalized_phone` → وإلا `ORDER_CUSTOMER_MISMATCH`.
9. **Rate limit**: رفض إذا وُجدت مكالمة لنفس `(customer_id, called_by=auth.uid())` خلال آخر 60 ثانية → `RATE_LIMITED`.
10. `called_by_name = coalesce(full_name, display_name)` من `profiles where id=auth.uid()`، fallback إلى `null`.
11. INSERT إلى `feedback_calls` (user_id=v_owner, called_by=auth.uid()). Return `uuid`.

لا UPDATE ولا DELETE على المكالمات في هذه المرحلة.

---

## 3) RPC: `feedback_enable_do_not_call` — تفعيل فقط

التوقيع:
```
feedback_enable_do_not_call(p_customer_id uuid, p_reason text) returns void
```

السلوك:
1. مصادقة + صلاحية `customers.edit` وإلا `PERMISSION_DENIED`.
2. `p_reason` بعد trim ≥ 3 أحرف وإلا `REASON_REQUIRED`.
3. UPDATE على الزبون لنفس `v_owner` فقط:
   - `do_not_call=true, do_not_call_reason=trim(p_reason), do_not_call_at=now(), do_not_call_by=auth.uid()`.
4. **التعطيل (disable) غير مدعوم في هذه المرحلة**. إذا رغبت الواجهة باستدعاء "إلغاء"، RPC مستقلة لاحقاً مع audit trail. (دالة معطّلة `feedback_disable_do_not_call` لن تُضاف الآن إطلاقاً — لا حتى كـ stub.)

---

## 4) Migration — ملف واحد جديد

`supabase/migrations/<ts>_feedback_phase_c_rpcs.sql` يحتوي بهذا الترتيب:
1. توسعة قيد `outcome`:
   ```sql
   ALTER TABLE public.feedback_calls DROP CONSTRAINT feedback_calls_outcome_check;
   ALTER TABLE public.feedback_calls ADD CONSTRAINT feedback_calls_outcome_check
     CHECK (outcome IN ('answered','no_answer','busy','wrong_number','callback_requested','refused','do_not_call'));
   ```
   (قيد `sentiment` يبقى كما هو — قائمته الحالية كافية ومقبولة منطقياً.)
2. الـ RPCs الثلاث بالـ `SECURITY DEFINER SET search_path = public`.
3. `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` لكل RPC.

**لا تعديل** على RLS الجداول، **لا** إعادة منح INSERT/UPDATE/DELETE — قفل المرحلة A+ يبقى.

---

## 5) الواجهة — `src/pages/FeedbackPage.tsx`

- **بحث** كما هو (RPC `feedback_search_customers`).
- **لا يوجد زبون**: زر "حفظ كزبون" يظهر فقط إذا `hasPerm('call_center_feedback','customers','create')`. عند الضغط → `feedback_upsert_customer` ثم فتح الملف.
- **ملف الزبون**:
  - عرض do_not_call: إذا `true` → Alert أحمر "هذا الزبون طلب عدم الاتصال" + سبب/تاريخ، **وإخفاء كامل** لـ `NewCallForm`.
  - `EditCustomerForm` (اسم/فرع): يظهر فقط إذا `hasPerm('customers','edit')` → يستدعي نفس `feedback_upsert_customer`.
  - `NewCallForm`: يظهر فقط إذا `hasPerm('calls','create')` و `!do_not_call`. حقول outcome/sentiment تستخدم القوائم المعتمدة أعلاه. زر الإرسال يستدعي `feedback_log_call`.
  - `EnableDoNotCallButton` (فعلياً Dialog لكتابة السبب): يظهر فقط إذا `hasPerm('customers','edit')` و `!do_not_call`. يستدعي `feedback_enable_do_not_call`. لا يوجد زر "إلغاء do_not_call" في الواجهة.
- **لا** `supabase.from('feedback_customers'|'feedback_calls').insert/update/delete` — grep يجب أن يُرجع 0.

`src/integrations/supabase/types.ts` يُحدَّث تلقائياً.

---

## 6) رموز الأخطاء النهائية

`AUTH_REQUIRED`, `PERMISSION_DENIED`, `INVALID_PHONE`, `BRANCH_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `DO_NOT_CALL_ACTIVE`, `INVALID_OUTCOME`, `INVALID_SENTIMENT`, `INVALID_RATING`, `FOLLOWUP_DUE_REQUIRED`, `ORDER_NOT_FOUND`, `ORDER_CUSTOMER_MISMATCH`, `RATE_LIMITED`, `REASON_REQUIRED`.

الواجهة تُترجم كل رمز لرسالة عربية واضحة في toast.

---

## 7) SQL النهائي المقترح للـ RPCs

```sql
-- (1) توسعة قيد outcome
ALTER TABLE public.feedback_calls DROP CONSTRAINT IF EXISTS feedback_calls_outcome_check;
ALTER TABLE public.feedback_calls ADD CONSTRAINT feedback_calls_outcome_check
  CHECK (outcome IN ('answered','no_answer','busy','wrong_number','callback_requested','refused','do_not_call'));

-- (2) UPSERT customer
CREATE OR REPLACE FUNCTION public.feedback_upsert_customer(
  p_phone text, p_full_name text DEFAULT NULL, p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, display_phone text, normalized_phone text, full_name text,
                last_known_branch_id uuid, do_not_call boolean, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_norm text; v_existing feedback_customers%ROWTYPE;
  v_new_name text; v_will_update boolean := false; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_owner := get_team_owner_id(auth.uid());
  v_norm  := normalize_phone(p_phone);
  IF v_norm IS NULL OR length(v_norm) < 7 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches WHERE branches.id = p_branch_id AND branches.user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'BRANCH_NOT_FOUND';
  END IF;

  v_new_name := nullif(trim(p_full_name), '');

  SELECT * INTO v_existing FROM feedback_customers
   WHERE user_id = v_owner AND normalized_phone = v_norm;

  IF NOT FOUND THEN
    IF NOT has_feature_permission(auth.uid(),'call_center_feedback','customers','create') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    INSERT INTO feedback_customers
      (user_id, display_phone, normalized_phone, full_name, last_known_branch_id)
    VALUES (v_owner, p_phone, v_norm, v_new_name, p_branch_id)
    RETURNING feedback_customers.id INTO v_id;

    RETURN QUERY
      SELECT fc.id, fc.display_phone, fc.normalized_phone, fc.full_name,
             fc.last_known_branch_id, fc.do_not_call, TRUE
      FROM feedback_customers fc WHERE fc.id = v_id;
    RETURN;
  END IF;

  v_will_update :=
       (v_new_name IS NOT NULL AND v_new_name IS DISTINCT FROM v_existing.full_name)
    OR (p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_existing.last_known_branch_id);

  IF v_will_update THEN
    IF NOT has_feature_permission(auth.uid(),'call_center_feedback','customers','edit') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    UPDATE feedback_customers fc
       SET full_name = COALESCE(v_new_name, fc.full_name),
           last_known_branch_id = COALESCE(p_branch_id, fc.last_known_branch_id),
           updated_at = now()
     WHERE fc.id = v_existing.id;
  END IF;

  RETURN QUERY
    SELECT fc.id, fc.display_phone, fc.normalized_phone, fc.full_name,
           fc.last_known_branch_id, fc.do_not_call, FALSE
    FROM feedback_customers fc WHERE fc.id = v_existing.id;
END; $$;

REVOKE ALL ON FUNCTION public.feedback_upsert_customer(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_upsert_customer(text,text,uuid) TO authenticated;

-- (3) LOG CALL
CREATE OR REPLACE FUNCTION public.feedback_log_call(
  p_customer_id uuid, p_outcome text,
  p_sentiment text DEFAULT NULL, p_rating int DEFAULT NULL,
  p_complaint_text text DEFAULT NULL, p_suggestion_text text DEFAULT NULL,
  p_note text DEFAULT NULL, p_needs_followup boolean DEFAULT false,
  p_followup_due_at timestamptz DEFAULT NULL, p_related_order_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_cust feedback_customers%ROWTYPE;
  v_order_phone_norm text; v_name text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT has_feature_permission(auth.uid(),'call_center_feedback','calls','create') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_owner := get_team_owner_id(auth.uid());

  SELECT * INTO v_cust FROM feedback_customers
   WHERE id = p_customer_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF v_cust.do_not_call THEN RAISE EXCEPTION 'DO_NOT_CALL_ACTIVE'; END IF;

  IF p_outcome NOT IN ('answered','no_answer','busy','wrong_number','callback_requested','refused') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME';
  END IF;
  IF p_sentiment IS NOT NULL
     AND p_sentiment NOT IN ('satisfied','unsatisfied','complaint','suggestion','neutral') THEN
    RAISE EXCEPTION 'INVALID_SENTIMENT';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'INVALID_RATING';
  END IF;
  IF p_needs_followup AND p_followup_due_at IS NULL THEN
    RAISE EXCEPTION 'FOLLOWUP_DUE_REQUIRED';
  END IF;

  IF p_related_order_id IS NOT NULL THEN
    SELECT normalize_phone(customer_phone) INTO v_order_phone_norm
      FROM call_center_orders
     WHERE id = p_related_order_id AND user_id = v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
    IF v_order_phone_norm IS DISTINCT FROM v_cust.normalized_phone THEN
      RAISE EXCEPTION 'ORDER_CUSTOMER_MISMATCH';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM feedback_calls
     WHERE customer_id = p_customer_id
       AND called_by = auth.uid()
       AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;

  SELECT COALESCE(full_name, display_name) INTO v_name
    FROM profiles WHERE id = auth.uid();

  INSERT INTO feedback_calls (
    user_id, customer_id, related_order_id, outcome, sentiment, rating,
    complaint_text, suggestion_text, note, needs_followup, followup_due_at,
    called_by, called_by_name
  ) VALUES (
    v_owner, p_customer_id, p_related_order_id, p_outcome, p_sentiment, p_rating,
    nullif(trim(p_complaint_text),''), nullif(trim(p_suggestion_text),''), nullif(trim(p_note),''),
    COALESCE(p_needs_followup,false), p_followup_due_at,
    auth.uid(), v_name
  ) RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.feedback_log_call(uuid,text,text,int,text,text,text,boolean,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_log_call(uuid,text,text,int,text,text,text,boolean,timestamptz,uuid) TO authenticated;

-- (4) ENABLE do_not_call (تفعيل فقط — لا تعطيل في هذه المرحلة)
CREATE OR REPLACE FUNCTION public.feedback_enable_do_not_call(
  p_customer_id uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT has_feature_permission(auth.uid(),'call_center_feedback','customers','edit') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  v_owner := get_team_owner_id(auth.uid());

  UPDATE feedback_customers
     SET do_not_call = true,
         do_not_call_reason = trim(p_reason),
         do_not_call_at = now(),
         do_not_call_by = auth.uid(),
         updated_at = now()
   WHERE id = p_customer_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.feedback_enable_do_not_call(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_enable_do_not_call(uuid,text) TO authenticated;
```

---

## 8) خطة الاختبار

موجبة:
1. مستخدم بـ create يحفظ زبوناً جديداً → `was_created=true`.
2. نفس المستخدم يعيد الحفظ بنفس الاسم → `was_created=false` بدون الحاجة لـ edit.
3. مستخدم بـ edit فقط (لا create) يحاول حفظ زبون جديد → `PERMISSION_DENIED`.
4. مستخدم بـ create فقط يحاول تعديل اسم زبون موجود → `PERMISSION_DENIED`.
5. تسجيل مكالمة بدون `related_order_id` → ينجح.
6. تسجيل مكالمة بـ `related_order_id` لطلبية نفس الزبون → ينجح.
7. تسجيل مكالمة بـ `related_order_id` لطلبية زبون آخر → `ORDER_CUSTOMER_MISMATCH`.
8. تسجيل مكالمة بطلبية غير موجودة/مستأجر آخر → `ORDER_NOT_FOUND`.
9. ربط زبون بفرع لمستأجر آخر → `BRANCH_NOT_FOUND`.
10. تفعيل do_not_call ثم محاولة تسجيل مكالمة → `DO_NOT_CALL_ACTIVE`.
11. تفعيل do_not_call بسبب فارغ → `REASON_REQUIRED`.
12. مكالمتان خلال 60 ثانية لنفس (زبون+مستخدم) → الثانية `RATE_LIMITED`.
13. outcome=`callback_requested` و `refused` يُقبَلان (بعد توسعة القيد).
14. INSERT/UPDATE/DELETE مباشر من الواجهة على الجدولين → permission denied (قفل المرحلة A+).
15. لا يوجد RPC لتعطيل do_not_call → لا طريقة عبر API لإسقاطه.

سلبية إضافية: outcome/sentiment/rating خارج النطاق → رموز خطأ صريحة.

---

## 9) مخاطر/تخفيف

- **خصوصية do_not_call**: لا توجد طريقة لتعطيله في هذه المرحلة — يحافظ على أثر طلب الزبون.
- **عزل المستأجر**: كل RPC يُسقط الفلتر على `v_owner`، ولا يقبل `user_id` من الواجهة.
- **rate limit**: يحد من سوء الاستخدام السريع.
- **order linkage**: مطابقة الهاتف بالـ normalize تمنع تلوّث بيانات زبائن آخرين.

---

**بانتظار موافقتك الصريحة قبل تنفيذ migration وكود الواجهة.**

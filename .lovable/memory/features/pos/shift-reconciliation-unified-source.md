---
name: POS Shift Reconciliation — Unified Source
description: Single source of truth for POS shift close, audit, and reports. Phase A complete (DB functions). Phase B pending (UI wiring).
type: feature
---

## الوضع الحالي (Phase A مكتمل)

تم إنشاء دالتين في قاعدة البيانات كمصدر موحّد لكل أرقام الوردية:

### 1) `public.get_pos_shift_reconciliation(p_session_id uuid) RETURNS jsonb`
SECURITY DEFINER, read-only, tenant-guarded (`auth.uid() = session.user_id`).
تعيد JSON بالبنية التالية:
- `session` — معلومات الوردية (branch, cash_box, device, terminal, shift_code, opening/closing cash, stored expected/variance/totals).
- `orders` — عدد الطلبات: active / return / voided / cancelled + إجماليات (subtotal/discount/tax/total) للطلبات الفعّالة فقط، وقيم "المستبعد" للمفسوخة والملغاة.
- `payments` — لكل payment_method: sales_amount, sales_count, refund_amount, refund_count, net_amount, excluded_voided_amount, excluded_cancelled_amount.
- `visa_breakdown` — array مجمّع حسب `card_reference` للفيزا/الكارد فقط، من الطلبات الفعّالة.
- `cash_by_currency` — لكل عملة (ILS/USD/JOD/…): cash_sales, foreign_tendered, change_given, cash_returns, cash_expenses, cash_purchases, fx_adjustment_foreign, fx_adjustment_ils.
- `expected_cash` — لكل عملة: expected (محسوب بنفس منطق `src/lib/pos/shift-close-math.ts` حرفياً)، actual/variance = null (تُملأ من الواجهة).
- `warnings` — voided_payments_amount/count, cancelled_payments_amount/count, visa_missing_ref_count.

### 2) `public.get_pos_shift_reconciliation_range(p_from date, p_to date)`
نسخة نطاقية للتقارير. تعتمد `pos_sessions.business_date` مع fallback على `opened_at` بتوقيت Asia/Jerusalem (cutoff 6 AM). محصورة بـ `user_id = auth.uid()`.

### مصادر البيانات المعتمدة
- **الطلبات:** `public.pos_orders_effective` view — تحوي `effective_state` (active | voided | cancelled) وهي المصدر الوحيد المسموح لتحديد "الفعلي" مقابل "المستبعد".
- **الدفعات:** `pos_payments` ← join مع `pos_orders_effective` (لا تُستخدم `pos_orders` مباشرة).
- **المصاريف/المشتريات:** `pos_expenses` و `pos_purchases` مفلترة بـ `shift_id = session_id` و `payment_method/payment_type = 'cash'` (ILS فقط حالياً — نفس افتراض shift-close-math.ts).
- **تسويات العملات الأجنبية:** `pos_shift_foreign_adjustments`.
- **GL/transactions:** غير مستخدمة هنا (فصل مقصود عن `get_pos_shift_summary` القديمة التي تقرأ من `transactions`).

### قرارات محسومة (defaults تم تطبيقها)
1. `pos_expenses`/`pos_purchases`: ILS فقط. توسعة للعملات لاحقاً.
2. VISA breakdown داخل نفس الدالة (وليس دالة منفصلة).
3. Orphan payments (voided/cancelled) تُعرض كتحذيرات، وليست ضمن الإجماليات.

## المتبقي (Phase B — لم يُنفَّذ)

ربط الواجهات الثلاث بهذا المصدر بحيث تصبح متطابقة تماماً:
1. **شاشة إغلاق العهدة** في `src/pages/POSPage.tsx` (~L5817-6034): بدل حساب الأرقام في JS، اقرأ من `get_pos_shift_reconciliation(session_id)` واستخدم `expected_cash` و `cash_by_currency` مباشرة قبل استدعاء `close_pos_session_atomic`.
2. **دراسة الوردية** — `src/components/pos-reports/POSShiftAuditReport.tsx` + `src/hooks/usePOSReportsData.ts`: استبدال الحسابات الحية بقراءة من `get_pos_shift_reconciliation_range(from, to)`.
3. **صفحة المحاسب** — `src/pages/POSShiftAuditPage.tsx`: تستخدم حالياً `pos_orders_effective` مباشرة (تم إصلاحها سابقاً). اعتماد نفس الدالة الموحّدة لضمان تطابق 100% مع الشاشتين أعلاه.

### تحذيرات مهمة قبل Phase B
- **لا تعدّل** `close_pos_session_atomic` — تم إصلاحها مسبقاً لتكون ذرية وتقبل expected/variance/total_sales/total_orders. فقط مرّر لها القيم من الدالة الجديدة.
- **لا تكسر** التطابق مع `shift-close-math.ts` — الدالة SQL تحاكيه حرفياً. أي تغيير يجب أن يحدث في الطرفين معاً.
- تحقق دائماً من وردية حقيقية بـ SQL قبل/بعد كل ربط UI.

## المشاكل الجذرية التي كشفها التحقيق (سياق مهم)
- F1: `pos_shift_foreign_adjustments` كانت تُهمل في الإغلاق وتُحسب في الدراسة ← سبب فروقات.
- F2: الإغلاق يستخدم snapshot مجمّد، الدراسة تحسب live ← أي تعديل بعد الإغلاق يُظهر فرقاً.
- F3: مصادر مختلفة (`transactions` vs `pos_payments`) بتعريفات مختلفة للمفسوخ.
- F4: markers مثل `gl-sync` / `re-post` مفلترة في الدراسة وليست في الإغلاق.
- الدالة الجديدة تحلّ F1-F4 عبر توحيد المصدر والمنطق.

## قرارات المستخدم السابقة
- بدء الإصلاحات بـ #1 (توحيد `close_pos_session_atomic`) و #2 (توحيد شرط الطلب النشط) — **تم إنجازهما مسبقاً**.
- إضافة `shift_code` (S1/S2/S3) لكل وردية حسب الفرع/اليوم — **تم إنجازه مسبقاً**.
- التوصية #2 (SQL function موحّدة) — **تم إنجازها الآن (Phase A)**.
- المطلوب: التحقق من وردية حقيقية بالـ SQL أولاً، ثم Phase B.
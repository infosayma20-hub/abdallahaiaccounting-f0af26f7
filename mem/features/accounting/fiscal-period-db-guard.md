---
name: Fiscal Period DB-Level Guard
description: حماية الفترات المالية المقفلة على مستوى قاعدة البيانات تغطّي INSERT/UPDATE/DELETE على transactions
type: feature
---

# حماية الفترات المالية — على مستوى DB (المرحلة 1.1)

## القاعدة
- التريغر `trg_check_fiscal_period` على `public.transactions` يعمل على **BEFORE INSERT / UPDATE / DELETE**.
- الدالة `check_fiscal_period_open()` ترفض أي عملية على قيد تاريخه يقع داخل فترة `status IN ('closed','locked')`.
- الرسالة تعود بالعربية: «الفترة المحاسبية "…" مغلقة. لا يمكن إدخال أو تعديل أو حذف قيود بتاريخ …».

## لماذا DELETE حرج
مسارات "delete-then-recreate" (تعديل سند قيد، تعديل سند قبض/صرف، إلغاء فاتورة) كانت تحذف القيد الأصلي قبل ما تحاول الإدخال الجديد. بدون حارس DELETE: الحذف ينجح والإدخال يُرفض → فقدان القيد بالكامل. الحارس الآن يرفض الحذف من البداية فلا فقدان بيانات.

## معالجة الخطأ بالواجهة
- Helper موحّد: `src/lib/db-error-toast.ts` يصدّر `formatDbError(err)` و`isFiscalPeriodLockError(err)`.
- مربوط في:
  - `src/hooks/useSaveJournalVoucher.ts` — catch returns لـ `save / update / remove`.
  - `src/pages/VoucherFormPage.tsx` — catch الرئيسي لـ `handleSave` (سندات قبض/صرف).
  - `src/pages/InvoiceCreatePage.tsx` — catch الرئيسي لـ `handleCreate`.
- الـ pre-flight checks الموجودة في `useSaveJournalVoucher` (`checkFiscalPeriodLock`) تبقى كما هي للحصول على رسالة فورية قبل الـ round-trip، والحارس DB هو خط الدفاع الثاني.

## ممنوع
- إضافة `BYPASS` أو `SET LOCAL session_replication_role` للتحايل على الحارس.
- إنشاء تريغر منفصل بنفس الغرض — هذا التريغر هو المرجع الوحيد.
- حذف ساق DELETE من التعريف عند أي migration مستقبلي.

## اختبار القبول
- ملف SQL: `docs/audit/fiscal-period-guard-acceptance.sql`.
- يجب أن تفشل العمليات الثلاث (INSERT/UPDATE/DELETE) برسالة عربية واحدة على فترة مقفلة، وتنجح بعد فتح الفترة.
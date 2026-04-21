---
name: cheque-system-hardening-phase2
description: تقوية نظام الشيكات (Phase 2) — voucher_id، فهرس فريد لمنع التكرار، CHECK constraints على العملة والمبلغ، Trigger للتحقق من جهة التظهير، تحويل cashed_date إلى date
type: feature
---

تم في 2026-04 تنفيذ تدقيق وتقوية شامل لجدول `cheques`:

- **حقل `voucher_id` (uuid → transactions)**: ربط عكسي صريح بين الشيك والقيد المحاسبي. يُمرر من `VoucherFormPage` تلقائياً عند إنشاء شيك صادر/وارد.
- **فهرس فريد `uniq_cheques_user_bank_number_type`** على (user_id, bank_name, cheque_number, cheque_type) WHERE status<>'ملغي': يمنع تكرار نفس الشيك. يجب التعامل مع خطأ 23505 في الواجهة.
- **CHECK constraints**: `currency IN ('ILS','USD','JOD','EUR','EGP')` و `amount > 0`. الإدخال بقيمة "شيكل" مرفوض الآن — استخدم الكود `currencyLabel` بدلاً من label.
- **Trigger `validate_cheque_endorsement`**: يمنع `status='مظهر'` بدون `endorsed_to_contact_id` أو `endorsed_to_name`.
- **حقل `cashed_date`** تحوّل من `text` إلى `date`. القيم القديمة غير الصالحة محفوظة في `notes`.
- **6 فهارس أداء** على status/contact_id/voucher_id/due_date/bank+number.
- **Backfill**: تم ربط الشيكات الواردة اليتيمة بالـ contacts عبر `contact_name`.

INSERTs الجديدة في `src/pages/VoucherFormPage.tsx` تتعامل الآن مع أخطاء INSERT وترميها للمستخدم بدلاً من الفشل الصامت.

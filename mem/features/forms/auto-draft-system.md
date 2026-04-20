---
name: Auto-Draft Form Persistence
description: Hook عام useFormDraft + DraftRestoreBanner لحفظ المسودات تلقائياً في localStorage مع debounce واسترجاع عند العودة
type: feature
---
نظام الحفظ التلقائي لمسودات النماذج (Auto-Draft System):

(1) الهدف: حماية المستخدم من فقدان البيانات عند التنقل بين تبويبات النظام (التبويبات تعمل unmount/remount عند التبديل) أو عند إغلاق المتصفح بالخطأ.

(2) البنية:
  - `src/hooks/useFormDraft.ts` — hook عام يأخذ formId + currentValue + applyDraft callback، يحفظ في `localStorage` بمفتاح `amwali_draft_{formId}` مع debounce افتراضي 800ms + حفظ فوري على `beforeunload`. يدعم `version` لإبطال المسودات القديمة عند تغير هيكل البيانات، و`isEmpty` لتجنب حفظ نماذج فارغة.
  - `src/components/forms/DraftRestoreBanner.tsx` — شريط أصفر علوي (warning tokens) يعرض زمن الحفظ النسبي (قبل 5 دقائق...) مع زر استرجاع وتجاهل.

(3) دورة الحياة:
  - عند فتح الصفحة → فحص localStorage. إذا وُجدت مسودة بنفس الـ version، اعرض الـ banner.
  - أثناء التحرير → حفظ تلقائي بعد كل تعديل (debounced).
  - عند الحفظ الناجح في DB → استدعاء `clearDraft()` لمسح المسودة.
  - عند الضغط على "تجاهل" → مسح المسودة بدون استرجاع.

(4) الصفحات المُطبَّق عليها:
  - `src/pages/InvoiceCreatePage.tsx` (مبيعات + مشتريات) — معطّل في وضع التعديل و في حالة `from_duplicate`. مفاتيح منفصلة لكل نوع: `invoice_sales_new` و `invoice_purchase_new`.
  - `src/pages/procurement/ProcurementInvoiceCreatePage.tsx` — معطّل عند الإنشاء من Order.

(5) قواعد التوسيع لصفحات أخرى (السندات، القيود، POS):
  - استخدم `formId` فريد ومستقر (لا يحتوي IDs ديناميكية).
  - عرّف `isEmpty` لتجنب الحفظ غير المفيد (مثلاً عدم حفظ سند فارغ تماماً).
  - عطّل الـ hook في وضع التعديل عبر `enabled: !isEditMode`.
  - استدع `clearDraft()` في كل مسارات النجاح (insert + update).
  - ارفع `version` عند تعديل هيكل البيانات لتجنب استرجاع مسودات غير متوافقة.
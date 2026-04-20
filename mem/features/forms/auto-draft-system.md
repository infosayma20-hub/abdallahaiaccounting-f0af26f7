---
name: Auto-Draft Form Persistence (Global)
description: نظام عالمي لحفظ مسودات النماذج تلقائياً في localStorage مع سجل عالمي (draftRegistry) يربط المسودات بالتبويبات ويعرض confirm عند الإغلاق
type: feature
---
نظام Auto-Draft الموحد لمسودات النماذج (Global Draft System):

(1) المكونات الأساسية:
  - `src/hooks/useFormDraft.ts` — hook عام (formId, currentValue, applyDraft) يحفظ في localStorage بمفتاح `amwali_draft_{formId}` مع debounce 800ms + حفظ على beforeunload. يدعم: version, isEmpty, enabled, **routePath** (لربط المسودة بالتبويب).
  - `src/components/forms/DraftRestoreBanner.tsx` — شريط أصفر مع زر استرجاع/تجاهل وعرض زمن نسبي.
  - `src/lib/draftRegistry.ts` — singleton يتتبع المسودات النشطة في الذاكرة (`Map<routePath, {formId, savedAt}>`). يُسجَّل تلقائياً من `useFormDraft` عند كل حفظ ويُلغى عند `clearDraft()`.

(2) سلوك تأكيد الإغلاق:
  - `TabsContext.closeTab` / `closeOtherTabs` / `closeAllTabs` تتحقق من `hasActiveDraft(path)` وتعرض `confirm()` قبل الإغلاق إذا فيه عمل غير محفوظ. عند التأكيد: تُلغي التسجيل والحالة. التنقل بين التبويبات لا يحذف المسودة (تبقى للاسترجاع عند العودة).

(3) دورة الحياة:
  - فتح الصفحة → فحص localStorage → إذا وُجدت مسودة بنفس version → عرض banner.
  - أثناء الكتابة → حفظ debounced + تسجيل في registry.
  - نجاح الحفظ في DB → `clearDraft()` يحذف من localStorage + registry.
  - تجاهل/إغلاق متعمد → نفس السلوك.

(4) الصفحات المُطبَّق عليها:
  - `InvoiceCreatePage` (مبيعات + مشتريات) — مفاتيح `invoice_sales_new` / `invoice_purchase_new`.
  - `ProcurementInvoiceCreatePage` — مفتاح خاص.
  - `VoucherFormPage` (سند قبض + سند صرف) — مفاتيح `voucher_receipt_new` / `voucher_payment_new`، routePath `/finance/receipt/new` و `/finance/payment/new`.
  - `JournalNewPage` — مفتاح `journal_new`، routePath `/finance/journal/new`.
  - `AccountFormPage` (إنشاء حساب فقط) — مفتاح `account_new`، routePath `/accounts/new`.

(5) قواعد التوسيع لصفحات أخرى:
  - استخدم `formId` فريد ومستقر، عرّف `isEmpty` لتجنب حفظ نموذج فارغ، عطّل في وضع التعديل (`enabled: !isEditMode`)، استدع `clearDraft()` في كل مسارات نجاح الحفظ، ارفع `version` عند تغيير هيكل البيانات، مرّر `routePath` لتفعيل تأكيد الإغلاق.
  - للنماذج المعقدة: اجمع كل state عبر `useMemo` snapshot، واستعد عبر `applyDraft` callback تستدعي كل setters.
  - معرّفات الكيانات (contactId, employeeId) تُستعاد عبر `(window as any).__duplicateXxxId` لانتظار تحميل القوائم.

# خطة إكمال السند الجماعي بتصميم Microsoft Dynamics (FinanceShell)

الصفحة تُعاد بناؤها داخل `FinanceShell` (نفس شريط سندات الصرف)، مع نقل **كل** الأزرار للشريط العلوي بأسلوب Dynamics 365 Finance — تبويبات (Ribbon) + مجموعات.

---

## 1) البنية الجديدة للصفحة (Dynamics-style Ribbon)

استخدام `FinanceShell` مع `actionTabs` مقسّمة كالتالي:

**تبويب "الصفحة الرئيسية"**
- مجموعة **إنشاء**: `جديد` (سند جماعي جديد) — `تكرار` — `مسح السطور`
- مجموعة **حفظ**: `حفظ مسودة` — `حفظ وترحيل` — `إلغاء الترحيل` (للسندات المحفوظة)
- مجموعة **سطور**: `إضافة سطر` — `إدراج 10 سطور` — `حذف السطور المحددة`
- مجموعة **طباعة**: `طباعة السند` — `معاينة`
- مجموعة **تصدير**: `Excel` — `PDF`
- مجموعة **تنقل**: `رجوع للقائمة` — `فتح مركز المالية`

**تبويب "الإجراءات"** (للسندات المرحّلة)
- `إلغاء السند` — `عكس القيد` — `ربط فواتير` — `عرض القيد المحاسبي` — `سجل التعديلات`

الشريط يعرض عدّاد السطور والإجمالي بجانب العنوان (`rightSlot`).

---

## 2) توحيد الصفحة (صرف + قبض)

- `BulkPaymentVoucherPage.tsx` → `BulkVoucherPage.tsx` تقبل `mode: "payment" | "receipt"`.
- **صرف**: السطور مدين، الصندوق/البنك دائن. البادئة `BPV-YYYY-NNNN`.
- **قبض**: السطور دائن، الصندوق/البنك مدين. البادئة `BRV-YYYY-NNNN`.
- نفس الجداول `vouchers` + `voucher_lines` + `transactions` مع `subtype='bulk'`.

## 3) وضع التعديل

- راوتات جديدة:
  - `/finance/payment/bulk/:id/edit`
  - `/finance/receipt/bulk/:id/edit`
- تحميل الرأس والسطور. الحفظ = **delete + recreate** للترانزكشنز والسطور (سياسة سلامة القيود).
- تنبيه `EditPostedWarningDialog` عند تعديل سند مُرحّل.
- احترام أقفال الفترات المالية.

## 4) الظهور في القوائم مع Badge

- في `FinancePaymentsPage` و `FinanceReceiptsPage`:
  - Badge بنفسجي **"جماعي"** بجانب رقم السند لكل ما `subtype='bulk'`.
  - النقر يفتح صفحة التعديل الجماعية.
  - "الجهة" = `"سند جماعي — N سطر"`.
  - أزرار جديدة في شريطها: `سند صرف جماعي` / `سند قبض جماعي`.

## 5) الإلغاء الآمن

- عند الإلغاء لسند جماعي: عكس/حذف كل `transactions` (`is_deleted=true`, `idempotency_key=null`) بواسطة `reference = ref_number`، فك `payment_invoice_links` وإعادة أرصدة الفواتير، ثم `status='cancelled'` + `document_edit_history`.
- دالة قاعدة بيانات `cancel_bulk_voucher(p_voucher_id, p_reason)` تضمن الذرّية.

## 6) الطباعة المخصّصة

- قالب A4 مبسّط: رأس شركة + بيانات السند، جدول السطور (#/الجهة/البيان/المبلغ)، إجمالي، مربّع توقيعات (المُعِدّ/المدير/المستلم).
- ملف: `src/components/print/buildBulkVoucherPrint.ts`.

## 7) ربط الفواتير (اختياري لكل سطر)

- في سطور "مورّد/جهة" (صرف) أو "عميل" (قبض): زر صغير **"ربط بفاتورة"** → Popover يعرض الفواتير المفتوحة بالمتبقّي — اختيار واحدة يُنشئ `payment_invoice_links` بعد الترحيل.
- عند التعديل/الإلغاء: تُعكس الروابط وتُعاد أرصدة الفواتير.

---

## هيكل الجسم (Body) — بسيط ومنظّم

بعد الشريط العلوي، الصفحة عمود واحد داخل الحاوية المعتادة لـ FinanceShell:

```text
[FinanceShell Ribbon: تبويبات + مجموعات أزرار]
[شريط KPI رفيع: عدد السطور | الإجمالي | الحالة | المصدر]
┌─ Card: بيانات السند (رأس) ────────────────────────┐
│ رقم السند | التاريخ | طريقة الدفع | الصندوق/البنك │
│ البيان (عرض كامل)                                  │
│ ملاحظات                                            │
└────────────────────────────────────────────────────┘
┌─ Card: السطور ────────────────────────────────────┐
│ جدول: # | النوع | الجهة/الحساب | البيان | ربط     │
│         فاتورة | المبلغ | حذف                      │
│ Footer: الإجمالي                                    │
└────────────────────────────────────────────────────┘
[شريط تحقق (Validation banner) عند وجود خطأ]
```

- لا يوجد Sticky footer — كل أزرار الحفظ في الشريط العلوي فقط (Dynamics style).
- عرض الحالة (مسودة/مُرحّل/ملغي) كـ Badge في `rightSlot`.

---

## تفاصيل تقنية

**Migration:**
```sql
CREATE OR REPLACE FUNCTION public.cancel_bulk_voucher(
  p_voucher_id uuid, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ ... $$;
GRANT EXECUTE ON FUNCTION public.cancel_bulk_voucher(uuid, text) TO authenticated;
```

**ملفات ستُعدَّل / تُنشأ:**
- إعادة تسمية `BulkPaymentVoucherPage.tsx` → `BulkVoucherPage.tsx` (mode + edit + FinanceShell).
- `src/App.tsx` — 3 راوتات جديدة (bulk receipt new + edit للنوعين).
- `src/pages/FinancePaymentsPage.tsx` + `FinanceReceiptsPage.tsx` — badge + routing + زر شريط جديد.
- `src/components/print/buildBulkVoucherPrint.ts` — قالب طباعة.
- `src/components/finance/BulkInvoiceLinkPicker.tsx` — Popover ربط فاتورة.
- Migration واحدة.

**ضمانات:**
- جميع الأزرار الموجودة حالياً (حفظ مسودة، حفظ وترحيل، إضافة سطر، حذف سطر، رجوع) **تبقى تعمل بنفس المنطق** — فقط تنتقل مواضعها للشريط العلوي.
- Trigger `enforce_voucher_lines_balanced` يبقى الحارس.
- لا تعديل مباشر على `transactions` المرحّلة.

---

## ترتيب التنفيذ

1. Migration `cancel_bulk_voucher`.
2. Refactor الصفحة إلى FinanceShell + Ribbon كامل + دعم mode + edit.
3. تحديث `App.tsx` بالراوتات.
4. تحديث `FinancePaymentsPage` + `FinanceReceiptsPage` (badge + routing + زر).
5. قالب الطباعة + ربطه بزر الطباعة في الشريط.
6. Popover ربط الفواتير.
7. اختبار كامل: إنشاء → طباعة → تعديل → إلغاء (صرف + قبض).

هل نبدأ التنفيذ بهذا الترتيب؟

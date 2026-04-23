---
name: Smart Summary Panel Pattern
description: Right=Input / Left=Summary layout for all voucher/invoice screens. Unified shell, variant-driven content. Applied to receipt/payment + invoice/credit_note/debit_note.
type: design
---

# Smart Summary Panel — معيار شاشات السندات والفواتير

## القاعدة
- **اليمين** = حقول الإدخال (Right = Input)
- **اليسار** = لوحة الملخص الذكية (Left = Summary) — sticky على شاشات `lg+`
- على الموبايل: عمود واحد (الإدخال فقط؛ الملخص مخفي `hidden lg:block`)
- التخطيط: `grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start` داخل `max-w-7xl mx-auto`

## الفلسفة: موحّد بالشكل، مختلف بالمنطق
| نوع المستند | محرك الملخص | Variant |
|---|---|---|
| سند قبض / صرف | Amount-driven + Impact (قبل/بعد) | `receipt` / `payment` |
| فاتورة | Result-driven (subtotal→discount→tax→total→paid→remaining + أثر على الجهة) | `invoice` |
| إشعار دائن | Adjustment (يقلّل ذمة الزبون، تحذير عند غياب فاتورة أصلية) | `credit_note` |
| إشعار مدين | Adjustment (يضيف على ذمة الزبون) | `debit_note` |
| سند قيد | Balance-driven (مدين/دائن/فرق/توازن) — لاحقاً | `journal` |

## Bridge of Understanding (سياسة معتمدة)
أي رقم يظهر للمستخدم = له تفسير. عند اختلاف "الرصيد الإجمالي (كشف الحساب)" عن "الفواتير المفتوحة":
- breakdown قابل للتوسيع: فواتير مفتوحة ± دفعات غير مخصصة ± حركات أخرى = صافي الرصيد
- sign-aware (زبون = debit، مورد = credit)
- يظهر فقط عند ≥ 2 components
- deep link لكشف الحساب

## التطبيق الحالي
- `src/pages/VoucherFormPage.tsx` (سند القبض/الصرف — نفس الصفحة بـ `voucherType` prop)
- `src/pages/InvoiceCreatePage.tsx` (فاتورة مبيعات/مشتريات — `variant="invoice"`)

## المكوّنات
- `src/components/voucher/SmartSummaryPanel.tsx` — الـ shell، يحوّل حسب `variant`
- `src/components/voucher/MobileSummaryBar.tsx` — النسخة المطوية للموبايل (يدعم كل variants)

## لا تفعل
- ❌ لا توحّد **محتوى** الـ Summary عبر المستندات — وحّد **الـ shell** فقط
- ❌ لا تخفِ الملخص على الموبايل — استخدم `MobileSummaryBar` المطوية
- ❌ لا تنقل منطق الحفظ إلى المكوّن — هو عرض بحت
- ❌ لا تكرّر نفس الأرقام داخل بطاقات أخرى — المكان الموحد هو SmartSummaryPanel

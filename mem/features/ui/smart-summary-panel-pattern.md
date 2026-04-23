---
name: Smart Summary Panel Pattern
description: Right=Input / Left=Summary layout for all voucher screens. Unified shell, variant-driven content. Starts with receipt/payment vouchers as reference implementation.
type: design
---

# Smart Summary Panel — معيار شاشات السندات

## القاعدة
- **اليمين** = حقول الإدخال (Right = Input)
- **اليسار** = لوحة الملخص الذكية (Left = Summary) — sticky على شاشات `lg+`
- على الموبايل: عمود واحد (الإدخال فقط؛ الملخص مخفي `hidden lg:block`)
- التخطيط: `grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start` داخل `max-w-7xl mx-auto`

## الفلسفة: موحّد بالشكل، مختلف بالمنطق
نوع المحتوى داخل الـ Summary يتبع نوع السند:

| نوع السند | محرك الملخص |
|---|---|
| `receipt` / `payment` | Amount-driven + Impact (قبل/بعد + تحذيرات تجاوز) |
| `journal` | Balance-driven (مدين = دائن، الفرق، عدد الأسطر) |
| `invoice` / `credit_note` / `debit_note` | Result-driven (إجمالي/ضريبة/صافي + رصيد العميل) |

## المكوّن
`src/components/voucher/SmartSummaryPanel.tsx`
- Props موحّدة حسب `variant`
- حالياً يدعم `receipt` و `payment` كنموذج مرجعي
- بقية المتغيرات تُضاف لاحقاً بنفس الـ shell (Hero → Impact → Warnings)

## التطبيق الحالي
- `src/pages/VoucherFormPage.tsx` (سند القبض/الصرف)

## تحذيرات تُعرض تلقائياً (receipt/payment)
- لا يوجد مبلغ → Info
- المبلغ > إجمالي الفواتير المفتوحة → Warn (سيتحول لدفعة مقدمة)
- المبلغ > رصيد العميل المدين → Warn (سيُسجَّل كرصيد دائن)
- إجمالي الشيكات ≠ المبلغ → Warn
- المخصص للفواتير ≠ المبلغ → شريط تقدّم أصفر
- كل شيء متوازن → OK

## لا تفعل
- ❌ لا توحّد **محتوى** الـ Summary عبر السندات — وحّد **الـ shell** فقط
- ❌ لا تضع الملخص في dropdown/modal — يجب أن يكون sticky دائم الرؤية
- ❌ لا تنقل منطق الحفظ إلى المكوّن — هو عرض بحت

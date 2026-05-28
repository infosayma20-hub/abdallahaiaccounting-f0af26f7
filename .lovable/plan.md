# خطة الإصلاحات (9 بنود)

سأنفذها كلها في هذه الجولة، وأرتّبها من الأصغر للأكبر مع تأكيد على عدم لمس منطق الحسابات/القاعدة.

## 1) سندات القبض والصرف لا تعمل من الـ navigation
- المسارات في `App.tsx` صحيحة (`/finance/receipt/new`, `/finance/payment/new`).
- لكن من اللقطات يظهر أن الصفحة تفتح لكن البحث عن جهة (`سفيان`) يرجع "لا توجد نتائج" — أي العميل/الجهة ما بتظهر.
- سأتحقق من فلتر البحث في `VoucherFormPage` (هل يستخدم `contact_type` القانوني؟ وهل يحترم `is_deleted=false` بشكل سليم؟) وأصلحه.

## 2) معاينة الطباعة والطباعة لا تعمل في سند القيد
- في `JournalNewPage` زرّي "معاينة" و"طباعة" يطبعان الصفحة كاملة بدلاً من السند فقط.
- سأغلّف السند داخل `[data-print-area]`، وأخفي البقية بـ `no-print`، وأضيف رأس طباعة (شركة + رقم السند + تاريخ + نوع السند).

## 3) سند القيد بصفحة واحدة عند الطباعة
- ضبط CSS طباعة: `@page { size: A4; margin: 10mm }`, تكثيف الجدول، إخفاء التبويبات/الـAction Pane/الـ summary card الجانبية.

## 4) عدسة بحث الحسابات داخل سطور سند القيد
- استبدال الـ Input النصي البسيط لحقل "رقم الحساب / الجهة" بمكوّن بحث مع Popover يعرض كل شجرة الحسابات، بحث فوري بالاسم/الرقم، اختيار بنقرة. (موجود مكوّن `SmartAccountPicker` / `AccountAutocomplete` احتمالاً — سأبحث وأستخدمه، وإلا أبني واحد بسيط مبني على `Command` من shadcn.)

## 5) Enter من حقل مركز التكلفة في السطر الأخير → سطر جديد
- في معالج keyboard للسطور: لو الحقل الحالي = آخر حقل (مركز التكلفة) والصف = آخر صف → `Enter` ينفذ `addRow()` وينقل التركيز لأول حقل في الصف الجديد.

## 6) مركز التكلفة في الفاتورة + FinanceShell للفواتير
- إضافة حقل اختيار "مركز التكلفة" في `InvoiceFormPage` (بنفس النمط، أعلى الجدول) — لا تغيير في منطق الترحيل (يُمرَّر فقط للقيد الناتج إن كان مدعوماً).
- تطبيق `FinanceShell` على `InvoicesPage`: breadcrumb (المالية / الفواتير)، Action Pane (فاتورة جديدة، تحديث، طباعة، تصدير، فتح مركز المالية)، FiltersPanel فعلي.

## 7) طباعة كشف الحساب تطبع `about:blank` و HTML خام
- المشكلة في فتح نافذة جديدة `window.open("","_blank")` وطباعتها — تظهر "about:blank" في الفوتر/الهيدر.
- الحل: استخدام نفس نمط `data-print-area` داخل الصفحة الحالية + CSS `@media print` (نفس ما عملناه في باقي الصفحات)، وإزالة `window.open`.

## 8) طباعة شجرة الحسابات تطبع الصفحة كاملة
- مراجعة CSS طباعة في `AccountsPage`: إخفاء كل عناصر الـShell والـSidebar والـTopBar داخل `no-print`/`print:hidden`، وتغليف الشجرة فقط بـ `data-print-area`.

## 9) طباعة ميزان المراجعة تطبع الصفحة كاملة
- نفس المعالجة في `TrialBalancePage`: تحقق أن العناصر خارج `[data-print-area]` فيها `print:hidden`، وإضافة global CSS rule `@media print { body > *:not(...) { display:none } }` في `index.css` لضمان طباعة `data-print-area` فقط.

## تقنياً (ملخص)
- سأضيف rule عام في `src/index.css` تحت `@media print`:
  ```css
  @media print {
    body * { visibility: hidden; }
    [data-print-area], [data-print-area] * { visibility: visible; }
    [data-print-area] { position: absolute; inset: 0; }
    .no-print, .no-print * { display: none !important; }
    @page { size: A4; margin: 10mm; }
  }
  ```
  هذا يصلح بنود (3, 7, 8, 9) دفعة واحدة بشكل موحّد + تأكيد كل صفحة عندها `data-print-area`.

## بعد التنفيذ
- TypeScript check.
- لن ألمس قاعدة البيانات ولا منطق القيود.

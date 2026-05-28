# خطة الإصلاحات الأربعة

## 1) إزالة النصوص الإنجليزية من واجهة الفلاتر
**المشكلة:** في popover "إضافة فلتر" تظهر كلمات `date`, `option`, `text`, `number` خام بجانب اسم الحقل.
**الملف:** `src/components/finance/shell/FiltersPanel.tsx` (سطر 155)
**الإصلاح:** خريطة `TYPE_LABELS_AR` → `date: تاريخ`, `option: قائمة`, `text: نص`, `number: رقم`. وإخفاء الـ badge أساساً إذا كان مكرراً مع label.

## 2) تعديل سند القبض = Update فعلي (نفس الرقم)
**التشخيص:** كود `handleSave` في edit mode (سطر 1320–1393) فعلياً يعمل update صحيح + Delete & Recreate transaction (مطابق لـ Accounting Integrity Policy). **السلوك المرئي للمستخدم** هو نتيجة:
- `handleCancelVoucher` (سطر 2443) المرتبط بزر "إلغاء/حذف" في ActionPane يحدّث status=cancelled.
- على الأرجح المستخدم ضغط حذف بدل حفظ، أو الصفحة فتحت read-only (isReadOnly default = true في FinanceShell) ولم ينتبه أن "تحديث السند" مطلوب صراحة.

**الإصلاح:**
- التأكد أن action **"تحديث السند"** في ActionPane (وزر primary بداخل الـ form) يستدعي `handleSave(false)` ويُحدث الصف **بدون** تغيير `receipt_number`.
- إضافة toast واضح بعد التحديث: `"تم تحديث السند REC-XXXX (5,000 → 10,000.4) ✓"`.
- بعد التحديث، invalidate React Query + استدعاء `broadcastChange("receipt_voucher", "updated", id)` (موجود) — والتأكد أن `FinanceReceiptsPage` يستمع للـ broadcast ويعيد fetch تلقائياً (حالياً يحتاج refresh يدوي).
- زر "حذف/إلغاء" في ActionPane أوضح بصرياً (variant=destructive) ليفرق عن "حفظ".

## 3) خيارات إخفاء الأعمدة في قوائم القبض/الصرف/الفواتير
**التصميم:** مكوّن جديد `ColumnVisibilityMenu` يضاف بجانب زر الفلاتر:
- يخزّن `Record<columnKey, boolean>` في `localStorage` تحت `cols-${storageKey}`.
- يعرض dropdown بجميع الأعمدة، Checkbox لكل واحد + "إظهار الكل / إخفاء الكل".
- الأعمدة الإلزامية (رقم السند، المبلغ، الإجراءات) غير قابلة للإخفاء.

**التطبيق:**
- `src/components/finance/shell/ColumnVisibilityMenu.tsx` (جديد) + `useColumnVisibility(storageKey, defaults)` hook.
- تمريره عبر `FinanceShell` كـ `columnsMenu?: ReactNode` أو slot في الـ toolbar.
- استخدامه في: `FinanceReceiptsPage`, `FinanceVoucherPage` (سند الصرف), وصفحة الفواتير الرئيسية. الأعمدة الافتراضية المخفية: لا شيء؛ المستخدم يخفي يدوياً.

## 4) طباعة بنمط كشف الحساب (بدون about:blank)
**المشكلة الحالية:** `handlePrint = () => window.print()` يستخدم متصفح المعاينة → header/footer متصفح + URL في الذيل.
**الحل:**
- إنشاء component مشترك `PrintableSheet` بنفس تنسيق `AccountStatementPrint` (المرفق): header شركة + متاديتا + جدول نظيف + footer توقيع.
- زرّ الطباعة يفتح نافذة جديدة (`window.open('', '_blank')`) ويحقن HTML مستقل (بدون chrome) + CSS مطبعي + `@page { margin: 12mm; size: A4 }` ثم `window.print()` تلقائياً.
- يدعم وضعين:
  - **قائمة** (للقوائم الثلاث): جدول جميع الصفوف المفلترة + مجموع.
  - **سند فردي** (من داخل VoucherFormPage): قالب سند احترافي (شركة، تاريخ، رقم، الجهة، المبلغ بالحروف، توقيعات).
- إخفاء عناوين/تذييلات المتصفح يتم من إعدادات المتصفح، لكن نزيل URL/title بضبط `document.title = ''` مؤقتاً قبل الطباعة ضمن النافذة الجديدة.
- ملف جديد: `src/lib/print/openPrintWindow.ts` + `src/components/print/VoucherPrintTemplate.tsx` + `src/components/print/VoucherListPrintTemplate.tsx`.

## ملفات ستُعدّل/تُنشأ
**جديد:**
- `src/components/finance/shell/ColumnVisibilityMenu.tsx`
- `src/components/finance/shell/useColumnVisibility.ts`
- `src/lib/print/openPrintWindow.ts`
- `src/components/print/VoucherListPrintTemplate.tsx`
- `src/components/print/VoucherPrintTemplate.tsx`

**معدّل:**
- `src/components/finance/shell/FiltersPanel.tsx` (ترجمة type badges)
- `src/components/finance/shell/FinanceShell.tsx` (slot للـ ColumnVisibilityMenu)
- `src/pages/FinanceReceiptsPage.tsx` (column visibility + استبدال handlePrint + listener للـ broadcast)
- `src/pages/FinanceVoucherPage.tsx` (نفس الـ 3)
- صفحة الفواتير الرئيسية (سأحدد اسمها أثناء التنفيذ)
- `src/pages/VoucherFormPage.tsx` (طباعة سند فردي عبر النموذج الجديد + توضيح زر التحديث)

## خارج النطاق
- لن أعدل schema/migrations.
- لن أغير منطق RPC أو journal posting.
- التفضيلات في `localStorage` فقط (لا DB sync) حسب جوابك.

هل أبدأ التنفيذ؟
# خطة: تقييد صلاحيات الكاشير في POS (مطعم الملكي)

الهدف: منع الكاشير من معرفة "كم لازم يكون بالصندوق" قبل التسكير، وإخفاء تفاصيل الفيزا والملغاة، وإلزام مدير لكل ارتجاع. بدون أي تغيير على RPCs الحفظ/الإغلاق/الأرصدة.

## النطاق
تغييرات UI + Guards + 4 صلاحيات جديدة في `pos_user_permissions`. لا يوجد أي تغيير على منطق `close_pos_session_atomic` أو `process_pos_return` أو القيود المحاسبية.

## المرحلة 1 — إخفاء المؤشرات الفورية من شاشة البيع
**ملف:** `src/pages/POSPage.tsx`

1. **Badge مبيعات الوردية** (سطر ~4211): يظهر فقط إذا `isAdmin || posPerms.can_view_profits`.
2. **تمرير `sessionBalance` لـ ExpenseModal** (سطر ~6488): يُمرَّر فقط للأدمن. الكاشير يرى رسالة خطأ عامة بدون رقم الرصيد.
3. **زر "تفاصيل الوردية"** إن وُجد: يستخدم `can_view_shift_details` فعلياً.

**ملف:** `src/components/pos/ExpenseModal.tsx`
- إخفاء أي عرض للـ `sessionBalance` في رسائل الخطأ للكاشير.

## المرحلة 2 — تقييد سجل الفواتير
**ملف:** `src/components/pos/InvoiceHistoryDrawer.tsx`

- إضافة prop `cashierMode: boolean` (= ليس أدمن وليس عنده `view_payment_details`).
- في `cashierMode`:
  - فرض الفلتر الزمني على **الوردية الحالية فقط** (`session_id = currentSession.id`) — تعطيل أزرار today/yesterday/week/month.
  - إخفاء تبويب/فلتر "ملغاة" + إخفاء أي صف status=`cancelled`.
  - في الجدول: إخفاء عمود "طريقة الدفع" وتفاصيل `pos_payments` (لا فيزا/نقد/آجل).
  - في detail modal: عرض رقم الفاتورة + الوقت + الأصناف + الإجمالي فقط، بدون breakdown الدفع.

## المرحلة 3 — حماية تقارير POS و إلزام مدير للارتجاع
**ملف:** `src/App.tsx` (Route `/pos-reports`)
- إضافة Guard: `isAdmin || posPerms.view_pos_reports` (الافتراضي false). إذا الكاشير فتح الرابط مباشرة → redirect لـ `/pos` مع toast.

**ملف:** `src/pages/POSPage.tsx` + `src/components/pos/ReturnDialog.tsx`
- زر "ارتجاع" يفتح `ManagerOverrideDialog` أولاً (مثل الإلغاء)، إذا الكاشير. الأدمن يمر مباشرة.
- إضافة prop `requireManagerForReturn={!isAdmin && posPerms.require_manager_for_returns}`.

## المرحلة 4 — إيصال إغلاق الوردية (Read-only للفرق)
**ملف:** `src/pages/POSPage.tsx` `handleCloseShift()` + `src/components/ShiftSummaryReceipt.tsx`

السلوك المطلوب من المستخدم: **الكاشير يشوف الفرق لكن بعد إقفال نهائي فقط (read-only)** — أي:
- في dialog الإغلاق قبل التأكيد: الكاشير ما يرى المتوقع/الفرق (الوضع الحالي صحيح، نتركه).
- بعد ضغط "تأكيد الإغلاق" → ينفذ `close_pos_session_atomic` (بدون تغيير) → ثم تظهر `ShiftSummaryReceipt` بنسختين:
  - **نسخة كاشير (تُطبع تلقائياً)**: إيصال مبيعات + النقد المُدخل + الفرق فقط (read-only، بدون breakdown المتوقع).
  - **نسخة مدير (تتطلب فتح override أو الأدمن)**: التفصيل الكامل (المتوقع لكل عملة + breakdown + الفرق).
- إضافة prop `cashierMode` لـ `ShiftSummaryReceipt` يخفي صفوف "المتوقع" و breakdown الدفع.

## المرحلة 5 — إضافة الصلاحيات الجديدة في DB
Migration على `pos_user_permissions` (3 أعمدة جديدة boolean):
- `view_payment_details` default `false`
- `view_pos_reports` default `false`
- `require_manager_for_returns` default `true`

(الصلاحيات الموجودة `can_view_profits` و `can_view_shift_details` نستعملها بدل ما نضيف جدد.)

## المرحلة 6 — سجل تدقيق خفيف (اختياري لكن موصى به)
جدول جديد `pos_sensitive_actions_log`:
- `action` (manager_override_cancel / manager_override_return / unauthorized_reports_access)
- `pos_user_id`, `manager_user_id`, `session_id`, `invoice_id`, `created_at`, `notes`
- يُكتب من `ManagerOverrideDialog` بعد نجاح المصادقة، ومن Guard `/pos-reports` عند المحاولات الفاشلة.
- يظهر للأدمن في `/pos-reports` كتبويب "سجل العمليات الحساسة".

## ما لن يتغير (مناطق عالية المخاطر)
- ❌ `close_pos_session_atomic` RPC
- ❌ `process_pos_return` RPC
- ❌ حساب `variance`/قيود HR/قيود `1130/1110`
- ❌ ربط `card_bank_account_id` و `delivery_apps.visa_gl_account_code`
- ❌ منطق الجلسات المفتوحة/المغلقة و IndexedDB
- ❌ الافتراضيات لباقي الصلاحيات (تبقى زي ما هي)

## التأثير التشغيلي
| العملية | قبل | بعد |
|---|---|---|
| كاشير يشيك على فاتورة زبون من ورديته | ✅ يقدر | ✅ يقدر |
| كاشير يعرف إجمالي مبيعاته خلال الوردية | ✅ يعرف | ❌ مخفي |
| كاشير يعرف كم فيزا اليوم | ✅ يعرف | ❌ مخفي |
| كاشير يلغي فاتورة | يحتاج مدير | يحتاج مدير (نفس الوضع) |
| كاشير يعمل ارتجاع | ✅ مباشرة | يحتاج مدير |
| كاشير يفتح /pos-reports | ✅ يقدر | ❌ ممنوع |
| إيصال الإغلاق للكاشير | يشوف المتوقع + الفرق | يشوف الفرق فقط بدون breakdown |
| الأدمن/المدير | كل شي | كل شي (لا تغيير) |

## ترتيب التنفيذ
1. Migration (3 أعمدة + جدول التدقيق) — يحتاج موافقتك.
2. تعديل `POSPage.tsx` + `InvoiceHistoryDrawer.tsx` + `ExpenseModal.tsx` + `ShiftSummaryReceipt.tsx` + `ReturnDialog.tsx` + Guard على `/pos-reports`.
3. اختبار: سيناريو كاشير كامل (بيع → ارتجاع → إغلاق) + سيناريو أدمن.

وافق على الخطة أو حدد أي مرحلة تبدأ بها فقط (مثلاً مرحلة 1+2+4 الآن وتأجيل سجل التدقيق).
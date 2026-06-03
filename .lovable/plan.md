## الهدف
تحويل تبويب "قائمة المتابعة" داخل `/feedback` من كروت عمودية إلى **شاشة تشغيل احترافية بأسلوب Dynamics / FinanceShell**: ActionPane + Filters Bar + DataTable + Drawer جانبي، مع الإبقاء على تبويب "بحث" كما هو.

---

## 1) الباك إند — تحديث RPC `feedback_followup_queue`

ملف migration جديد يعيد تعريف الدالة بتوقيع موسّع (تبقى نفس النتيجة الأساسية لمن لا يمرّر فلاتر):

**المدخلات الجديدة (كلها اختيارية):**
- `p_from_date date`, `p_to_date date`
- `p_query text` (يفلتر اسم + هاتف + هاتف مطبَّع)
- `p_branch_id uuid`
- `p_status text` — أحد: `not_called | called | no_answer | needs_followup | complaint | completed`
- `p_dnc boolean`
- `p_sentiment text`
- `p_min_rating int`, `p_max_rating int`
- `p_limit int default 100`, `p_offset int default 0`

**المخرجات تضاف لها:**
- `last_order_id uuid`, `last_order_number text`
- `last_handled_by text` (من `feedback_calls.handled_by` إن وُجد، أو email المستخدم)
- `followup_status text` (محسوب: لا اتصال / تم / لم يرد / يحتاج متابعة / شكوى / مكتمل بناءً على outcome + sentiment)
- `source text` (ثابت `call_center` في V1، حقل جاهز لإضافة POS/Qamar لاحقاً)
- `total_count bigint` (نفس القيمة في كل صف لاحتساب pagination)

**ملاحظات تنفيذ:**
- نبقى على مصدر `call_center_orders` فقط في V1 (تصميم RPC قابل للتوسعة عبر `UNION ALL` لاحقاً).
- نحافظ على إصلاح `max(uuid)` السابق عبر `(array_agg(... ORDER BY created_at DESC))[1]`.
- نفس فحوصات الصلاحية + سقف 7 أيام + `get_team_owner_id`.

---

## 2) الواجهة — مكوّنات جديدة داخل `src/components/feedback/`

### أ. `FollowupQueueShell.tsx` (يستبدل المحتوى الحالي للتبويب)
Layout عمودي:
```text
┌─────────────────────────────────────────────────────────┐
│ ActionPane (شريط إجراءات أفقي)                          │
├─────────────────────────────────────────────────────────┤
│ FiltersBar (بحث + chips + dropdowns + collapsible)      │
├─────────────────────────────────────────────────────────┤
│ FollowupDataTable (ديسكتوب) / FollowupCards (موبايل)    │
└─────────────────────────────────────────────────────────┘
                       + FollowupDrawer (يفتح من اليسار)
```

### ب. `FollowupActionPane.tsx`
- أزرار: **تحديث** / **فتح التفاصيل** / **تسجيل متابعة** / **تغيير الحالة** ▾ / **اتصال** / **واتساب** / **إظهار الفلاتر** ▾
- الأزرار التي تحتاج صفاً (`disabled` ما لم يوجد `selectedRow`).
- شريط معلومات صغير يظهر اسم + هاتف الصف المختار وعدد النتائج.
- "تغيير الحالة" Dropdown يستدعي `feedback_log_call` بـ outcome سريع (no_answer/called/needs_followup/complaint/completed) + DNC إن مسموح.

### ج. `FollowupFiltersBar.tsx`
- صف 1 (دائم الظهور): بحث debounced (350ms) + chips تاريخ + زر "مخصص" + عدد النتائج.
- صف 2 (Collapsible): Selects للفرع/الحالة/DNC/Sentiment + Slider للتقييم 1-5 + عدد الطلبات + المصدر (placeholder).
- نطاق التاريخ يبقى مقيداً بـ7 أيام مع toast واضح.

### د. `FollowupDataTable.tsx` (≥ md breakpoint)
- جدول `<table>` بسيط (بدون مكتبة جديدة) داخل `<div class="overflow-auto">`، رؤوس ثابتة (`sticky top-0`).
- الأعمدة المطلوبة في الـ PRD (تحديد/اسم/هاتف/فرع/آخر طلبية/وقتها/عدد الطلبات/إجمالي الصرف/الحالة/Sentiment/ملاحظة/DNC/آخر موظف/آخر متابعة/إجراءات مختصرة).
- صف مختار يأخذ خلفية `bg-primary/5` + حدود `ring-1 ring-primary/40`.
- النقر على الصف = اختيار، النقر المزدوج أو زر "تفاصيل" = فتح Drawer.
- إجراءات الصف: أيقونات اتصال/واتساب/متابعة/تفاصيل.
- خط أوضح (`text-slate-800 font-semibold` للعناوين، `text-slate-600` للقيم) بحجم 13-14px.

### هـ. `FollowupCards.tsx` (< md)
- إعادة استخدام الكروت الحالية مع نفس الفلاتر + ActionPane مختصر فوقها.

### و. `FollowupDrawer.tsx`
- Sheet من اليسار بعرض `w-full md:w-[640px]`.
- يستضيف `CustomerDetail` الحالي كما هو (لا إعادة بناء)، مع تمرير `customerId` و `onSaved` لإجبار تحديث الصف بعد حفظ متابعة.

### ز. `useFollowupQueue.ts` (hook)
- يدير الحالة: filters، selectedRow، rows، loading، pagination (`limit/offset`، زر "تحميل المزيد").
- يستدعي RPC مع debounce على `query`.
- يكشف `refresh()` للاستخدام بعد تسجيل متابعة أو من زر "تحديث".

---

## 3) تعديلات على ملفات قائمة

- `src/pages/FeedbackPage.tsx`:
  - استبدال `<FollowupQueue/>` داخل تبويب `queue` بـ `<FollowupQueueShell/>`.
  - إبقاء تبويب `search` كما هو.
  - `openFromQueueRow` يبقى لكن يُستخدم الآن من خلال `onOpenDetail` الذي يمرَّر للـ Shell.
- `src/components/feedback/FollowupQueue.tsx`: يبقى ملفاً قديماً لمرجع الموبايل أو يُحذف لاحقاً (سنبقيه كـ fallback مؤقت ثم نتخلص منه عند ثبات الإطلاق — نزيله من الاستيراد فقط).

---

## 4) السلوك والروابط

- **اتصال**: `<a href="tel:{phone}">`.
- **واتساب**: `https://wa.me/972{phone بعد إزالة الصفر}` (نفس تطبيع نظام أموالي).
- **DNC**: شارة حمراء واضحة + تعطيل زري الاتصال/واتساب على الصف + tooltip تفسيري.
- **بعد حفظ متابعة**: Drawer يبقى مفتوحاً، الصف يتحدث محلياً (optimistic) + إعادة جلب الـ RPC بصمت.

---

## 5) الأمان والصلاحيات
- لا تغيير: نفس `has_feature_permission('call_center_feedback','customers','view')`.
- نفس `get_team_owner_id`، لا فلترة `user_id` من الفرونت.
- لا تعديل على الفواتير/الدفع/الطلبات؛ فقط `feedback_calls` و `feedback_customers`.

---

## 6) معايير القبول (مطابِقة لطلب المستخدم)
1. الجدول يظهر افتراضياً على الديسكتوب داخل تبويب "قائمة المتابعة".
2. البحث الداخلي يفلتر بالاسم/الهاتف debounced.
3. التاريخ بحد أقصى 7 أيام مع toast عند التجاوز.
4. فلاتر الحالة/DNC/Sentiment/التقييم تغيّر النتائج من قاعدة البيانات.
5. اختيار صف يفعّل ActionPane ويظهر معلومات الزبون المختار.
6. اتصال = `tel:` ، واتساب = `wa.me`.
7. تسجيل متابعة يفتح Drawer مع `CustomerDetail` على تبويب المكالمة.
8. حفظ المتابعة يحدّث الصف بدون مغادرة الشاشة.
9. DNC يظهر بشارة واضحة ويعطّل الاتصال.
10. الموبايل: كروت + ActionPane مختصر، نفس الفلاتر.

---

## ملاحظة على الـ Scope
هذا تنفيذ V1 مع إبقاء `source = call_center` فقط. توسعة `pos_orders` و `qamar_orders` تتطلب توحيد أعمدة (`customer_phone`) وستكون مهمة لاحقة منفصلة. الـ RPC والـ UI مهيّآن لاستقبال `source` كفلتر دون تغيير في الواجهة.

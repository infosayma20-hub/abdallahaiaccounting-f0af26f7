
# خطة تنفيذ 12 تعديل — POS / Call Center / متابعة الزبائن

التعديلات بتنقسم لـ 3 طبقات: **قاعدة بيانات (migrations)** + **واجهة (UI)** + **بيانات منيو الملكي (data updates)**. كل تعديل مفصول عن الباقي عشان ما يكسر إشي.

---

## 1) فلاتر متابعة الزبائن

**ملف:** `src/components/feedback/FollowupQueueShell.tsx` + `src/pages/FeedbackPage.tsx`

أضيف شريط فلاتر مدمج (Popover واحد فيه كل الفلاتر + Chips تظهر الفلاتر النشطة):
- نوع الطلب (delivery / takeaway / dine_in / pos / online)
- الموظف اللي أخذ الطلب (`called_by_name` من `feedback_calls` + قائمة `pos_users`)
- حالة التواصل (`followup_status`: pending / done / no_answer / postponed)
- الفرع (`last_known_branch_id`)
- نطاق التاريخ (DateRangePicker)
- اسم الزبون (search)
- رقم الهاتف (search مع normalize 972)

التطبيق على query موجودة بدون كسر الـ pagination. الفلاتر بتنحفظ بـ URL params.

## 2) عدد المتابعات لكل موظف

كرت إحصائية فوق الجدول بيعرض: اسم الموظف + عدد `feedback_calls` (distinct customer_id) ضمن نفس الفلاتر/الفترة. Aggregate query بـ Supabase RPC جديدة `get_followup_stats_by_agent(filters jsonb)` أو aggregation جانب الـ client من نفس النتائج.

## 3) تنبيه نفاد صنف من الكاش للكول سنتر (Realtime)

**Migration جديد:**
```sql
CREATE TABLE public.stockout_alerts (
  id uuid PK, user_id uuid, branch_id uuid,
  product_id uuid NULL, modifier_option_id uuid NULL,
  custom_label text NULL,           -- لما يكون نص حر
  raised_by uuid, raised_by_name text, raised_at timestamptz,
  status text CHECK (status IN ('active','resolved')),
  resolved_by uuid, resolved_at timestamptz,
  note text
);
-- GRANT + RLS company-scoped + ALTER PUBLICATION supabase_realtime ADD TABLE
```

**UI:**
- زر "تنبيه نفاد صنف" داخل POS (cashier) → Dialog يختار من قائمة `products`/`modifier_options` أو يكتب نص حر.
- بانر أحمر ثابت أعلى شاشة الكول سنتر (`PendingOrdersPanel` / `CallCenterDispatchDialog`) يعرض التنبيهات النشطة realtime + زر "إلغاء" للفرع.
- سجل في صفحة `CallCenterReportsPage` (تبويب جديد).
- **لا حذف للأصناف** من POS — تنبيه فقط.

## 4) ترتيب التصنيفات والأصناف لكل مستخدم

استخدام الجدول الموجود `pos_user_preferences` بمفاتيح:
- `category_order` → `{ [categoryId]: orderIndex }`
- `product_order:<categoryId>` → `{ [productId]: orderIndex }`

**ملف:** `src/pages/POSPage.tsx`
- تحميل preferences حسب `auth_user_id` عند الدخول.
- ترتيب لكل مستخدم منفصل (`auth_user_id`، مش `user_id` المالك).
- أصناف جديدة → تظهر بالنهاية (orderIndex = max+1).
- الاعتماد على `category_id` و `product_id` فقط — تغيير الاسم ما بيأثر.
- Drag & Drop موجود مسبقاً (أو نضيف minimal باستخدام `@dnd-kit` لو ناقص).

## 5) خيار "بدون بهار" لكل وجبات الملكي

**Data migration (INSERT):**
- modifier_group واحد عام اسمه "بهارات" (selection_type=single, min=0, max=1).
- modifier_options: "بهار عادي" (default, price=0) + "بدون بهار" (price=0).
- ربط الـ group بكل المنتجات الموجودة في شركة الملكي عبر `product_modifier_groups`.
- الـ option بيمشي تلقائياً للكاش والطباعة عبر النظام الحالي للـ `order_item_modifiers`.

## 6) تنبيه صوتي بعد 5 دقائق للطلبيات غير المقبولة

**ملف:** `src/components/pos/DispatchedOrdersLog.tsx` (شاشة الكول سنتر)
- Timer لكل طلبية محوّلة بحالة `pending`/`dispatched` غير `accepted`.
- بعد 5 دقائق: تشغيل صوت **مرة وحدة فقط** (Set من IDs نبهنا عليهم في الجلسة) + Badge أحمر "تأخر القبول".
- يتوقف إذا: accepted, cancelled, modifying.
- ملف صوت قصير في `public/sounds/`.

## 7) صنف "25 قطعة أجنحة مقلي" 70 ₪

**Data INSERT:**
- منتج جديد في تصنيف الأجنحة، السعر 70.
- نسخ ربط `product_modifier_groups` من أي منتج أجنحة موجود ليرث نفس الإضافات.

## 8) خيار "نص حار بهار" للأجنحة

**Data INSERT:**
- إيجاد modifier_group الخاص بنكهة الأجنحة وإضافة option "نص حار بهار" (extra_price=0).

## 9) تصحيح أسعار البروست (المشوي = العادي + 2)

**Data UPDATE:**
- استعلام كل منتجات البروست (عادي/مشوي) ومطابقة كل عادي بمشوي بنفس الاسم، ثم UPDATE price للمشوي = price العادي + 2.
- مع تثبيت: قطعتين عادي = 23، قطعتين مشوي = 25، سفينتين عادي = 27، سفينتين مشوي = 29.
- بدون لمس أسماء أو إضافات.
- نعرض الجدول النهائي قبل التطبيق.

## 10) تأكيد إغلاق الكول سنتر

**ملف:** `src/components/pos/CallCenterDispatchDialog.tsx` (أو زر الإغلاق في شاشة الكول سنتر)
- AlertDialog "هل تريد إغلاق الكول سنتر؟ قد تفقد طلبية غير مرسلة."
- Confirm → يغلق.

## 11) إضافات وجبات المشوي (بطاطا مشوية / مع خضار / بدون خضار)

**Data INSERT:**
- modifier_group "خيارات المشوي" (single select).
- options: "بطاطا مشوية"، "مع خضار"، "بدون خضار".
- ربطها بكل منتجات تصنيف المشوي.

## 12) "مكس صوصات" للجوسي كرسبي — 30 ₪

**Data INSERT:**
- إما modifier_option "مكس صوصات" بـ extra_price=30 ضمن جروب الصوصات الموجود، أو منتج مستقل ضمن تصنيف الكرسبي.
- الأنسب: option داخل جروب صوصات الكرسبي (يحافظ على الفلو الحالي).

---

## ترتيب التنفيذ

1. **Migrations** (بند 3 فقط — جدول `stockout_alerts`).
2. **Data migrations** للملكي (5, 7, 8, 9, 11, 12) — قبل ما أبلش بعرض الـ SQL النهائية للمراجعة.
3. **UI changes** (1, 2, 3-UI, 4, 6, 10).

## ضمانات السلامة (ما رح نكسر إشي)

- مسار الكول سنتر الحالي — كل التغييرات إضافة (تنبيهات + بانر + Dialog تأكيد). ما رح ألمس منطق التحويل للفروع.
- التوصيل ورسومه — ما رح ألمس `delivery_settlement` أو `shipping_final/driver_cost`.
- الطباعة — الإضافات الجديدة بتمر عبر `order_item_modifiers` الحالي اللي أصلاً بيطبع.
- ترتيب الأصناف — preferences جديدة per-user؛ الترتيب القديم العام بيبقى fallback.
- التقارير ومنطق البيع — صفر تغيير.

## تحتاج تأكيد قبل البدء

1. **بند 5 (بدون بهار):** أطبقه على **كل** منتجات شركة الملكي، أم فقط على تصنيفات معينة (وجبات/سندويتشات)؟
2. **بند 9 (أسعار البروست):** ابعت قبل التطبيق جدول "العادي → المشوي + 2" للمراجعة، أم نفّذ مباشرة بناءً على القاعدة العامة؟
3. **بند 12 (مكس صوصات):** option داخل جروب الصوصات الحالي للجوسي كرسبي، صح؟
4. **شركة الملكي:** عندي عدة عملاء — هل company_id محدد؟ أحتاجه عشان data migrations.

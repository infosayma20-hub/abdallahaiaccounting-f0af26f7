
## فهم الوضع الحالي (مهم قبل التعديل)

قرأت قاعدة البيانات والكود بالتفصيل:

**جدول `call_center_orders`** يحفظ الطلبية مع:
- `delivery_fee` (numeric) — رسوم التوصيل
- `delivery_info` (jsonb) — `{city, area, branch_id, branch_name, original_fee, final_fee, manually_adjusted}`
- `delivery_address`, `customer_name`, `customer_phone`
- `branch_id` (الفرع المستهدف)، `status` (pending/accepted/...)
- لا يوجد عمود لسعر Wheels محفوظ هنا — السعر الفعلي يُجلب لاحقاً من `send-to-wheels` بعد القبول في الكاشير.

**جدول `delivery_zones`** يحوي لكل (فرع × منطقة):
- `price` — السعر الافتراضي اليدوي (السعر القديم).
- `wheels_area_id` — رقم المنطقة في Wheels (إن كان الفرع مربوطاً).
- `wheels_fixed_price` — سعر Wheels المخزّن آخر مرة (cache).

**جدول `wheels_branch_config`** — 4 فروع مربوطة (سفيان/فيصل/بلازا/الطيرة) مع `secret_name` لمفتاح API.

**الـ Edge Function `wheels-test` (mode: ping)** — يستدعي `POST /orders/getDeliveryPrice` بـ `{branch, area}` ويُرجع السعر الحي من Wheels. هذا هو نفس endpoint الذي يستدعيه `send-to-wheels` لحظة الإرسال الفعلي.

**التدفق الحالي في `CallCenterDispatchDialog.tsx`:**
1. الموظف يختار الفرع يدوياً.
2. يكتب الاسم/الجوال.
3. يكتب العنوان يدوياً.
4. `DeliveryZonePicker` يعرض كل المدن/المناطق لكل الفروع، يختار الأرخص تلقائياً، **والسعر قابل للتعديل يدوياً**.
5. عند `onChange` المنطقة → `setSelectedBranch` يتبدل تلقائياً لفرع المنطقة.
6. العنوان يُملأ تلقائياً بصيغة `"city - area"` (بادئة) ويمكن للموظف إضافة شارع/بناية.

**المشاكل التي يريد المستخدم حلها:**
1. الترتيب الحالي مربك: الفرع أولاً ثم المنطقة لاحقاً.
2. السعر اليدوي القابل للتعديل لا معنى له — Wheels هو من يحدّد السعر.
3. السعر المعروض يأتي من `delivery_zones.price` (قد يكون قديماً)، وليس من Wheels مباشرة.
4. العنوان مكان وضعه في الأعلى يجعله يبدو وكأنه أول حقل يجب تعبئته.

---

## الخطة

### 1) إعادة ترتيب الـ UI داخل قسم "توصيل"

الترتيب الجديد من الأعلى للأسفل (بعد اختيار "توصيل"):

```text
[نوع الطلب: توصيل / استلام / طاولة]
        ↓ (إذا توصيل)
[منطقة التوصيل]   ← يُختار أولاً (مدينة → منطقة)
        ↓
[الفرع]           ← يُعرض فقط الفروع المتاحة لهذه المنطقة
                    إذا فرع واحد → يُختار تلقائياً
                    إذا أكثر من فرع → خيار يدوي (chips)
        ↓
[سعر التوصيل من Wheels]  ← يُجلب live من /orders/getDeliveryPrice
                            عرض فقط (read-only) + spinner أثناء الجلب
                            fallback: delivery_zones.wheels_fixed_price إن فشل
        ↓
[عنوان التوصيل]   ← يُملأ تلقائياً بـ "city - area" بعد اختيار المنطقة
                    يمكن للموظف إضافة تفاصيل (شارع، بناية)
```

### 2) إلغاء التعديل اليدوي للسعر

- إزالة حقل `input type="number"` لتعديل `final_fee` من `DeliveryZonePicker`.
- إزالة شارة "معدّل يدوياً" والـ flag `manually_adjusted` (تبقى في النوع لكن دائماً `false` للطلبات الجديدة من الكول سنتر).
- السعر يصبح read-only badge.

### 3) جلب السعر من Wheels مباشرة

- إنشاء mode جديد في `wheels-test` (أو دالة منفصلة `wheels-get-price`) يستقبل `{branch_id, wheels_area_id}` ويُرجع `{price, latency, error?}`.
- في `DeliveryZonePicker` (أو الـ Dialog مباشرة): بعد اختيار المنطقة + الفرع، استدعاء الدالة وعرض السعر الحي.
- إذا الفرع غير مربوط بـ Wheels (مثل "فرع افتراضي" أو فرع بدون `wheels_branch_config`) → fallback إلى `delivery_zones.price` كما هو، مع badge صغير "سعر داخلي".
- في حال فشل النداء → fallback إلى `wheels_fixed_price` المخزّن مع toast تحذيري.

### 4) العنوان يُملأ تلقائياً ويبقى آخر شيء

- نقل قسم "عنوان التوصيل" ليكون أسفل المنطقة/الفرع/السعر مباشرة.
- المنطق الحالي للـ auto-fill يبقى (بادئة `city - area` قابلة للإضافة) — هذا صحيح.
- يبقى الحقل required لكن يُملأ تلقائياً فور اختيار المنطقة، فعملياً لا حاجة لكتابة شيء.

### 5) Backend — لا تغييرات على schema

- لا حاجة لـ migrations.
- نضيف فقط mode في edge function أو نُعيد استخدام `ping` بإرجاع `probe_area` (موجود بالفعل) لكن مع تمرير `area_id` مخصص بدل أول منطقة.

---

## الملفات التي ستُعدّل

1. **`supabase/functions/wheels-test/index.ts`** — إضافة `mode: "price"` يأخذ `{branch_id, wheels_area_id}` ويُرجع السعر الحي من `/orders/getDeliveryPrice` (دالة موجودة، فقط تعميمها لتقبل area_id من الـ client).
2. **`src/components/pos/DeliveryZonePicker.tsx`** — إزالة تعديل السعر اليدوي، عرض السعر كـ badge فقط، إضافة hook لجلب السعر من Wheels عند تغير الـ zone، عرض حالة (loading/live/cached/manual).
3. **`src/components/pos/CallCenterDispatchDialog.tsx`** — إعادة ترتيب الـ JSX داخل قسم "delivery": المنطقة قبل العنوان، نقل العنوان للأسفل، إزالة منطق `manually_adjusted` من الـ payload.

---

## تفاصيل تقنية للمراجعة

- **تعريف "الفرع متاح لهذه المنطقة"**: يوجد صف في `delivery_zones` يربط `(area_name, branch_id)`. الـ picker الحالي يفلتر بهذا أصلاً، لكن بعد إعادة الترتيب سيُعرض الفرع كحقل ثانٍ مبني على المنطقة المختارة (وليس كل الفروع).
- **السعر للفروع غير المربوطة بـ Wheels**: مثل "فرع افتراضي" — يبقى `delivery_zones.price` (السعر اليدوي القديم) لأنه لا يوجد API بديل.
- **ملاحظة**: التعديل لا يلمس `pos_orders` أو `complete_pos_order` أو `send-to-wheels` — فقط تجربة الإدخال في الكول سنتر. الإرسال الفعلي لـ Wheels يستمر كما هو (بعد القبول والدفع في الكاشير، حسب آخر تعديل في `POSPage.tsx`).
- **التحذير**: السعر المعروض وقت الكتابة في الكول سنتر قد يختلف بسيطاً عن السعر النهائي وقت الإرسال (لأن Wheels قد يحدّث الأسعار)، لذا `send-to-wheels` ينادي الـ API مرة أخرى لحظة الإرسال — هذا السلوك يبقى ولا يحتاج تغيير.

هل أبدأ التنفيذ بهذا الترتيب؟

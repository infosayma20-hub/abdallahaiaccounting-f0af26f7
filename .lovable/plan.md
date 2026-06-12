
# التحكم في طباعة التصنيفات حسب الفرع والمحطة

## الفكرة باختصار
شاشة مصفوفة (Matrix) في إعدادات نقطة البيع:
- **الصفوف**: تصنيفات المنتجات (item_categories / pos_categories)
- **الأعمدة**: محطات الطباعة (kitchen_stations) لكل فرع
- **الخلية**: مفتاح تشغيل/إطفاء

افتراضياً كل شيء **مفعّل** (السلوك الحالي لا يتغير). فقط الإطفاء يُسجَّل كصف في الجدول.

## التغييرات على قاعدة البيانات

### جدول جديد: `pos_category_print_rules`
```sql
- id uuid PK
- user_id uuid (tenant)
- branch_id uuid NULL  -- NULL = كل الفروع
- category_id uuid NOT NULL → item_categories.id
- station_id uuid NOT NULL → kitchen_stations.id
- muted boolean default true  -- وجود الصف = مكتوم
- created_at, updated_at
- UNIQUE(user_id, branch_id, category_id, station_id)
```
- RLS: مالك حسب user_id فقط
- GRANT للـ authenticated + service_role

> ملاحظة: لن يُحذف ولن يُعدّل أي جدول قائم. ولن يُلمس وصل الزبون أبداً — التحكم يطال **تذاكر المحطات فقط**.

## التغييرات في الكود

### 1) `src/pages/POSPage.tsx` (دالة الدفع + handleSendToKitchen)
- عند تحميل المنتجات للسلة نضيف `category_id` في select.
- بعد بناء `stationItems` (السطور 3752-3769) نمرر القائمة عبر فلتر:
  - إذا وُجد صف في `pos_category_print_rules` يطابق (branch, category, station) → نزيل العنصر من تلك المحطة.
  - فحص branch_id الخاص بالفرع + الصف العام (branch_id NULL).
- النتيجة: إذا أُطفئت كل أصناف المحطة → لا تُرسل تذكرة لها (السلوك الموجود أصلاً مع `kitchenJobs.filter(items.length>0)`).
- نفس المنطق في `handleSendToKitchen`.

### 2) Hook جديد: `src/hooks/usePrintMuteRules.ts`
- يحمّل القواعد مرة واحدة + cache + realtime invalidate عبر BroadcastChannel "malaky-sync".
- يصدّر `isMuted(branchId, categoryId, stationId): boolean`.

### 3) شاشة إعدادات: `src/components/settings/CategoryPrintRulesMatrix.tsx`
- منتقي فرع (مع خيار "كل الفروع").
- جدول: تصنيفات (صفوف) × محطات نشطة للفرع المختار (أعمدة).
- كل خلية Checkbox: ✓ تطبع، ✗ لا تطبع.
- تغيير الخلية → upsert/delete في الجدول + بث `malaky-sync`.
- زر "إطفاء كل أصناف هذا التصنيف على هذه المحطة لكل الفروع".

### 4) ربطها في إعدادات نقطة البيع
- إضافة قسم جديد "قواعد طباعة التصنيفات على المحطات" بجانب `KitchenStationsManager` في نفس صفحة الإعدادات الحالية للمطبخ/المحطات.

## ما لن يتغير (لحماية الاستقرار)
- وصل الزبون يُطبع دائماً كما هو.
- لا تغيير على `image-print-service.ts` ولا على Print Bridge — الفلترة تتم **قبل** إرسال `kitchenJobs`.
- لا تغيير على جداول kitchen_stations / pos_printers / products.
- المنطق الموحّد لفرع رام الله بلازا (unified_kitchen) يبقى يعمل لأن الفلترة تسبق دمج الـ items.

## التحقق بعد البناء
1. بدون أي قاعدة مكتومة → الطباعة تشتغل كما اليوم.
2. كتم تصنيف "حلويات" على محطة "السخان" في فرع رام الله → بيع صنف حلويات يطبع وصل الزبون + لا تذكرة سخان. باقي الأصناف تطبع طبيعي.
3. كتم تصنيف على كل المحطات → الصنف يطلع فقط بوصل الزبون.
4. لا تأثير على بقية الفروع.

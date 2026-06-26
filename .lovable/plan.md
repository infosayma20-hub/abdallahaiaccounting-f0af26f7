
# منيو QR — وحدة عامة لأي مستخدم (الملكي أول زبون)

## المبدأ
لا يوجد أي شيء Hard-coded لفرع أو شركة. كل الإعدادات (الفروع، الطاولات، الأقسام، المنتجات، العملة، الألوان، اللوغو) تُقرأ من جداول الشركة الحالية. تفعيل الميزة لكل شركة عبر `company_settings.qr_menu_enabled`.

## نقطة الدخول
بطاقة جديدة داخل **شاشة نقطة البيع** (`POSPage` أو `AppsLauncher` ضمن مجموعة المطاعم):
- **"منيو QR"** بأيقونة QrCode → يفتح `/pos/qr-menu/admin`
- تظهر فقط إذا `qr_menu_enabled = true` لشركة المستخدم.

## الشاشات المضافة

### 1. لوحة إدارة منيو QR (للمالك/المدير) — `/pos/qr-menu/admin`
- تبويب **الإعدادات**: تفعيل/تعطيل، اختيار نمط (Dine-in / Takeaway / كلاهما)، رسالة ترحيب، شعار، ألوان (تُقرأ من `company_themes`).
- تبويب **الفروع المفعّلة**: checkbox لكل فرع من `branches`.
- تبويب **الطاولات والـ QR**: لكل طاولة من `restaurant_tables` زر "تنزيل QR" و"طباعة كل QR للفرع" (PDF شبكي).
- تبويب **الأقسام والمنتجات الظاهرة**: toggle لإخفاء/إظهار قسم أو منتج من المنيو العام (عمود جديد `show_in_qr_menu` على `pos_categories` و`products`).
- تبويب **الطلبات الواردة**: لوحة Realtime لمتابعة كل طلبات QR.

### 2. صفحة المنيو العامة (للزبون) — `/m/:companySlug/:branchSlug/:tableCode?`
- بدون تسجيل دخول.
- تقرأ الفرع والشركة من الـ slug، تعرض المنتجات الظاهرة + الإضافات (`modifier_groups`).
- سلة + ملاحظات لكل صنف + اسم/جوال (اختياري) + إرسال.
- بعد الإرسال: شاشة "طلبك رقم #X قيد المراجعة" مع Realtime لحالة الطلب.

### 3. شاشة استقبال الطلبات في POS — Drawer داخل `POSPage`
- زر عائم/تنبيه صوتي عند وصول طلب QR جديد (Realtime على جدول `qr_menu_orders`).
- بطاقة الطلب: الطاولة، الأصناف، الإضافات، الملاحظات، اسم/جوال الزبون.
- زرّان: **قبول** → يحوّل الطلب لسلة POS الحالية (نفس آلية تحويل طلبات الكول سنتر) ويُطلق التذاكر التلقائية للمطبخ. **رفض** + سبب → يُعلم الزبون.

## تغييرات قاعدة البيانات (Migration واحد)

```sql
-- 1) Settings flags
ALTER TABLE company_settings
  ADD COLUMN qr_menu_enabled boolean DEFAULT false,
  ADD COLUMN qr_menu_mode text DEFAULT 'dine_in', -- dine_in | takeaway | both
  ADD COLUMN qr_menu_welcome_message text,
  ADD COLUMN qr_menu_require_phone boolean DEFAULT false;

-- 2) Slugs for public URLs (no hard-coding)
ALTER TABLE companies ADD COLUMN public_slug text UNIQUE;
ALTER TABLE branches  ADD COLUMN qr_menu_enabled boolean DEFAULT false,
                      ADD COLUMN public_slug text;

-- 3) Visibility toggles
ALTER TABLE pos_categories ADD COLUMN show_in_qr_menu boolean DEFAULT true;
ALTER TABLE products       ADD COLUMN show_in_qr_menu boolean DEFAULT true;

-- 4) Orders inbox
CREATE TABLE qr_menu_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id  uuid NOT NULL REFERENCES branches(id),
  table_id   uuid REFERENCES restaurant_tables(id),
  customer_name text, customer_phone text,
  items jsonb NOT NULL,        -- [{product_id, qty, note, modifiers:[]}]
  notes text,
  status text NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|converted|cancelled
  reject_reason text,
  pos_order_id uuid,           -- after acceptance
  short_number int,            -- daily display number for customer
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz, accepted_by uuid
);
-- GRANTs + RLS (anon INSERT scoped to branch where qr_menu_enabled=true,
-- authenticated SELECT/UPDATE within their company).
ALTER PUBLICATION supabase_realtime ADD TABLE qr_menu_orders;
```

## نقاط أمان وحماية
- صفحة عامة بدون auth → Rate limit عبر edge function `submit-qr-order` (5 طلبات/دقيقة لكل IP).
- التحقق أن الفرع والشركة مفعّلين فعلاً قبل القبول.
- لا يُنشأ سجل POS إلا بعد قبول الكاشير (لا auto-fire للمطبخ).

## ربط أوتوماتيكي بالموجود (بدون تكرار)
- التذاكر → نظام KDS v2 الحالي (تلقائي عند تحويل الطلب لـ `pos_orders`).
- الطباعة → Print Bridge + station routing (نفسه).
- الأرقام اليومية → `daily_display_number` الحالية.
- التقييم بعد الدفع → `customer_surveys` (نفسه).

## خطة التسليم (مراحل صغيرة)
1. **Migration + إعدادات + بطاقة "منيو QR" في POS** (يومان).
2. **صفحة المنيو العامة + Edge function لإرسال الطلب** (يومان).
3. **Drawer استقبال الطلبات + تحويلها لسلة POS + Realtime + تنبيه صوتي** (يومان).
4. **مولد QR للطاولات + PDF شبكي للطباعة** (يوم).
5. **تجربة على فرع واحد للملكي قبل التعميم** (يوم).

أبدأ بالمرحلة 1؟

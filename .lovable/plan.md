
# خطة بناء "بطاقة الصنف" – شاشة كاملة على نمط Microsoft Dynamics 365 F&O

## 1) دراسة مقارنة – Hesabate (المحلي) vs Amwali (الحالي)

### الشاشة الحالية في أموالي (Dialog داخل `InventoryPage.tsx`)
4 تبويبات فقط داخل نافذة منبثقة (max-w-3xl):
- **الأساسية**: اسم، SKU، باركود، تصنيف، وحدة، نوع الصنف (raw/wip/finished/service)، يُباع/يُشترى/POS، وصف.
- **الأسعار والمخزون**: سعر التكلفة، سعر البيع، الكمية الابتدائية، حد أدنى.
- **الكفالة**: مدة + نوع + ملاحظات.
- **إعدادات متقدمة**: صورة، ضريبة، حالة نشط.

### ما يقدّمه البرنامج المحلي (Hesabate) – 7 تبويبات
| التبويب | الحقول الرئيسية | متوفر عندنا؟ |
|---|---|---|
| **معلومات الأصناف** | سعر تكلفة ابتدائي/حالي، سعر خاص، سيريال، أماكن-افتراضي، قياسات-افتراضي، بونص، صنف رئيسي، علامة تجارية، موديل، الشركة المنتجة، الطراز، ألوان المخزون، كميات ابتدائية **لكل مخزن** (شارع سفيان، فيصل، نابلس، رام الله، بلازا…)، حد أدنى/أعلى للتذكير، نسبة الخصم، الرقم الأصلي، رقم المصنع، عمولة المبيعات، فئات أسعار متعددة (مفرق، جملة…) بحدود سعرية دنيا/عليا | جزئي جداً |
| **الوحدات** | وحدة رئيسية + وحدة بيع + مجموعة وحدات + وحدات فاعلة + إيقاف وحدات | ❌ لا يوجد Multi-UoM |
| **باركود** | جدول متعدد: وحدة/باركود/قياسات/ملاحظات (باركودات متعددة لنفس الصنف) | ❌ باركود واحد فقط |
| **توفر المادة** | مستمر/توقف/سوف يتوقف (بتاريخ)/سوف يستبدل/مادة خطيرة/E-Commerce/Monday | ❌ فقط حالة نشط |
| **بدائل** | 6 أصناف بديلة مع صورة + استعراض | ❌ |
| **التصنيفات** | تصنيفات هرمية متعددة (Category tree) | جزئي (تصنيف واحد) |
| **تاريخ الصلاحية** | تفعيل، تواريخ ابتدائية، تذكير قبل انتهاء الصلاحية بـ X يوم | ❌ (رغم أن `product_batches` تدعمه على مستوى الدفعة) |
| **POS** | إعدادات نقاط البيع للمنتج | جزئي |

**الخلاصة**: أموالي ينقصه ما يقارب **60% من عمق تعريف الصنف** الموجود في المنافس، وخاصة: Multi-UoM، باركودات متعددة، متعدد المخازن، دورة حياة المنتج، البدائل، فئات أسعار، وربط دقيق بالتصنيع.

---

## 2) المرجعية العالمية – Microsoft Dynamics 365 F&O "Released Product Details"

الشكل المعياري:
- **Action Pane** علوي ثابت (شرائط أوامر مجمّعة: File / Product / Purchase / Sell / Manage inventory / Engineer / Cost management…)
- **Header** ملخص (Item number, Name, Product type, Status, Item model group)
- **FastTabs** قابلة للطي على العرض الكامل — كل FastTab يعرض Summary Line عند الطي.
- **Reference groups**: Product dimensions (Configuration, Size, Color, Style), Storage dimensions (Site, Warehouse, Location, Batch, Serial), Tracking dimensions.
- **Related information Pane** جانبي (Attachments, Related products, On-hand, BOM, Where-used).
- شريط سفلي: Save / Save & Close / Discard / Validate.

هذا هو النموذج الذي سنعتمده كـ Shell.

---

## 3) الهيكل المقترح للشاشة الجديدة

### المسار
- `/inventory/products/new`
- `/inventory/products/:id/edit`
(زر "إضافة منتج" في `InventoryPage` يتحوّل إلى `navigate()` بدل فتح Dialog، كما فعلنا في معادلة الإنتاج.)

### Shell (نسخة أموالي من F&O)

```text
┌─────────────────────────────────────────────────────────────────┐
│  Command Bar (sticky):                                          │
│  [رجوع] [حفظ] [حفظ وإغلاق] [حذف] [جديد مشابه] [تحقق] [مرفقات]  │
│  [طباعة باركود] [حركات المخزون] [كشف صنف] [BOM] [Where-used]   │
├─────────────────────────────────────────────────────────────────┤
│  Header Summary: [SKU] [الاسم] [النوع] [الحالة] [الرصيد الحالي]│
├─────────────────────────────────────────────────────────────────┤
│  ▸ عام (General)                        │ Related Pane:        │
│  ▸ الوحدات (Units of Measure)          │ - المرفقات           │
│  ▸ الباركود (Barcodes)                  │ - الأرصدة الحالية   │
│  ▸ الأسعار (Prices & Price Tiers)      │ - معادلة الإنتاج    │
│  ▸ المخزون (Inventory / Warehouses)    │ - أُستخدم في (Where- │
│  ▸ التصنيف والصفات (Classification)    │   used BOMs)         │
│  ▸ الشراء (Purchase)                    │ - المنتجات البديلة  │
│  ▸ البيع و POS                          │                      │
│  ▸ التصنيع (Manufacturing / BOM)       │                      │
│  ▸ دورة الحياة (Lifecycle & Availab.)  │                      │
│  ▸ الجودة والصلاحية (Quality/Expiry)   │                      │
│  ▸ الأبعاد (Product Dimensions)        │                      │
│  ▸ التتبع (Batch / Serial)              │                      │
│  ▸ الكفالة (Warranty)                   │                      │
│  ▸ الضريبة والمحاسبة                    │                      │
│  ▸ التجارة الإلكترونية                  │                      │
│  ▸ المرفقات والملاحظات                  │                      │
├─────────────────────────────────────────────────────────────────┤
│  Footer: [حفظ] [حفظ وإغلاق] [إلغاء]  آخر تعديل: …             │
└─────────────────────────────────────────────────────────────────┘
```

### تفصيل كل FastTab (الحقول الجديدة بالخط العريض)

1. **عام**: SKU (يدوي/تلقائي)، الاسم، **اسم الطباعة**، الوصف، النوع (raw/sub_assembly/wip/finished/service)، **الحالة (نشط/موقوف/سيتوقف بتاريخ/بديل)**، التصنيف الرئيسي، **العلامة التجارية**، **الشركة المنتجة**، **الموديل/الطراز**، **اللون الافتراضي**، **الرقم الأصلي**، **رقم المصنع**، مادة خطيرة.
2. **الوحدات (جديد كلياً)**: وحدة أساسية + جدول Multi-UoM (اسم الوحدة، معامل التحويل، هل للبيع/الشراء، نشط). يتطلب جدول `product_units`.
3. **الباركود (جديد كلياً)**: جدول باركودات متعددة (barcode, unit_id, description, is_default). يتطلب جدول `product_barcodes`.
4. **الأسعار**: سعر تكلفة معياري، سعر متوسط (محسوب)، **فئات أسعار متعددة** (مفرق، جملة، عميل مميز، مندوب) بحدود دنيا/عليا وعملة — جدول `product_price_tiers`. **عمولة المبيعات %/ثابت**، **نسبة الخصم القصوى**، **سعر خاص**.
5. **المخزون**: كميات ابتدائية **لكل مستودع** + حد أدنى/أقصى/تذكير لكل مستودع (`product_warehouse_settings`)، مستودع افتراضي، طريقة تقييم (Weighted Avg / FIFO / Standard).
6. **التصنيف والصفات**: تصنيفات هرمية متعددة، **مجموعة الأصناف (Item group)**، **مجموعة الأبعاد**، Tags حرة.
7. **الشراء**: مورد افتراضي، سعر شراء افتراضي، مدة توريد (Lead time)، أدنى كمية طلب، **حساب المشتريات المرتبط**.
8. **البيع/POS**: يُباع؟ يُظهر في POS؟ فئة POS، لون الزر، **قابل للخصم**، **يتطلب موافقة عند البيع تحت التكلفة**.
9. **التصنيع (Manufacturing)** — **الأهم للربط**:
   - `is_manufactured` (موجود)
   - `default_bom_id` → قائمة معادلات الإنتاج الفعّالة (Status=active)
   - زر **"إنشاء معادلة جديدة لهذا المنتج"** → `navigate('/production/formulas/new?product_id=...')`
   - زر **"عرض جميع المعادلات"** → فلترة صفحة المعادلات على هذا المنتج.
   - قسم "Where-used": المنتجات التي تستخدم هذا الصنف كمكوّن (استعلام على `production_formula_items`).
   - وقت الإنتاج القياسي، وحدة الإنتاج القياسية، Yield %.
10. **دورة الحياة**: مستمر / موقوف / سيتوقف بتاريخ / سيُستبدل بمنتج آخر (FK اختياري)، تاريخ الإطلاق.
11. **الجودة/الصلاحية**: هل له تاريخ صلاحية، مدة الصلاحية الافتراضية بالأيام، تذكير قبل الانتهاء بـ X يوم (يتصل بـ `product_batches`).
12. **الأبعاد**: الطول/العرض/الارتفاع، الوزن الصافي والقائم، الحجم (لحساب الشحن/الطباعة).
13. **التتبع**: تفعيل Serial / Batch (مربوط أصلاً بجدول `product_batches`).
14. **الكفالة**: كما هو حالياً.
15. **الضريبة والمحاسبة**: فئة الضريبة (`tax_categories`)، معفى؟، حساب الإيرادات، حساب التكلفة، حساب المخزون (تجاوز عن الافتراضي).
16. **التجارة الإلكترونية**: نشر إلى المتجر؟ SEO title/desc، صور إضافية.
17. **المرفقات والملاحظات**: ملفات، ملاحظات داخلية.

---

## 4) تغييرات قاعدة البيانات (Migration)

جداول جديدة:
```
product_units          (product_id, unit_name, conversion_factor, is_sale, is_purchase, is_default, is_active)
product_barcodes       (product_id, barcode UNIQUE per tenant, unit_id, description, is_default)
product_price_tiers    (product_id, tier_name, price, min_price, max_price, currency, min_qty)
product_warehouse_settings (product_id, warehouse_id, opening_qty, min_qty, reorder_qty, max_qty)
```

أعمدة تُضاف على `products`:
```
print_name, brand, manufacturer, model, default_color, original_number, factory_number,
is_hazardous, lifecycle_status (active/discontinued/will_stop/replaced),
will_stop_date, replaced_by_product_id,
lead_time_days, min_order_qty, default_supplier_id,
sales_commission_pct, sales_commission_fixed, max_discount_pct, special_price,
has_expiry, default_shelf_life_days, expiry_reminder_days,
length, width, height, net_weight, gross_weight, volume,
is_serialized, is_batch_tracked,
revenue_account_id, cost_account_id, inventory_account_id,
publish_to_ecommerce, seo_title, seo_description,
valuation_method (weighted_avg/fifo/standard),
standard_production_time_minutes, production_yield_pct
```

كل الجداول: GRANT + RLS مرتبط بـ `dataOwnerId` (عبر الانضمام لـ `products`).

---

## 5) خطة التنفيذ على مراحل

| # | المرحلة | الملفات |
|---|---|---|
| 1 | Migration قاعدة البيانات (جداول + أعمدة + RLS + GRANT + Trigger لضمان باركود واحد افتراضي) | `supabase/migrations/*` |
| 2 | إنشاء Shell الصفحة الكاملة | `src/pages/inventory/ProductEditPage.tsx` (جديد) |
| 3 | مكونات فرعية لكل FastTab (17 مكوّن صغير) | `src/components/inventory/product-tabs/*` |
| 4 | Hooks لجلب/حفظ البيانات المرتبطة (units, barcodes, price tiers, warehouses) | `src/hooks/useProduct*` |
| 5 | إعادة توجيه أزرار "إضافة منتج" و"تعديل" في `InventoryPage.tsx` إلى الصفحة الجديدة **مع إبقاء Dialog القديم للـ Quick Add** كخيار اختياري (كي لا نكسر شيئاً) | `InventoryPage.tsx`, `App.tsx` |
| 6 | ربط تبويب التصنيع بـ `production_formulas` و`production_formula_items` (BOM + Where-used) | `ProductManufacturingTab.tsx` |
| 7 | تحديث `useFormDraft` للصفحة كي لا يفقد المستخدم بياناته | reuse hook |
| 8 | اختبار Type-safety + جولة إدخال كامل + التأكد من عدم كسر شاشات الفواتير التي تعتمد على `products` | tsgo |

---

## 6) ضمانات عدم الكسر

- **لا يُحذف أي عمود** من `products`؛ كل الحقول جديدة (nullable + defaults).
- الـ Dialog القديم يبقى كـ **Quick Add** (بديل سريع)، والصفحة الكاملة هي الافتراضي عند زر ✏️ "تعديل".
- أزرار الشاشة الحالية (باركود، حركات، جديد مشابه، حذف) كلها تُنقل إلى Command Bar.
- استعلامات الفواتير/POS لا تتأثر (نضيف حقولاً فقط).
- عند وجود Multi-UoM: يبقى الحقل القديم `unit` كوحدة أساسية افتراضية، والجدول الجديد اختياري.

---

## 7) الربط المحاسبي مع معادلة الإنتاج

- زر مباشر من تبويب "التصنيع" لإنشاء/عرض معادلة الإنتاج للمنتج.
- عرض ملخص المعادلة الحالية (المكوّنات، التكلفة المعيارية المحسوبة عبر `calculate_formula_standard_cost`).
- عند حفظ منتج بـ `is_manufactured=true` بدون معادلة، تحذير غير حاجب.
- حقول `standard_cost` و`average_cost` (الموجودة أصلاً) تُعرض للقراءة فقط في تبويب الأسعار وتُحدَّث تلقائياً من `post_production_order_journal`.

---

## 8) التسليمات

- Migration واحدة شاملة (Phase 1 DB).
- صفحة `ProductEditPage.tsx` كاملة بجميع الـ 17 FastTab (Phase 2 UI).
- تحديث `InventoryPage.tsx` لإعادة التوجيه.
- تحديث `App.tsx` بالمسارات الجديدة.
- توثيق قصير في `.lovable/plan.md`.

بعد موافقتك، أبدأ بالمرحلة 1 (Migration) ثم المرحلة 2 مباشرة.

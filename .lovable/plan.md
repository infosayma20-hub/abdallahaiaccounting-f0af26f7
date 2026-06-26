## Phase 1 — Sparta Dental Implants: Products, Batches & Inventory

نبني العمود الفقري التشغيلي لشركة "سبارتا لزرعات الأسنان" داخل بيئة سبارتا (`/sparta`) معتمدين على جداول أموالي الحالية (`products`, `warehouses`, `stock_movements`) مع إضافة طبقة **تتبع الدفعات** (Batch/LOT + Expiry) المطلوبة في قطاع الأجهزة الطبية.

### 1. قاعدة البيانات (Migrations جديدة)

جدول جديد `product_batches`:
- `product_id`, `company_id`, `warehouse_id`
- `batch_number` (رقم التشغيلة من المورد)
- `lot_number` (LOT الداخلي)
- `manufacture_date`, `expiry_date`
- `quantity_in`, `quantity_remaining`
- `unit_cost`, `supplier_id`, `purchase_invoice_id`
- `status` (active / expired / recalled / depleted)
- RLS عبر `company_id` + GRANTs

جدول `batch_movements`:
- يربط كل حركة مخزنية بدفعة محددة (FIFO حسب تاريخ الصلاحية)
- `batch_id`, `stock_movement_id`, `quantity`, `direction`

تعديل `products`:
- إضافة `requires_batch_tracking` boolean (يفعّل تلقائياً لمنتجات سبارتا)
- `min_shelf_life_days` (أدنى مدة صلاحية مقبولة عند البيع)

Trigger: `auto_consume_batches_fifo()` — عند أي حركة `out` يستهلك من أقدم دفعة منتهية أولاً.

### 2. وحدات Sparta Shell الجديدة

نضيف 4 صفحات داخل `SpartaShell`:

| الصفحة | المسار | المحتوى |
|---|---|---|
| كتالوج المنتجات | `/sparta/products` | جدول المنتجات + بحث + فلتر فئة (Implants/Abutments/Tools) |
| إدارة الدفعات | `/sparta/batches` | عرض كل LOTs، تنبيه قرب الانتهاء (90/60/30 يوم) |
| المخازن والمستودعات | `/sparta/warehouses` | مستودع رئيسي + مستودعات المناديب |
| حركة المخزون | `/sparta/inventory` | IN/OUT/Transfer بين المستودعات |

### 3. لوحة تنبيهات الصلاحية (Dashboard Widget)

إضافة Widget في `SpartaDashboard`:
- منتجات تنتهي خلال 90 يوم (قيمتها المالية)
- منتجات منتهية الصلاحية فعلياً (يجب إتلافها)
- منتجات تحت الحد الأدنى للمخزون

### 4. PWA المناديب (`/sparta/m`)

شاشة بسيطة للمندوب:
- مخزون شاحنته (warehouse مرتبط بـ employee_id)
- مسح Barcode/QR لإخراج صنف
- يعرض الدفعة المختارة آلياً (FIFO) قبل التأكيد

### 5. الأمان

- كل الجداول الجديدة بـ RLS مرتبط بـ `holding_members` (تم في Tenant Guard)
- لا أحد يصل لجداول سبارتا إلا أعضاء قابضة `0a0655c6-...`
- منع البيع من دفعة منتهية الصلاحية على مستوى DB Trigger (ليس UI فقط)

### الترتيب التنفيذي

1. Migration جداول `product_batches` + `batch_movements` + trigger FIFO
2. صفحات Products + Batches (CRUD)
3. صفحة Warehouses + Inventory Movements
4. Dashboard Widget للتنبيهات
5. PWA Mobile للمناديب
6. QA + اختبار اختراق RLS

### خارج النطاق (Phase 2)

- المبيعات والفواتير لسبارتا
- CRM للأطباء والعيادات
- HR
- المشاريع والعمولات

موافق نبدأ بـ Migration قاعدة البيانات أولاً؟

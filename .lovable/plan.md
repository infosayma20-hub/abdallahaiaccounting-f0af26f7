# Phase 1 — Sparta Dental: العمود الفقري

## 🎯 الهدف
بناء أول workspace تشغيلي لـ **سبارتا لزرعات الأسنان** يشمل: Products & Inventory + Sales + Customers، مع PWA منفصل للموبايل بثيم سبارتا (#8B1E3F)، عملة موحّدة ILS، وكل البيانات معزولة عن أموالي عبر `company_id`.

## 🧱 استراتيجية إعادة الاستخدام (توفير الكلفة)
| نستعير من أموالي | نخصص لسبارتا |
|---|---|
| جداول `products`, `invoices`, `invoice_items`, `contacts`, `stock_movements`, `warehouses`, `accounts` | `company_id` = سبارتا دنتال + RLS تلقائي |
| منطق الفاتورة (ترقيم، VAT، PDF Arabic Engine) | قالب PDF بشعار وألوان سبارتا |
| `useCompanyContext`, `useAuth`, RLS Policies | لا تغيير — معزول تلقائياً |
| مكونات shadcn (Dialog, Table, Form) | Tokens جديدة في `sparta-theme.css` |

**0 جداول جديدة في Phase 1** — كله يعمل على البنية الحالية + فلتر `company_id`.

## 🎨 ثيم سبارتا (موحّد للويب + الموبايل)
- Primary: `#8B1E3F` (عنابي) — Secondary: `#D4A574` (ذهبي)
- Background: `#FAFAF7` فاتح / `#1A1A1A` داكن
- خط: `Cairo` للعربي، `Inter` للإنجليزي
- شعار سبارتا في Header + Login + PDFs
- ملف واحد: `src/themes/sparta.css` يُحمَّل ديناميكياً عند `company_id = sparta-dental`

## 📱 PWA منفصل للموبايل
- مسار: `/sparta/m/*` (مثل `/employee/*` بأموالي)
- صفحات موبايل:
  - **Catalog Browse** — تصفح المنتجات بالباركود/البحث
  - **Quick Sale** — فاتورة سريعة من الموبايل لمندوب الفرع
  - **Stock Check** — استعلام رصيد لحظي
  - **Customer Lookup** — كشف حساب الزبون
- Manifest منفصل: `public/sparta-manifest.webmanifest`
- Icons بشعار سبارتا
- يعمل عبر `sparta-trade.com/m` (يكتشف الدومين تلقائياً)

## 📦 الوحدات (Web Desktop)

### 1. Products & Inventory
- **شجرة فئات سبارتا الخاصة**: Dental Implants / Prosthetics / Surgical Kits / Biomaterials / Instruments / Consumables
- حقول إضافية (نضيفها لـ `products` كـ JSON في حقل `meta` الموجود):
  - `brand`, `lot_number`, `expiry_date`, `min_stock`, `reorder_point`
- **Batch/LOT Tracking** — تتبع تواريخ الصلاحية مع تنبيه قبل 90 يوم
- **Multi-Warehouse** — Main / Branch / Reserved (موجود أصلاً)
- شاشة "تنبيهات قرب انتهاء الصلاحية"

### 2. Sales
- فاتورة مبيعات قياسية (نفس محرك أموالي)
- **Price Lists** بسيطة (سعر طبيب / سعر عيادة / سعر جملة) عبر `pos_customers.price_list_code`
- **Quotations → Sales Order → Invoice** (الـ workflow الجاهز)
- PDF بشعار سبارتا

### 3. Customers (CRM خفيف)
- عيادات + أطباء (نوع `contact_type = "عميل"`)
- حقول إضافية: `clinic_name`, `doctor_specialty`, `license_number` في `meta`
- كشف حساب + Aging Report (جاهز)
- ملاحظات + تاريخ زيارات المندوب

## 🗄️ تغييرات قاعدة البيانات (Minimal)
لا جداول جديدة. فقط:
1. إنشاء `company_id` = `sparta-dental` (موجودة من قبل)
2. إضافة 6 حسابات في شجرة الحسابات الخاصة بسبارتا (1110 صندوق، 1130 ذمم مدينة، 4110 مبيعات…)
3. Seed: 6 فئات منتجات سبارتا
4. Seed: 4 مستودعات (Main / Reserved / Damaged / In-Transit)

## 🛣️ المسارات الجديدة
```text
/sparta              → Dashboard Web
/sparta/products     → كتالوج المنتجات
/sparta/inventory    → المخزون والـ LOTs
/sparta/sales        → الفواتير والعروض
/sparta/customers    → العيادات والأطباء
/sparta/m            → PWA Mobile Home
/sparta/m/sale       → فاتورة سريعة موبايل
/sparta/m/stock      → استعلام مخزون
```

## ✅ معايير القبول
- مستخدم سبارتا لا يشوف أي بيانات أموالي (RLS مفعّل)
- ثيم سبارتا يظهر فوراً عند الدخول من `sparta-trade.com`
- إنشاء فاتورة كاملة من Web + Mobile وحفظها بـ ILS
- PDF الفاتورة بشعار وألوان سبارتا
- PWA قابل للتثبيت على iPhone + Android من `sparta-trade.com/m`

## ⏭️ خارج نطاق Phase 1 (لاحقاً)
- Sales Reps PWA الكامل (Phase 2)
- Academy Module (Phase 3)
- HR + Projects + Payroll (Phase 4)
- Cohort Management — يدخل في Phase 3 مع الأكاديمية

## 🚀 خطوات التنفيذ بالترتيب
1. إنشاء ثيم سبارتا (`sparta.css` + ThemeProvider switch)
2. Seed بيانات (حسابات + فئات + مستودعات لسبارتا)
3. صفحة `/sparta` Dashboard
4. صفحات Products/Inventory/Sales/Customers (نسخ-تكييف من أموالي)
5. Manifest + Icons + Routes للـ PWA
6. صفحات Mobile (4 شاشات)
7. اختبار end-to-end على دومين سبارتا

**ملاحظة:** Cohort Management ذكرته في طلبك بس هو جزء من **Academy** (Phase 3). هل تأكد إنه يبقى مؤجل، أم تبيه يدخل Phase 1 بصيغة مبسطة (دفعات الطلاب فقط بدون جدولة محاضرات)؟

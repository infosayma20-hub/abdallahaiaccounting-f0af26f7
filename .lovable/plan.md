# Phase 6 — POS سبارتا للمندوبين المتجولين (Van Sales)

نظام نقطة بيع متنقل للمندوبين، يعمل على الجوال/التابلت، مربوط مع المخزون والمحاسبة في سبارتا.

## النطاق

### 1. جلسة المندوب (Van Day)
- `sparta_van_days`: فتح/إغلاق يوم عمل لكل مندوب (open/closed)
- رصيد افتتاحي (نقد + مخزون من `sparta_warehouses`)
- إغلاق يومي مع مطابقة نقدية + مخزون

### 2. مستودع متحرك لكل مندوب
- إضافة `is_van` و `sales_rep_id` على `sparta_warehouses`
- سندات تحميل/إرجاع/تسوية عبر `sparta_stock_transfers`
- ربط FIFO الموجود لخصم الدفعات تلقائياً

### 3. فاتورة سريعة من الميدان
- RPC `sparta_van_create_sale` ذرّية:
  1. تنشئ فاتورة + ترحلها مباشرة
  2. تستهلك دفعات FIFO من مستودع المندوب
  3. تسجل دفعة (نقد/آجل/شيك)
  4. تولد قيد محاسبي تلقائي (موجود من Phase 5B)
- إدارة عملاء الميدان + بحث سريع

### 4. تحصيل ديون
- RPC `sparta_van_collect_payment`: تحصيل من عملاء سابقين
- ينعكس فوراً على رصيد العميل + صندوق المندوب

### 5. واجهة موبايل
صفحات جديدة تحت `/sparta/m/van/*`:
- `VanDayHome` — لوحة اليوم (مبيعات/تحصيلات/مخزون)
- `VanQuickSale` — فاتورة سريعة بخطوة واحدة
- `VanCollect` — تحصيل ديون
- `VanStock` — جرد سريع للمستودع المتحرك
- `VanCloseDay` — إغلاق يوم مع مطابقة

### 6. عمولات (مبدئية)
- جدول `sparta_van_commissions` — حساب يدوي مثل van الحالي

## القرارات التقنية
- نفس ثيم سبارتا (`sparta-theme.css`) + RTL
- نفس نمط الـ RLS (`is_sparta_holding_member` / `_admin`)
- ربط Auto-posting موجود — الفواتير الجديدة ترحل تلقائياً
- بدون طباعة ESC/POS الآن (PWA share/PDF فقط) — يمكن إضافة Print Bridge لاحقاً
- بدون offline mode في هذه المرحلة (Phase 7)

## ملفات رئيسية ستُنشأ
- Migration واحدة: جداول + RPCs + RLS + Triggers
- `src/pages/sparta/van/*` (5 صفحات)
- تحديث `SpartaShell.tsx` + `App.tsx` للمسارات

## خارج النطاق (لاحقاً)
- GPS tracking → Phase 7
- Offline / PWA كامل → Phase 7
- WhatsApp/SMS → Phase 8
- طباعة حرارية → عند الحاجة

أبدأ التنفيذ؟

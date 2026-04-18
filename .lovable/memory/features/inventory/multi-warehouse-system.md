---
name: Multi-Warehouse System
description: Multi-warehouse foundation + stock transfer vouchers (load van / return van / transfer between branches). Tables, RPCs, and UIs at /warehouses and /stock-transfers.
type: feature
---

# نظام المستودعات المتعددة + سندات التحويل

## Phase 1 — البنية التحتية للمستودعات
### الجداول
- `warehouses` (id, code, name, warehouse_type, branch_id, manager_employee_id, sales_rep_id, address, is_default, is_active)
- 4 أنواع: `main` (رئيسي), `branch` (فرع), `van` (سيارة بائع متجول), `virtual` (وهمي)

### الأعمدة المضافة لجداول قائمة
- `stock_movements.warehouse_id`
- `pos_orders.warehouse_id`
- `invoices.warehouse_id`
- `sales_representatives.default_warehouse_id`

### الدوال
- `ensure_default_warehouse(p_user_id)` → تنشئ مستودع رئيسي افتراضي تلقائياً عند أول استخدام

### العرض المحسوب
- `product_warehouse_stock` view: يحسب رصيد كل منتج في كل مستودع من `stock_movements` (وارد=+, صادر=-, تعديل يدوي=±)

### الواجهة
- `/warehouses` — صفحة إدارة CRUD مع بطاقات ملونة حسب النوع

## Phase 2 — سندات تحويل المخزون
### الجداول
- `stock_transfers` (id, transfer_number, transfer_date, transfer_type, from/to_warehouse_id, sales_rep_id, status, total_items/quantity/value, notes, confirmed/cancelled metadata)
  - `transfer_type`: `load_van` (تحميل بائع), `return_van` (إرجاع من بائع), `transfer` (بين مستودعات), `adjustment` (تسوية)
  - `status`: `draft` (مسودة), `confirmed` (مؤكد), `cancelled` (ملغى)
  - الترقيم التلقائي: `TR-YYYY-####`
- `stock_transfer_items` (transfer_id, product_id, product_name, unit, quantity, unit_cost, line_total)

### الدوال (RPC)
- `confirm_stock_transfer(p_transfer_id)` → عند التأكيد: ينشئ حركتين لكل بند (صادر من المصدر + وارد للوجهة) في `stock_movements`
- `cancel_stock_transfer(p_transfer_id, p_reason)` → عند إلغاء سند مؤكد: ينشئ حركات عكسية (وارد للمصدر + صادر من الوجهة)

### المنطق المحاسبي
- **لا يوجد قيد محاسبي**: التحويل بين مستودعات لنفس المالك لا يؤثر على الحسابات (نفس حساب المخزون 1140)
- التأثير الوحيد على رصيد كل مستودع عبر `product_warehouse_stock`

### الواجهة
- `/stock-transfers` — قائمة + إنشاء سند مع:
  - 4 أنواع كأزرار بصرية
  - اقتراح تلقائي للمستودعات حسب نوع السند والبائع المختار
  - بحث المنتجات وإضافتها للبنود
  - حفظ كمسودة / حفظ وتأكيد مباشر
  - زر إلغاء السندات المؤكدة (مع حركات عكسية)
- مضافة لقائمة "المخزون → المستودعات والبائعين"

## الخطوات التالية
- Phase 3: van_sales_days (دورة يوم البائع — بداية/نهاية اليوم + المطابقة)
- Phase 4: /van mobile UI (واجهة موبايل مبسطة للبائع المتجول)

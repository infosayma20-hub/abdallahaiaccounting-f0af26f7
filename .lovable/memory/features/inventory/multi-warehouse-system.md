---
name: Multi-Warehouse System
description: Multi-warehouse foundation for tracking inventory across main, branches, and van-sales locations. Tables, view, RPC, and UI route /warehouses.
type: feature
---

# نظام المستودعات المتعددة (Phase 1)

## الجداول
- `warehouses` (id, code, name, warehouse_type, branch_id, manager_employee_id, sales_rep_id, address, is_default, is_active)
- 4 أنواع: `main` (رئيسي), `branch` (فرع), `van` (سيارة بائع متجول), `virtual` (وهمي)

## الأعمدة المضافة لجداول قائمة
- `stock_movements.warehouse_id`
- `pos_orders.warehouse_id`
- `invoices.warehouse_id`
- `sales_representatives.default_warehouse_id`

## الدوال
- `ensure_default_warehouse(p_user_id)` → تنشئ مستودع رئيسي افتراضي تلقائياً عند أول استخدام

## العرض المحسوب
- `product_warehouse_stock` view: يحسب رصيد كل منتج في كل مستودع من `stock_movements` (وارد=+, صادر=-, تعديل يدوي=±)

## الواجهة
- `/warehouses` — صفحة إدارة CRUD مع بطاقات ملونة حسب النوع
- مضافة لقائمة "المخزون → المستودعات والبائعين"

## الخطوات التالية المعتمدة على هذه المرحلة
- Phase 2: stock_transfers (تحويل بين مستودعات)
- Phase 3: van_sales_days (دورة يوم البائع)
- Phase 4: /van mobile UI

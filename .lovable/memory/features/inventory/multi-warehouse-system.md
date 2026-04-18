---
name: Multi-Warehouse System
description: Multi-warehouse foundation + stock transfer vouchers + van day cycle (open/close with cash & stock reconciliation). Tables, RPCs, and UIs at /warehouses, /stock-transfers, /van-days.
type: feature
---

# نظام المستودعات + التحويلات + دورة يوم البائع

## Phase 1 — البنية التحتية للمستودعات
### الجداول
- `warehouses` (id, code, name, warehouse_type, branch_id, manager_employee_id, sales_rep_id, address, is_default, is_active)
- 4 أنواع: `main`, `branch`, `van`, `virtual`

### الأعمدة المضافة
- `stock_movements.warehouse_id`, `pos_orders.warehouse_id`, `invoices.warehouse_id`, `sales_representatives.default_warehouse_id`

### الدوال والعروض
- `ensure_default_warehouse(p_user_id)` — مستودع رئيسي افتراضي تلقائي
- `product_warehouse_stock` view — رصيد كل منتج في كل مستودع

### الواجهة: `/warehouses`

## Phase 2 — سندات تحويل المخزون
### الجداول
- `stock_transfers` + `stock_transfer_items`
- `transfer_type`: `load_van`, `return_van`, `transfer`, `adjustment`
- `status`: `draft`, `confirmed`, `cancelled`
- ترقيم تلقائي `TR-YYYY-####`

### RPCs
- `confirm_stock_transfer(p_transfer_id)` → حركتان (صادر + وارد) في `stock_movements`
- `cancel_stock_transfer(p_transfer_id, p_reason)` → حركات عكسية

### الواجهة: `/stock-transfers`

## Phase 3 — دورة يوم البائع المتجول (Van Day Cycle)
### الجدول
- `van_sales_days` (day_number `VD-YYYY-####`, sales_rep_id, warehouse_id, status, opened_at/by, opening_cash/currency, closed_at/by, actual_cash_collected, expected_cash, cash_variance, total_sales, total_collections, total_invoices, opening_notes, closing_notes, load_transfer_id)
- قيد فريد: لا يمكن وجود يومين مفتوحين لنفس البائع (`UNIQUE WHERE status='open'`)

### RPCs
- `open_van_day(p_sales_rep_id, p_opening_cash, p_opening_currency, p_notes, p_load_transfer_id)`
  - يتحقق من عدم وجود يوم مفتوح، يجلب مستودع البائع الافتراضي تلقائياً
- `close_van_day(p_day_id, p_actual_cash, p_closing_notes)` → يحسب:
  - `total_sales` من `invoices` المرتبطة بمستودع البائع منذ فتح اليوم
  - `total_collections` من `transactions` (transaction_type='receipt') خلال الفترة
  - `expected_cash = opening_cash + total_collections`
  - `cash_variance = actual_cash - expected_cash`
  - يُرجع JSONB بالملخص

### الواجهة: `/van-days`
- KPIs: أيام مفتوحة، إجمالي الأيام، مبيعات الأيام المفتوحة
- فلترة بالحالة (الكل/مفتوح/مغلق/ملغى)
- بطاقة يوم: رقم/حالة/بائع/مستودع/أوقات/نقدية ابتدائية، وعند الإغلاق: مبيعات/تحصيلات/متوقع/فعلي/فرق ملوّن
- زر "فتح يوم جديد" → يختار البائع + نقدية ابتدائية + عملة + ملاحظة
- زر "إغلاق" على الأيام المفتوحة → نموذج مطابقة بالنقدية الفعلية + ملاحظات الإغلاق
- تنبيه toast بعد الإغلاق: "مطابق" / "فائض" / "عجز"

## الخطوات التالية
- Phase 4: `/van` mobile UI (واجهة موبايل مبسطة للبائع: بيع سريع، تحصيل، جرد، موقعي)
- Phase 5: عمولات تلقائية على البيع/التحصيل (currently manual per user choice)

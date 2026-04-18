---
name: Multi-Warehouse Van Sales System
description: Phased system for traveling salesmen — separate warehouses, transfer vouchers, day cycle, mobile UI, and manual commissions
type: feature
---

# نظام البائع المتجول (Van Sales System)

## المراحل المُنجزة

### المرحلة 1: مستودع لكل بائع
- جدول `warehouses` بحقل `sales_rep_id` (مستودع متحرك per rep).
- ربط `default_warehouse_id` في `sales_representatives`.

### المرحلة 2: سندات تحويل المخزون
- جدولا `stock_transfers` و `stock_transfer_items`.
- RPCs: `confirm_stock_transfer`, `cancel_stock_transfer`.
- صفحة `/stock-transfers` بـ 4 أنواع (تحميل، إرجاع، بين فروع، تسوية).

### المرحلة 3: دورة يوم البائع
- جدول `van_sales_days` (open/closed/cancelled).
- RPCs: `open_van_day`, `close_van_day` (مطابقة نقدية تلقائية).
- صفحة `/van-days`.

### المرحلة 4: واجهة /van Mobile-first
- صفحة `/van` بطاقة يومية + 4 أزرار (بيع/تحصيل/جرد/GPS) + PWA-friendly.

### المرحلة 5: العمولات اليدوية
- صفحة `/van-commissions`.
- تحسب من `invoices.warehouse_id == sales_rep.default_warehouse_id` (مبيعات) و `transactions.transaction_type='سند قبض'` خلال الفترة (تحصيلات).
- تستخدم النسب الافتراضية من `sales_representatives.sales_commission_rate / collection_commission_rate` ويمكن تعديلها لكل احتساب.
- تنشئ سجلين في `commissions` (مبيعات + تحصيل) عند التأكيد، مع زر تعليم كمدفوعة.

## القرارات
- **نموذج مخزون**: مستودع مستقل لكل بائع (الأدق محاسبياً).
- **العمولات**: يدوية فقط (لا تريغرات تلقائية) — البائع يحتسب لكل فترة ويحفظ.

---
name: Multi-Warehouse + Van Sales System
description: Multi-warehouse + stock transfers + van day cycle + mobile van mode UI. Routes: /warehouses, /stock-transfers, /van-days, /van.
type: feature
---

# نظام المستودعات + التحويلات + دورة يوم البائع + وضع الموبايل

## Phase 1 — البنية التحتية للمستودعات
- جدول `warehouses` (4 أنواع: main/branch/van/virtual)
- أعمدة `warehouse_id` في stock_movements/pos_orders/invoices
- `sales_representatives.default_warehouse_id`
- view: `product_warehouse_stock`
- RPC: `ensure_default_warehouse`
- واجهة: `/warehouses`

## Phase 2 — سندات تحويل المخزون
- `stock_transfers` + `stock_transfer_items` (TR-YYYY-####)
- أنواع: load_van/return_van/transfer/adjustment
- RPCs: `confirm_stock_transfer` / `cancel_stock_transfer` (مع حركات عكسية)
- واجهة: `/stock-transfers`

## Phase 3 — دورة يوم البائع
- جدول `van_sales_days` (VD-YYYY-####) مع UNIQUE WHERE status='open' لمنع يومين متزامنين
- RPCs: `open_van_day`, `close_van_day` (مطابقة تلقائية: opening_cash + collections vs actual)
- واجهة: `/van-days` (KPIs + بطاقات + إغلاق ومطابقة)

## Phase 4 — وضع الموبايل المبسط `/van` (Van Mode UI)
### الهدف
واجهة Mobile-first مُحسَّنة للـ iPhone للبائع أثناء الحركة، بأقل عدد نقرات.

### المكونات
- **Header**: شعار المستودع + اسم البائع + Badge "الوقت المنقضي" منذ فتح اليوم
- **حالة فارغة**: إذا لا يوجد يوم مفتوح → Call-to-action كبير لـ `/van-days`
- **بطاقة اليوم**: رقم اليوم + المستودع + 4 إحصائيات حية (فواتير/مبيعات/تحصيلات/أصناف بالسيارة)
- **4 أزرار كبيرة (gradient)**:
  1. بيع سريع → `/pos`
  2. تحصيل → `/finance/receipts/new`
  3. جرد السيارة → `/stock-transfers?warehouse=...`
  4. موقعي → يستخدم `navigator.geolocation` لتسجيل GPS مع toast تأكيد
- **روابط ثانوية**: فواتير اليوم / إضافة عميل سريع / سجل أيام العمل
- **زر إغلاق اليوم**: destructive كبير يوجّه لـ `/van-days` لإتمام المطابقة

### قرارات تقنية
- `min-h-[100dvh]` للـ iPhone notch/safe-area
- `active:scale-95` للأزرار الكبيرة (haptic-like feel)
- استعلامات Supabase مكسّرة (لا Promise.all) لتفادي TS2589 deep type
- لا يستخدم Capacitor — يعمل كـ PWA على iPhone (Safari → Add to Home Screen)

## الخطوات التالية المقترحة
- Phase 5: عمولات تلقائية (currently manual)
- Phase 6: تتبع GPS مستمر للفاتورة (حفظ lat/lng في invoices.metadata)
- Phase 7: واجهة "بيع سريع جداً" داخل /van بدلاً من فتح /pos الكامل

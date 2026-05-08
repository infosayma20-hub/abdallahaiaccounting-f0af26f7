# Amwali AI Testing System

نظام QA رسمي لـ Amwali ERP — مش مجرد "اختبارات UI"، بل تحقق من **الأثر المحاسبي**
لكل عملية (Trial Balance, Inventory, AR/AP, P&L).

## الهيكل

```
/qa
  /scenarios       # ملفات Markdown — السيناريوهات الذهبية
    /accounting    # دورات محاسبية (بيع/شراء/سندات/شيكات)
    /pos           # نقطة البيع
    /hr            # حضور ورواتب
    /van-sales     # مندوبي البيع المتنقل
  /test-data       # بيانات شركة Amwali QA الثابتة (Seed)
  /results         # تقارير تنفيذ AI Agent (JSON/MD)
```

## مبدأ ذهبي

> لا تختبر "الزر اشتغل". اختبر "Debit = Credit + الأثر المحاسبي صحيح".

## الترتيب التنفيذي

1. **المرحلة 1** — Seed لشركة `Amwali QA` (فروع/مستخدمين/عملاء/موردين/أصناف/حسابات).
2. **المرحلة 2** — كتابة الـ 10 Golden Scenarios.
3. **المرحلة 3** — Reconciliation Engine (فحص Drift بين الأرصدة).
4. **المرحلة 4** — تشغيل AI Agent (Playwright + Claude) يقرأ السيناريو وينفذه.

## 10 Golden Scenarios (الأولوية)

| # | السيناريو | الملف |
|---|-----------|------|
| 1 | Cash Sale | `scenarios/accounting/cash-sale.md` ✅ |
| 2 | Credit Sale | `scenarios/accounting/credit-sale.md` |
| 3 | Sales Return | `scenarios/accounting/sales-return.md` |
| 4 | Purchase Invoice | `scenarios/accounting/purchase-invoice.md` |
| 5 | Payment Voucher | `scenarios/accounting/payment-voucher.md` |
| 6 | Receipt Voucher | `scenarios/accounting/receipt-voucher.md` |
| 7 | Inventory Adjustment | `scenarios/accounting/inventory-adjustment.md` |
| 8 | POS Sale | `scenarios/pos/pos-sale.md` |
| 9 | QR Attendance | `scenarios/hr/qr-attendance.md` |
| 10 | Payroll Run | `scenarios/hr/payroll-run.md` |
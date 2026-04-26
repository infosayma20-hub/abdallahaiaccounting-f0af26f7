---
name: Accounting Hybrid Layout Pattern
description: Heavy financial entry screens (journals, invoices, vouchers, notes, cheques, transfers, deliveries, imports) use min-width 1280px + horizontal scroll instead of shrinking fields. Mirrors Hesabate/Odoo/QuickBooks accountant UX.
type: design
---

# Accounting Hybrid Layout — Fixed Width + Horizontal Scroll

## القاعدة
شاشات الإدخال المالي الثقيل **لا تُصغّر** الحقول عند تصغير الشاشة — بل تعرض **scroll أفقي**.
السبب: دقة قراءة الأرقام أهم من المرونة البصرية على الموبايل.

## المكوّن
- `src/components/layout/AccountingShell.tsx` — wrapper جاهز
- `src/index.css` — كلاسات `.accounting-fixed-scroll` و `.accounting-fixed-inner`
- الحد الأدنى الافتراضي: **1280px** (Hesabate-like)

## الاستخدام
```tsx
import AccountingShell from "@/components/layout/AccountingShell";

return (
  <AccountingShell>
    <div className="..." dir="rtl">{/* محتوى الصفحة */}</div>
  </AccountingShell>
);
```

## مُطبَّق حالياً على
- `JournalNewPage` (سند قيد جديد)
- `InvoiceCreatePage` (فاتورة بيع)
- `FinanceVoucherPage` (سندات قبض/صرف — قائمة + إنشاء عبر VoucherFormPage)
- `CreditDebitNotesPage` (إشعارات دائنة/مدينة)
- `ChequesPage` (الشيكات)
- `CashTransferPage` (تحويلات الصناديق)
- `DeliveryNoteCreatePage` (إرساليات المبيعات)
- `ImportWizardPage` (الاستيراد)
- `ProcurementInvoiceCreatePage` (فاتورة مشتريات)

## لا تُطبّق على
- ❌ Dashboard / KPI screens → Responsive
- ❌ التقارير الرسومية → Responsive
- ❌ POS → Mobile-first
- ❌ Employee Portal / بوابات الموبايل → Mobile-first
- ❌ شاشات الإعدادات البسيطة → Responsive

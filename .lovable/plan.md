# Sparta ERP — Phase 5: المحاسبة المالية الكاملة

البنية: GL مزدوج القيد + AP/AR aging + بنوك وتسويات + ميزانية تقديرية، مفصول 100% عن نظام أموالي (sparta_* prefix) ومحمي بـ holding RLS.

## القطع الأساسية

### 1) شجرة الحسابات (Chart of Accounts)
- `sparta_accounts`: code, name_ar/en, type (asset/liability/equity/revenue/expense), parent_id, currency, is_postable, opening_balance.
- Seed افتراضي محاسبي قياسي (5 مجموعات × فرعيات: نقدية، بنوك، ذمم مدينة/دائنة، إيرادات، مصاريف...).
- منع الترحيل على حسابات أب (نفس قاعدة أموالي).

### 2) دفتر الأستاذ (General Ledger)
- `sparta_journal_entries` (رأس: entry_no, date, ref_type, ref_id, status[draft/posted/void], total_debit/credit, description).
- `sparta_journal_lines` (account_id, debit, credit, currency, fx_rate, project_id?, cost_center?, contact_id?).
- Triggers: يجبر debit=credit، يقفل التعديل بعد posted (Credit Note فقط).
- RPC `sparta_post_journal(entry_id)` ذرّي + `sparta_reverse_journal(entry_id, reason)`.

### 3) ربط تلقائي مع الوحدات السابقة
- فاتورة مبيعات Sparta → JE (مدين AR / دائن إيراد + ضريبة).
- دفع عميل → JE (مدين بنك/صندوق / دائن AR).
- فاتورة شراء (موجودة في Phase 2 جزئياً) → JE.
- راتب Phase 4 → JE (مدين مصاريف رواتب / دائن ذمم موظفين + نقدية).
- مصاريف مشروع → JE مع cost_center=project.

### 4) AP/AR Aging
- View `sparta_ar_aging` و `sparta_ap_aging`: تجميع بفترات (0-30, 31-60, 61-90, 90+).
- صفحة `SpartaReceivablesPage` و `SpartaPayablesPage` مع كشف حساب لكل عميل/مورد.

### 5) البنوك والصناديق
- `sparta_cash_accounts` (cash/bank/credit_card)، مع رصيد محسوب من GL.
- `sparta_bank_transactions` (deposit/withdrawal/transfer/fee).
- `sparta_bank_reconciliations`: مطابقة كشف البنك مع GL، توسيم matched/unmatched، حفظ snapshot.

### 6) الميزانية التقديرية (Budgeting)
- `sparta_budgets` (year, name, status) + `sparta_budget_lines` (account_id, month 1-12, amount).
- تقرير Budget vs Actual: مقارنة شهرية مع GL، نسبة الانحراف.

### 7) التقارير المالية
- ميزان المراجعة (Trial Balance) بأي تاريخ.
- قائمة الدخل (P&L) شهري/ربعي/سنوي.
- الميزانية العمومية (Balance Sheet).
- التدفق النقدي (Cash Flow) — مبسّط Direct Method.
- دفتر الأستاذ التفصيلي لأي حساب.
- تصدير PDF + Excel.

### 8) الفترات المحاسبية
- `sparta_fiscal_periods` (شهر/سنة، open/closed) — trigger يمنع الترحيل على فترة مغلقة.
- صلاحية إغلاق/فتح للمدير المالي فقط.

## الواجهات

```
/sparta/accounting
  ├── /chart            شجرة حسابات
  ├── /journal          قيود يومية (list + new + view)
  ├── /ledger/:id       دفتر أستاذ حساب
  ├── /receivables      ذمم مدينة + aging
  ├── /payables         ذمم دائنة + aging
  ├── /banks            صناديق وبنوك + تسويات
  ├── /budget           ميزانية تقديرية
  ├── /reports          TB / P&L / BS / CF
  └── /periods          فترات محاسبية
```
- Sidebar `SpartaShell` يضيف قسم "المحاسبة" بأيقونة.
- نفس Sparta theme (RTL + ألوان الشركة).

## ترتيب التنفيذ
1. Migration: الجداول + RLS + GRANTs + seed COA + triggers.
2. RPCs: `sparta_post_journal`، `sparta_reverse_journal`، `sparta_recalc_account_balance`، `sparta_close_period`.
3. Hooks تلقائية: ربط sparta_invoices / sparta_payments / sparta_payroll_runs / sparta_project_expenses بـ JE تلقائي.
4. Views: aging + trial_balance + pnl + balance_sheet.
5. صفحات React (8 صفحات) + components مشتركة (AccountPicker, JournalLineEditor, FxConverter).
6. تقارير PDF (jspdf) + Excel (xlsx) — قوالب RTL.
7. QA: قيد متوازن، منع ترحيل على أب، قفل فترات، aging صحيح، تسوية بنك، Budget vs Actual.

## تنبيهات
- متعدد العملات: كل JE يحفظ amount بعملة الحساب + base ILS مع fx_rate.
- لا حذف فيزيائي للقيود المُرحَّلة — Reverse Entry فقط (IFRS).
- إذا فيه أكثر من شركة تحت Sparta Holding، RLS يفلتر بـ `holding_id` + `company_id`.

ملاحظة: هذا المخطط كبير. إذا تريد، أنفّذه على 3 دفعات صغيرة بدل ضربة واحدة:
- **5A**: COA + Journals + Posting + ربط الفواتير/المدفوعات.
- **5B**: AP/AR Aging + بنوك وتسويات.
- **5C**: ميزانية + تقارير مالية + إغلاق فترات.

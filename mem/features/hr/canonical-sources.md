---
name: HR Canonical Sources (Single Source of Truth)
description: المصادر الرسمية لبيانات الموارد البشرية — جدول واحد لكل كيان، ومنع القراءة من الجداول المُهملة
type: feature
---

## المصادر الرسمية الوحيدة (لا تُكسر)

| الكيان | المصدر الوحيد | حالات الـ status |
|---|---|---|
| **الإجازات** | `employee_leaves` | `معلقة` / `موافقة` (أو `معتمدة`) / `مرفوضة` |
| **الحضور المُجمّع** | `attendance_days` | يُكتب بواسطة جهاز K40 + PWA |
| **بصمات خام** | `attendance_events` | يكتبها `zkteco-webhook` فقط |
| **طلبات الموظف العامة** | `employee_forms` | inbox موحّد لطلبات السلفة/المغادرة/الخدمات |
| **طلبات تصحيح البصمة** | `correction_requests` | منفصلة عن `employee_forms` |
| **الرواتب المحسوبة** | `employee_payroll` | شهري، 43 عمود تفصيلي |
| **مدخلات الراتب** | `monthly_payroll_inputs` | بيانات يدوية شهرية |
| **إعدادات الرواتب** | `payroll_settings` | لكل شركة |
| **السلف** | `employee_advances` + `employee_advance_installments` | |
| **القروض** | `employee_loans` + `loan_installments` | |
| **كشف حساب الموظف** | `employee_financial_movements` | unified ledger |

## ⛔ جداول مُجمّدة (DO NOT READ / DO NOT WRITE)

- **`leave_requests`** — استُبدل بـ `employee_leaves` في إبريل 2026.
  - السبب: كان يخلق "Dashboard كاذب" — الكتابة تتم في `employee_leaves` لكن `useEmployee360` و `useHrCommandCenter` كانا يقرآن من `leave_requests` الفارغ.
  - الحل المطبّق: تحويل القراءات الـ 2، تحديث `HrRequestsPanel` للكتابة بالحالات العربية الصحيحة (`موافقة`/`مرفوضة`).
  - الجدول لم يُحذف من DB — مُجمّد فقط لحماية أي history. الأرشفة الفعلية بعد شهرين من المراقبة.

## قاعدة لكل تطوير جديد في HR

> قبل قراءة أي جدول HR، راجع `src/hooks/hr/hrCanonicalSources.ts`.
> ممنوع إنشاء `.from("leave_requests")` جديدة. استخدم `employee_leaves` فقط.
> ممنوع كتابة حالة إنجليزية في `employee_leaves` — استخدم العربي للتوافق مع `LeavesPage`.

## الجداول التي يُمنع لمسها (Production-critical writers)

- `attendance_events` ← يكتبها `zkteco-webhook` (جهاز K40 الفعلي)
- `attendance_days` ← يكتبها webhook + `EmployeeApp` (PWA الموظفين)
- `employee_payroll` ← يكتبها `auto_journal_payroll` RPC + قيود محاسبية حقيقية

أي تغيير schema على هذه الجداول يكسر البصمة الحية أو القيود التاريخية.

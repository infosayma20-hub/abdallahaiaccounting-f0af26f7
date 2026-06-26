# Phase 4 — سبارتا: HR + إدارة المشاريع

نبني وحدتين مستقلتين تحت نفس الـ Tenant Guard والثيم (`sparta-theme`)، مع RLS كامل ومسارات `/sparta/hr/*` و `/sparta/projects/*`.

---

## 1) الموارد البشرية (HR)

### قاعدة البيانات
- `sparta_employees` — بيانات أساسية: code, full_name, national_id, phone, email, hire_date, job_title, department, branch, employment_type (full/part/contract), basic_salary, currency, status (active/onleave/terminated), bank_info JSON.
- `sparta_departments` — name, manager_id, parent_id.
- `sparta_attendance` — employee_id, date, check_in, check_out, work_hours, late_minutes, overtime, status (present/absent/leave/holiday).
- `sparta_leaves` — employee_id, leave_type (annual/sick/unpaid/emergency), from_date, to_date, days, status (pending/approved/rejected), approved_by.
- `sparta_payroll_runs` — month, year, status (draft/posted), totals.
- `sparta_payroll_lines` — run_id, employee_id, basic, allowances JSON, deductions JSON, overtime, net, currency.
- `sparta_employee_advances` — سلف للموظفين مع جدول تقسيط.

كل الجداول تتضمن `company_id` + RLS عبر `sparta_is_member()` + GRANTs لـ authenticated/service_role.

### الواجهة (تحت `/sparta/hr/*`)
- `SpartaHRDashboard` — KPIs: عدد الموظفين، حضور اليوم، إجازات معلقة، صافي الرواتب الشهر.
- `SpartaEmployeesPage` — جدول + بحث + إضافة/تعديل + كرت موظف (Tabs: بيانات، حضور، إجازات، رواتب، سلف).
- `SpartaAttendancePage` — تسجيل حضور يدوي + جدول شهري + استيراد CSV.
- `SpartaLeavesPage` — طلبات إجازة + موافقة/رفض.
- `SpartaPayrollPage` — تشغيل راتب الشهر + معاينة سطر بسطر + ترحيل.
- موبايل: `/sparta/m/attendance` — تسجيل حضور سريع للمندوب (موجود جزئياً، نضيف check-in/out).

---

## 2) إدارة المشاريع (Projects)

### قاعدة البيانات
- `sparta_projects` — code, name, customer_id (FK→sparta_customers), manager_id, start_date, end_date, status (planned/active/onhold/completed/cancelled), budget, currency, progress_pct.
- `sparta_project_tasks` — project_id, parent_id, title, assigned_to, start_date, due_date, status (todo/doing/review/done), priority, progress_pct, estimated_hours, actual_hours.
- `sparta_project_milestones` — project_id, title, due_date, status, weight.
- `sparta_project_members` — project_id, employee_id, role.
- `sparta_project_timesheets` — task_id, employee_id, date, hours, notes.
- `sparta_project_expenses` — project_id, category, amount, currency, date, attachment_url.
- `sparta_project_invoices_link` — ربط مع `sparta_invoices` (فوترة المشروع).

### الواجهة (تحت `/sparta/projects/*`)
- `SpartaProjectsDashboard` — KPIs: مشاريع نشطة، متأخرة، نسب الإنجاز، الربحية (الإيراد − المصاريف − الرواتب المخصصة).
- `SpartaProjectsListPage` — جدول مشاريع + فلاتر.
- `SpartaProjectDetailPage` — Tabs:
  - **نظرة عامة**: تقدم، ميزانية، فريق.
  - **المهام**: Kanban + List + Gantt مبسط.
  - **الجداول الزمنية**: timesheets للموظفين.
  - **المصاريف**: مع رفع مرفقات.
  - **الفواتير**: ربط/إنشاء فاتورة من المشروع.
- `MyTasksPage` — مهامي عبر كل المشاريع.

### ربط متقاطع
- عند ترحيل راتب شهري لموظف مخصص لمشروع → توزيع تكلفة الراتب على المشاريع حسب ساعات timesheets.
- ربح المشروع = `sparta_invoices` المرتبطة − مجموع `sparta_project_expenses` − حصة الرواتب.
- CRM Opportunity → عند تحويل لمشروع: زر "إنشاء مشروع" يولد `sparta_projects` تلقائياً.

---

## التنفيذ (3 خطوات Migrations + UI)

1. **Migration 1** — جداول HR + RLS + GRANTs + Triggers (updated_at, advance installments).
2. **Migration 2** — جداول Projects + RLS + GRANTs + Trigger لحساب `progress_pct` من المهام.
3. **Migration 3** — RPCs:
   - `sparta_run_payroll(p_month, p_year)` — توليد payroll_lines ذرياً.
   - `sparta_post_payroll(p_run_id)` — ترحيل وقفل.
   - `sparta_project_profitability(p_project_id)` — حساب الربحية.
   - `sparta_convert_opportunity_to_project(p_opp_id)` — تحويل فرصة لمشروع.
4. **UI** — 11 صفحة جديدة + إضافة عناصر للقائمة الجانبية `SpartaShell`.

ملاحظة: نظام HR هنا مبسط (بدون تعقيدات أموالي مثل الورديات الكاملة، attendance locks، إلخ) — كافٍ لاحتياج سبارتا حالياً، ونوسعه لاحقاً عند الطلب.

نبدأ؟

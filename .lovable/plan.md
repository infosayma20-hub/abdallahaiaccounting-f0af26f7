
# جدول دوام الفرع — Branch Scheduler

نظام جداول ورديات يديره مدير الفرع لفرع أو أكثر، بدون أي تأثير على الرواتب أو حسابات تلقائية في الشهر الأول.

## الفكرة الأساسية

- **لا** نربط الموظف بـ`shift_id` ثابت.
- نخزّن **جدول يومي ديناميكي** لكل (موظف × تاريخ × فرع × وردية).
- مدير الفرع يدخل/يعدّل جدوله فقط، ولا يرى رواتب أو حسابات.
- النظام يسجّل الحضور الفعلي ويقارن مع الجدول لاحقاً (للعرض فقط، بدون عقوبات).

---

## 1. قوالب الورديات (Shift Templates)

ثلاث قوالب فقط للبداية، تُحقن لشركة الملكي:

| Code | الاسم | البداية | النهاية | اللون | Cross-day |
|---|---|---|---|---|---|
| `MORNING` | صباحي | 09:00 | 17:00 | أزرق | لا |
| `MID` | ميد | 14:00 | 22:00 | برتقالي | لا |
| `NIGHT` | مسائي | 17:00 | 01:00 | بنفسجي | **نعم** |

تُخزّن في جدول جديد `shift_templates` (لكل شركة).

---

## 2. الجداول الجديدة

### `shift_templates`
- `id`, `company_id`, `code`, `name_ar`, `start_time`, `end_time`, `crosses_midnight`, `color`, `is_active`

### `daily_roster`
- `id`, `company_id`, `branch_id`, `employee_id`, `roster_date` (DATE)
- `shift_template_id` (nullable إذا OFF/إجازة)
- `status` enum: `scheduled` | `off` | `leave` | `coverage`
- `start_time`, `end_time` (overrides اختيارية)
- `notes`, `created_by`, `created_at`, `updated_at`
- **UNIQUE** (employee_id, roster_date) — موظف واحد له صف واحد باليوم

### Triggers / Validations
- `end < start` → يضع `crosses_midnight = true` تلقائياً
- منع تداخل (employee_id, date) — يكفي UNIQUE constraint
- `set_updated_at` trigger

---

## 3. الرول الجديد: `branch_scheduler`

إضافة قيمة جديدة لـ `app_role` enum.

### جدول `branch_manager_assignments`
- `id`, `user_id`, `branch_id`, `company_id`, `created_at`
- يحدد أي مدير مسؤول عن أي فرع/فروع.
- لأنس → صفّان: (الطيرة) + (بلازا مول).

### دالة `is_branch_manager_of(_user, _branch)` — SECURITY DEFINER

---

## 4. RLS Policies

### `daily_roster`
- **SELECT**: admin, hr_manager, accountant_senior (للشركة كلها) — أو branch_scheduler لفروعه فقط — أو الموظف نفسه (صفه فقط).
- **INSERT/UPDATE/DELETE**: admin, hr_manager — أو branch_scheduler لفروعه فقط.

### `shift_templates`
- **SELECT**: كل authenticated في نفس الشركة.
- **INSERT/UPDATE/DELETE**: admin, hr_manager فقط.

### `branch_manager_assignments`
- **SELECT/كل العمليات**: admin, hr_manager فقط.

### حماية صريحة من escalation
- branch_scheduler **لا يحصل** على أي صلاحية ضمنية على: `employees`, `employee_payroll`, `monthly_payroll_inputs`, `hr_payroll_*`, `transactions`, `accounts`. (نتأكد من سياسات الموجودة لا تمنحه شيء.)

---

## 5. الواجهات (Frontend)

### أ) شاشة جديدة `/manager/roster` — لمدير الفرع
- Header: اختيار الفرع (لو يدير أكثر من واحد) + اختيار الأسبوع
- **عرض أسبوعي** (Sat→Fri) جدول: صفوف = موظفي الفرع، أعمدة = أيام الأسبوع
- نقرة على خلية → Dialog: اختيار وردية (MORNING/MID/NIGHT/OFF/LEAVE) + ملاحظات
- زر **نسخ من الأسبوع السابق**
- زر **تعبئة سريعة** (كل الموظفين → MORNING يوم محدد)
- ألوان الورديات بصرية (أزرق/برتقالي/بنفسجي)

### ب) Tab جديد في Employee Portal: **"دوامي"**
- يعرض للموظف جدوله للأسبوع الحالي والقادم فقط (read-only)
- ربط بـ`/employee` portal الموجود

### ج) إعداد قوالب الورديات (Admin/HR فقط)
- شاشة بسيطة في إعدادات HR لإدارة `shift_templates`

### د) Sidebar / Navigation
- إضافة عنصر "جدول الدوام" في نافيجيشن المدير (للرول الجديد فقط)

---

## 6. أنس — الإعداد الأولي

بعد إنشاء الرول والجداول:
1. إعطاء أنس رول `branch_scheduler` في `user_roles`
2. ربطه بفرعَي الطيرة + بلازا مول في `branch_manager_assignments`
3. ربط الموظفين الـ7 المذكورين بفرع بلازا مول (`employees.branch_id`)
4. حقن قوالب الورديات الثلاث

> ملاحظة: ربط أنس فعلياً بحسابه يحتاج `user_id` الخاص فيه — سأطلبه منك بعد التنفيذ.

---

## 7. ما لا نمسّه الآن

- Payroll engine — يبقى manual
- `attendance_days` triggers — تبقى كما هي
- `hr_payroll_policies` — لا تتغيّر
- لا late/OT تلقائي — حتى لو الجدول مدخل، الـ Issue Engine معطّل من المرحلة السابقة
- مقارنة الحضور الفعلي مع الجدول → **عرض فقط**، بدون أي خصم

---

## 8. التنفيذ (المراحل)

### Migration واحد:
1. `shift_templates` + `daily_roster` + `branch_manager_assignments`
2. enum value `branch_scheduler`
3. دالة `is_branch_manager_of`
4. RLS policies
5. Trigger للـ updated_at و cross-midnight
6. Seed: 3 ورديات + رول أنس + ربط فرعين + ربط 7 موظفين ببلازا مول

### Frontend (نفس الجلسة بعد الموافقة على Migration):
- `src/pages/manager/RosterPage.tsx` — العرض الأسبوعي
- `src/pages/manager/ShiftTemplatesPage.tsx` — إدارة القوالب (Admin)
- `src/pages/employee/MyRosterTab.tsx` — تبويب الموظف
- `src/hooks/useDailyRoster.ts` + `useShiftTemplates.ts` + `useBranchAssignments.ts`
- إضافة الراوت + RoleGuard للرول الجديد
- إضافة عنصر النافيجيشن

---

## أسئلة قبل التنفيذ

1. هل أنس يحتاج فعلياً يشوف **حضور الموظفين الفعلي** (check-in/out) بنفس الشاشة، أم فقط جدوله؟
2. هل بدك الموظف يقدر **يطلب تبديل وردية** من البورتال (يحتاج موافقة أنس)، أم لا حالياً؟
3. عند موظف يشتغل بفرعين بنفس الأسبوع — هل ممكن (مثلاً سبت بلازا، أحد طيرة)؟ (افتراضي: نعم).

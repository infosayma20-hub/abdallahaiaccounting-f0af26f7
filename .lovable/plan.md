# تعميم إدارة الفريق لكل الشركات (Generic Workforce Management)

الهدف: إلغاء الربط بدور `branch_scheduler` المخصص للملكي، واستبداله بعلاقة إدارية مرنة بين الموظفين تعمل لأي شركة وأي قطاع، وتُدار يدوياً من شاشة الموظف.

---

## 1) قاعدة البيانات

### إضافة على جدول `employees`
- `manager_employee_id` (uuid, nullable) → الموظف المسؤول عنه (مدير مباشر).
- `can_manage_schedule` (bool, default false) → يستطيع إنشاء/تعديل جدول دوام فريقه.
- `can_manage_attendance` (bool, default false) → يستطيع اعتماد حضور فريقه.
- `can_view_team` (bool, default false) → يستطيع رؤية فريقه فقط.

(لا داعي لجدول علاقات منفصل في المرحلة الأولى — الحقول داخل `employees` كافية وأبسط.)

### دالة مساعدة (Security Definer)
```sql
public.is_employee_manager_of(_manager_employee_id uuid, _target_employee_id uuid) returns boolean
```
تتحقق إذا كان الموظف A مديراً مباشراً للموظف B داخل نفس الشركة.

### تحديث RLS لجدول `daily_roster`
- يُسمح بالـ SELECT/INSERT/UPDATE/DELETE إذا:
  - admin أو hr_manager (كما هو)، **أو**
  - الموظف الحالي (المرتبط بـ `auth.uid()` في `employees.user_id`) عنده `can_manage_schedule = true` **و** الموظف المستهدف `manager_employee_id` يساوي معرّفه.
- إزالة الاعتماد على `branch_manager_assignments` و `branch_scheduler` role من المنطق الجديد (نُبقي الجدول والدور موجودَين للتوافق لكن لا نعتمد عليهما في RLS الجديدة).

### تحديث RLS لـ `attendance_days` / `attendance_events` (للاعتماد فقط)
- إضافة سياسة UPDATE تسمح للمدير المباشر باعتماد حضور موظفي فريقه عندما `can_manage_attendance = true`.

---

## 2) الواجهة الأمامية

### (أ) صفحة الموظف (Employees → Edit)
إضافة قسم جديد: **"إدارة الفريق"**
- Select: **المدير المباشر** (`manager_employee_id`) — قائمة موظفي نفس الشركة.
- 3 Toggles:
  - ☑ يستطيع رؤية فريقه
  - ☑ يستطيع إدارة جدول الدوام
  - ☑ يستطيع اعتماد الحضور

### (ب) إعادة تنظيم قائمة الحضور
ضمن قسم **الحضور** في الـ Sidebar:
- سجل الحضور (موجود)
- **جدول الدوام** ← نقل `/manager/roster` إلى `/attendance/roster` وإظهاره لأي موظف عنده `can_manage_schedule`.
- اعتماد الحضور (لاحقاً)
- الحضور المباشر (لاحقاً)

### (ج) شاشة جدول الدوام (تحسين UX الحالي)
- بدل إدخال أوقات يدوية: قائمة منسدلة (صباحي / ميد / مسائي / OFF / إجازة) → الأوقات تُملأ تلقائياً من `shift_templates`.
- فلترة الموظفين المعروضين: فقط الموظفين الذين `manager_employee_id = currentEmployee.id` (إذا لم يكن admin/hr_manager).
- زر **"نسخ جدول أمس"**.

### (د) Hooks جديدة / تعديل
- `useMyTeam()` → يرجع موظفي فريقي.
- `useCurrentEmployee()` → الموظف المرتبط بـ `auth.uid()` + صلاحياته.
- تعديل `useBranchRoster` → فلترة حسب الفريق بدل `branch_manager_assignments`.

### (هـ) RoleGuard / Navigation
- إظهار رابط "جدول الدوام" لأي موظف عنده `can_manage_schedule = true` بغض النظر عن الـ role.
- إبقاء وصول admin / hr_manager كاملاً.

---

## 3) ربط الملكي يدوياً (بعد التطبيق)
- على شاشة الموظف الخاصة بـ **أنس**: تفعيل التوغلز الثلاثة.
- على كل موظف من السبعة في بلازا مول + موظفي الطيرة: ضبط `manager_employee_id = أنس`.
- (يدوي بالكامل، بدون أي script).

---

## 4) ما الذي **لن** يتغيّر
- محرك الرواتب — كما هو.
- `hr_payroll_policies` — كما هي (Manual mode).
- `shift_templates` و `daily_roster` و `branch_manager_assignments` — تبقى موجودة (تراث Phase 2)، لكن RLS الجديدة هي المعتمدة.
- دور `branch_scheduler` يبقى متاحاً لكنه أصبح اختيارياً وغير ضروري.

---

## 5) الأمان
- المدير المباشر لا يرى أي بيانات راتب أو مالية — لا تغييرات على RLS لجداول `salaries`، `payslips`، أو الجداول المالية.
- التحقق من نفس `company_id` في كل دالة security definer.

## أسئلة قبل البدء
1. هل أحذف فعلياً جدول `branch_manager_assignments` ودور `branch_scheduler`، أم أتركهما كـ legacy؟ (الافتراضي: أتركهما).
2. هل أضع شاشة "جدول الدوام" تحت `/attendance/roster` (مفضّل) أم أبقي `/manager/roster`؟

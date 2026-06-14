# خطة: مركز إسناد النماذج للموظفين (Form Access Center)

## الهدف
شاشة واحدة في الموارد البشرية اسمها **"إسناد النماذج والصلاحيات"**:
- نختار موظف من قائمة بحث
- نشوف ملخص دوره ومنصبه
- نحدد له بالـ checkbox لكل نموذج:
  - 📝 **يعبّي** (assigned to fill)
  - 👁️ **يرى المعبَّأة** (view-only access to submitted forms)
- التغيير فوري وينعكس على بورتال الموظف مباشرة

النموذج يطبّق **بالإضافة** للاستهداف الحالي بالمسمى الوظيفي (لا يلغيه).

---

## 1) قاعدة البيانات

### جدول جديد: `form_template_assignments`
```
id, user_id (owner للعزل), template_id, employee_id,
access_level ENUM('fill','view'),
assigned_by, assigned_at, is_active
UNIQUE(template_id, employee_id, access_level)
```
+ GRANT للـ authenticated و service_role
+ RLS: admin/hr_manager للشركة فقط

### تعديل دالة `can_view_form_template`
تقبل الموظف إذا:
- (موجود حالياً) `is_system=true` ومسماه ضمن `target_job_title_names`، **أو**
- (جديد) عنده صف فعّال في `form_template_assignments` لنفس القالب مع `access_level IN ('fill','view')`

### RPC جديد: `get_employee_form_access(p_employee_id uuid)`
يرجع لكل قالب متاح:
- `can_fill` (true/false)
- `can_view` (true/false)
- `source` ('job_title' | 'manual' | 'both')
تُستخدم في الشاشة الإدارية وأيضاً في بورتال الموظف لفلترة "ما يعبّي" مقابل "ما يرى".

### تعديل `EmployeeFormsTab` (بورتال الموظف)
- قسم **"نماذج للتعبئة"** = `can_fill = true`
- قسم **"نماذج للاطلاع"** = `can_view = true && can_fill = false` (للقراءة فقط على المعبَّأة من زملاء)

---

## 2) الشاشة الجديدة

**المسار:** `/hr/form-access`  
**موقعها في القائمة:** بطاقة جديدة داخل `/hr/settings` بعنوان "إسناد النماذج للموظفين"

### تخطيط الشاشة (LTR-flipped RTL)
```text
┌──────────────────────────────────────────────────┐
│ 🔍 بحث عن موظف: [علاء ناصر________________]      │
│ ┌─ النتائج (dropdown)                          ─┐│
│ │ علاء ناصر • مدير التسويق • فرع رام الله       ││
│ └────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────┤
│ الموظف المختار: علاء ناصر                          │
│ المنصب: مدير التسويق | الفرع: رام الله              │
├──────────────────────────────────────────────────┤
│ القالب              │ 📝 يعبّي │ 👁️ يرى │ المصدر │
│ الخطة التسويقية      │   ✅    │  ✅   │ منصب  │
│ تشبيك على النظافة    │   ☐    │  ☐   │ يدوي  │
│ طلب إجراء عقابي      │   ☐    │  ☐   │  —    │
│ ...                                              │
└──────────────────────────────────────────────────┘
[ حفظ التغييرات ]
```

- العمود "المصدر" يوضح: **منصب** (من target_job_title_names) أو **يدوي** (من جدول الإسناد) أو **كلاهما**.
- الـ checkboxes من المنصب تظهر مفعّلة معطلة (lock 🔒) مع tooltip "موروثة من المسمى الوظيفي". الإضافات اليدوية قابلة للتعديل.
- زر "نسخ صلاحيات من موظف آخر" (اختياري لاحقاً).

### Hook جديد
`useFormAccessManager(employeeId)` يلف الـ RPC + mutation لحفظ التغييرات (upsert/delete على `form_template_assignments`).

---

## 3) الصلاحية للوصول للشاشة
- المالك (admin) فقط — مطابق لما طلبت في المرة السابقة.
- hr_manager بصلاحية `can_manage_forms = true` لاحقاً عند الحاجة.

---

## 4) ما لن يتغير
- النماذج الموجودة وآليات تعبئتها وعرضها كما هي.
- شاشة `/employee-forms` (إدارة النماذج) تبقى للقوالب والتقديمات.
- شاشة `EmployeeDisciplinaryActionsTab` لا تتأثر.
- استهداف المسمى الوظيفي يبقى يعمل تلقائياً للموظفين الجدد بدون تدخل يدوي.

---

## 5) الملفات

**جديدة:**
- `supabase/migrations/<ts>_form_template_assignments.sql`
- `src/pages/hr/FormAccessCenterPage.tsx`
- `src/hooks/hr/useFormAccessManager.ts`
- `mem/features/hr/form-access-center.md`

**تعديل:**
- `src/pages/hr/HrSettingsPage.tsx` (إضافة بطاقة "إسناد النماذج")
- `src/App.tsx` (route جديد `/hr/form-access`)
- `src/components/employee/EmployeeFormsTab.tsx` (تقسيم إلى "للتعبئة" و"للاطلاع")
- `src/integrations/supabase/types.ts` (auto-regen)

---

## 6) ترتيب التنفيذ
1. Migration: الجدول + RPC + تعديل `can_view_form_template`.
2. الشاشة + الـ hook + الـ route + البطاقة في `/hr/settings`.
3. تقسيم `EmployeeFormsTab` لقسمين.
4. مذكرة في `mem/`.

---

## خارج النطاق
- لا نلمس صلاحيات الموظف العامة (RBAC الأساسي مثل cashier/admin/hr_manager) — هذه تُدار من مكان آخر.
- لا نضيف صلاحيات على مستوى الحقول داخل النموذج (Level deeper) — يمكن لاحقاً.
- لا نمس النماذج المعبَّأة الموجودة.

هل أبدأ التنفيذ؟

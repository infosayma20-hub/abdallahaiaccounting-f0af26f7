# خطة تحسين تطبيق الموظفين ونظام HR

طلبك ضخم جداً (16 محور، عشرات الحقول، جداول جديدة، صلاحيات، طباعة، تحقق، ذمم مالية، قسائم راتب، إجراءات عقابية). تنفيذه دفعة واحدة في رد واحد سيكسر أشياء بدون شك. سأقسّمه إلى **4 مراحل** نشتغلها بالترتيب — كل مرحلة قابلة للاختبار والمراجعة قبل ما ننتقل للي بعدها.

---

## المرحلة 1 — توحيد النماذج والتحقق (Forms Foundation)
**يغطي بنود: 1، 2، 3، 5، 6، 7، 8، 14**

### أ. توحيد التسميات (`src/lib/hrLabels.ts` + `EmployeeMyRequestsTab` + `FormsTab` + شاشات HR)
- مصدر واحد للأسماء العربية لكل `form_type` و `request_type`.
- إزالة `birthday_whatsapp` كنموذج مستقل (يُدمج داخل `employee_info`).
- `correction_request` = "تصحيح بصمة" (وقت إلزامي)، نوع جديد `attendance_edit_request` = "تعديل بصمة" منفصل.

### ب. نموذج الإجازة (`EmployeeFormsTab` → LeaveRequestForm)
- نوعان فقط: `annual` (سنوية) + `regular` (عادية). إخفاء `sick` و `personal` و `unpaid` من الـ UI الجديد لكن دعم backward compat في العرض.
- حقل "عدد الأيام" (محسوب تلقائياً + قابل للتعديل اليدوي).
- Validation: `to >= from`، الحقول مطلوبة، toast خطأ واضح.

### ج. تحقق موحد لكل النماذج
- دالة helper `validateEmployeeForm(formType, data)` ترجع `{ ok, errors }`.
- منع submit عند فشل validation + `toast.error` بالعربي.

### د. حقول موحدة (الفرع، القسم، الشفت، مرفق)
- Component مشترك `<FormCommonFields>` يُحقن في كل النماذج.
- الـ values تُحفظ في `form_data.branch_id`, `form_data.department`, `form_data.shift_id`, `attachment_url`.
- استخدام bucket التخزين الحالي للموظف (`employee-attachments` أو إنشاؤه إن لم يوجد).

### هـ. تصحيح بصمة الذكي
- في `AlertsTab`: عند الضغط على "بصمة ناقصة" يفتح dialog مُعبّأ مسبقاً بـ `attendance_date` و `request_type` (in/out)، فقط الوقت والسبب يدخلهما الموظف.

### و. الأوفر تايم — للمدراء فقط
- إخفاء البطاقة من `EmployeeFormsTab` إذا `!employee.is_manager && !employee.can_manage_attendance`.
- نموذج جديد فيه: اسم الموظف (dropdown من فريقه)، التاريخ، من/إلى، عدد الساعات (محسوب)، السبب، فرع/قسم/شفت، مرفق اختياري.

### ز. الطباعة
- تحديث `formPrintLabels` map لعرض تسميات عربية لكل المفاتيح الجديدة (`correction_time` → "وقت البصمة"، إلخ).

---

## المرحلة 2 — شاشة "طلباتي" التفصيلية + معلومات الموظف
**يغطي بنود: 4، 5 (الجزء الثاني)**

### أ. تطوير `EmployeeMyRequestsTab`
- كل كرت يعرض: اسم النموذج + الحالة + التاريخ + **ملخص ذكي** (`buildFormSummary(form_type, form_data)`).
- ضغطة على الكرت → `<RequestDetailsDialog>` يعرض كل `form_data` بأسماء عربية + ملاحظات HR + سبب الرفض + المرفق.
- قراءة آمنة للحقول (`?? "—"`) — لا يكسر إذا حقل ناقص.

### ب. نموذج معلومات الموظف الموسّع (`employee_info`)
- الحقول: الاسم، تاريخ الميلاد، واتساب، رقم الهوية، الحالة الاجتماعية، اسم الزوج/الزوجة، عدد الأطفال، المستوى التعليمي، فرع، قسم، شفت، ملاحظات، صورة هوية (مرفق).
- تنبيه أعلى الـ home screen إذا الحقول الأساسية ناقصة (`employees.birth_date IS NULL OR phone IS NULL`).

---

## المرحلة 3 — الأقسام الجديدة للموظف
**يغطي بنود: 10، 11، 12، 13**

### أ. قسيمة الراتب (`PayslipsTab`)
- قراءة من جدول `payroll_runs` / `payroll_payslips` الحالي (إن وجد) — استخدام الموجود، حالة فارغة لو لا توجد.
- بطاقة لكل شهر → dialog بالتفاصيل (راتب أساسي، إضافات، خصومات، صافي).

### ب. ذمم الموظف (`EmployeeFinancialsTab`)
- استخدام `useEmployeeFinancialMovements` الموجود.
- بطاقات: سلف، أكل، مخالفات، مشتريات، عجز، فائض، قسط القرض.
- ملخص: على الذمة / مستحق / صافي.
- بطاقة قرض حسن: قيمة، بداية، دفعات، مدفوع، متبقي.

### ج. جدول الدوام الشهري (`MyAttendanceMonthTab`)
- قراءة من `attendance_days`.
- جدول/قائمة موبايل: اليوم، التاريخ، من، إلى، ساعات، حالة.
- ملخص شهري في الأعلى.

### د. الإجراءات العقابية (`DisciplinaryActionsTab`)
- قراءة من `correction_requests` بـ tag `HRMSG`/`disciplinary` حسب memory الحالية.
- يعرض إجراءات الموظف فقط (RLS + `eq employee_id`).

---

## المرحلة 4 — القرض الحسن الذكي + Migrations + QA
**يغطي بنود: 9، 15، 16**

### أ. نموذج القرض الحسن
- Pre-fill: اسم، فرع، تاريخ بدء العمل، راتب، سقف القرض (من `hr_settings` أو ثابت).
- منطق `evaluateLoanEligibility({ amount, hire_date, salary, ceiling, min_tenure })` يخزّن `eligibility_status` + `eligibility_reason` في `form_data`.
- شارة في الـ UI: مؤهل مبدئياً / يتطلب مراجعة.

### ب. Migrations عند الحاجة
- التحقق أولاً من الجداول الموجودة (`payroll_*`, `employee_disciplinary_*`).
- إنشاء فقط ما هو ناقص + RLS: الموظف يرى صفوفه فقط، HR/admin حسب الأدوار.
- لا تعديل على بيانات قديمة.

### ج. QA
- Build + typecheck.
- اختبار يدوي للسيناريوهات في بند 16.

---

## ملاحظات تقنية مهمة

- **ملفات أساسية ستُعدَّل**: `EmployeeFormsTab.tsx`, `EmployeeMyRequestsTab.tsx`, `EmployeeApp.tsx`, `EmployeeBottomNav.tsx`, `AlertsTab.tsx`, `hrLabels.ts`, `FormsTab.tsx` (HR).
- **ملفات جديدة**: `forms/LeaveRequestForm.tsx`, `forms/EmployeeInfoForm.tsx`, `forms/LoanRequestForm.tsx`, `forms/OvertimeRequestForm.tsx`, `forms/CorrectionRequestForm.tsx`, `forms/FormCommonFields.tsx`, `forms/validators.ts`, `RequestDetailsDialog.tsx`, `PayslipsTab.tsx`, `EmployeeFinancialsTab.tsx`, `MyAttendanceMonthTab.tsx`, `DisciplinaryActionsTab.tsx`.
- **Backward compat**: العرض في "طلباتي" يفهم القديم والجديد. لا حذف بيانات.
- **RLS**: الموظف = `auth_user_id = auth.uid()`. HR/admin = حسب `has_role`.
- **حجم العمل**: تقديري ~25-30 ملف في المجموع. لذلك التقسيم على 4 ردود (مرحلة في كل رد) ضروري لتسليم نظيف بدون كسر.

---

## السؤال قبل البدء

هل توافق على:
1. تنفيذ **المرحلة 1** الآن في هذا الرد، ثم نكمل البقية مرحلة بمرحلة؟
2. أو تفضّل ترتيب أولوية مختلف (مثلاً نبدأ بـ "طلباتي" + معلومات الموظف لأنها الأهم بصرياً)؟
3. هل عندك جدول `payroll_payslips` أو ما يشابهه فعلياً، أم نحتاج migration جديدة له في المرحلة 3؟

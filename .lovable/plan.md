## الهدف
إضافة زر جديد داخل صفحة الحضور (HRAttendancePage) اسمه **"توليد بصمات بأثر رجعي"** يسمح لموظفي HR بتعبئة سجل حضور موظف جديد من تاريخ إلى تاريخ (مثلاً من أول الشهر) بضغطة واحدة، مع أوقات دخول/خروج ثابتة يدخلها المستخدم — يشمل كل الأيام في المدى (بدون تخطي جُمَع أو عطل).

## الواجهة (Dialog جديد)
عناصر النموذج:
- **الموظف** — اختيار من قائمة الموظفين النشطين (Combobox بحث).
- **من تاريخ** / **إلى تاريخ** — تاريخين، يجب أن يكون "من" ≤ "إلى".
- **وقت الدخول** — HH:mm (افتراضي 08:00).
- **وقت الخروج** — HH:mm (افتراضي 17:00). يسمح بخروج بعد منتصف الليل (يعتبر لليوم التالي).
- **السبب** — نص إجباري (مثلاً "موظف جديد — تعبئة بصمات بأثر رجعي").
- **معاينة** قبل التنفيذ: جدول يعرض كل يوم في المدى مع الأوقات، وعدد الأيام الإجمالي، وتنبيه إذا كان في اليوم بصمة موجودة مسبقاً (تُتخطى تلقائياً — لا تُدهس).

زر التنفيذ: **"توليد البصمات"** — يعطّل بينما التنفيذ جارٍ، ويعرض progress toast.

## المنطق (Client)
لكل يوم في المدى:
1. تحقق إذا يوجد سجلات في `attendance_events` لنفس (employee_id, business_date) — إذا يوجد، تخطى (append السبب في تقرير نهائي).
2. إذا لا يوجد:
   - أدرج حدثين في `attendance_events`:
     - `event_type='check_in'`, `event_time = date + check_in_time`, `source='manual_backfill'`, `is_manual=true`, `notes=reason`, `created_by=user.id`.
     - `event_type='check_out'`, `event_time = date + check_out_time` (+ يوم واحد لو check_out ≤ check_in).
   - أدرج/حدّث `attendance_days` بحالة `present` مع الأوقات المحسوبة، `is_manually_adjusted=true`، `manual_adjustment_reason=reason`.
   - سجّل في `attendance_audit_logs` نوع `manual_backfill` مع payload يوضح الأوقات والسبب.

كل العمليات تتم عبر supabase client مع احترام RLS الحالية (نفس صلاحيات "تعديل يدوي" الموجود). التنفيذ متسلسل يوماً بيوم مع progress، وفي حالة أي خطأ يُعرض ولا يوقف باقي الأيام (نتيجة ملخّصة في النهاية: X تمّت، Y مُتخطاة، Z فشلت).

## أين يظهر الزر
- في شريط أدوات HRAttendancePage (بجانب "طباعة QR" و"تقارير") — أيقونة `CalendarPlus`.
- ويظهر أيضاً داخل تبويب **العرض الشهري** (MonthlyAttendanceTab) بجانب "تحديث" — لأن هذا التبويب هو المكان الطبيعي لملاحظة أن موظفاً جديداً بدون بصمات.

## ما لن نغيّره
- لن نلمس منطق البصمة الحية (QR/geo).
- لن نغيّر ترحيلات الرواتب أو حساب التأخير — سيتم استهلاك السجلات الجديدة عبر نفس المسار الحالي (`buildMonthInputsFromSources`) لأنها ستكون attendance_days عادية موسومة `is_manually_adjusted`.
- لن ندهس أي سجل حضور موجود.

## تفاصيل تقنية
ملفات جديدة/معدّلة:
- **جديد:** `src/components/hr/BackfillAttendanceDialog.tsx` — النموذج + المعاينة + تنفيذ الإدراج.
- **جديد:** `src/lib/hr/backfillAttendance.ts` — دالة `runBackfill({ employeeId, from, to, checkIn, checkOut, reason })` تُرجع `{ inserted, skipped, failed, errors[] }`.
- **معدّل:** `src/pages/HRAttendancePage.tsx` — إضافة زر يفتح الـ dialog + state.
- **معدّل:** `src/pages/hr/components/MonthlyAttendanceTab.tsx` — إضافة نفس الزر داخل شريط الفلاتر (يفتح الـ dialog بموظف مُمرَّر مسبقاً من الفلتر الحالي).

بدون أي migration — كل الحقول المستخدمة موجودة أصلاً في الجداول (`attendance_events`, `attendance_days`, `attendance_audit_logs`).

## سؤال جانبي (بعد الموافقة)
لو أردت لاحقاً "دفعة لعدة موظفين معاً" أو "استيراد Excel" أضيفها كطبقة فوق نفس `runBackfill`.

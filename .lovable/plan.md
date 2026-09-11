# توحيد تنسيق عرض التاريخ في التطبيق

## المشكلة
المستخدم يلاحظ أن التاريخ يُعرض بترتيبين مختلفين في أماكن مختلفة: في بعض الشاشات "يوم/شهر/سنة" وفي أخرى "شهر/يوم/سنة" أو "سنة/شهر/يوم". الصورة المرسلة من شاشة "نماذج الموظفين" تظهر فلتر التاريخ `08/09/2026` لكن التناقض موجود في شاشات أخرى.

## الهدف
جعل كل تواريخ الواجهة تُعرض بالتنسيق الموحد **يوم/شهر/سنة (dd/mm/yyyy)**، مع الحفاظ على التخزين الداخلي كـ ISO (yyyy-mm-dd).

## النطاق
1. **الأولوية:** شاشات و مكونات الموارد البشرية (`src/pages/hr/*`, `src/components/hr/*`).
2. **الامتداد:** المكونات المرتبطة مباشرةً بنفس السياق (نماذج الموظفين، كشوف، سلف، إجازات، حضور).
3. **ما لا يُمس:** تنسيقات الطباعة / POS / التقارير المحاسبية التي لها مراجع خارجية أو تعتمد على `en-GB` بشكل مقصود، إلا إذا كانت واضحة التناقض.

## الخطوات
1. إنشاء/تأكيد دالة مساعدة موحدة في `src/lib/hrDate.ts`:
   - `formatHRDate()` → dd/mm/yyyy
   - `formatHRDateTime()` → dd/mm/yyyy HH:mm
2. استبدال جميع `toLocaleDateString("ar")` / `toLocaleDateString("ar-EG")` / `toLocaleDateString("ar-PS")` في نطاق HR بالدالة الموحدة.
3. استبدال `format(date, "yyyy/MM/dd")` و `format(date, "yyyy-MM-dd")` المستخدمة للعرض في نطاق HR بـ dd/mm/yyyy.
4. التحقق من أن حقول الإدخال تستخدم `DateInputDMY` أو ما يعادلها (عرض dd/mm/yyyy، تخزين ISO).
5. تشغيل `npx tsgo --noEmit` والبناء للتأكد من عدم وجود أخطاء.
6. التحقق من الصفحة المعروضة في الصورة باستخدام Playwright.

## الملفات المتوقع تعديلها
- `src/lib/hrDate.ts` (إضافة `formatHRDateTime`)
- `src/pages/EmployeeFormsManagementPage.tsx`
- `src/components/hr/HRAlertsBell.tsx`
- `src/components/hr/EmployeeDocumentsManager.tsx`
- `src/components/hr/SalarySlipDialog.tsx`
- `src/components/hr/AdminPayslipDialog.tsx`
- `src/components/hr/ForwardFormDialog.tsx`
- `src/pages/hr/HRMessagesInboxPage.tsx`
- `src/pages/hr/SettlementsPage.tsx`
- `src/pages/hr/HRChatPage.tsx`
- `src/pages/hr/MonthlyInventoryReviewPage.tsx`
- `src/pages/hr/PayrollBulkImportPage.tsx`
- `src/pages/hr/components/tabs/OverviewTab.tsx`
- `src/pages/hr/components/tabs/FormsTab.tsx`
- `src/pages/hr/components/tabs/MessagesTab.tsx`
- `src/pages/hr/components/EmployeeTimeline.tsx`
- `src/pages/hr/components/EmployeeHeader.tsx`
- `src/pages/hr/components/PayrollEmployeeDrawer.tsx`
- `src/pages/hr/components/PreviewRowModals.tsx`

## ملاحظة
لن نغيّر تنسيقات الطباعة المحاسبية أو POS المبنية على `en-GB` إلا بناءً على طلب منفصل، لأن لها متطلبات خارجية (كشوف بنكية، طباعة إيصالات).

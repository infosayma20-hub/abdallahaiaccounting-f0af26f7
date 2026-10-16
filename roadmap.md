# المرحلة 4أ — تسريع فتح البرنامج والتنقل + إصلاح أخطاء الدقة

## 1) حزمة بدء تشغيل واحدة
- [ ] دالة `get_my_bootstrap()` SECURITY DEFINER (أدوار، نوع حساب، مالك بيانات، إعداد أولي، شركة/ملف، اشتراك، صلاحيات ميزات، تجاوزات تطبيقات)
- [ ] تخزين sessionStorage + إبطال عند خروج/تغيير شركة/بث صلاحيات
- [ ] تحويل المستهلكين لـ React Query بمفتاح ["bootstrap", uid]: useRoleRedirect, OnboardingGate, CompanyProvider, useSubscription, useMyFeaturePermissions, useMyAppOverrides

## 2) الصلاحيات مرة واحدة
- [ ] مزوّد واحد في WebLayout بقناة بث واحدة
- [ ] usePermission وCan يقرآن منه بدون طلب

## 3) تحميل الشيفرة
- [ ] WebLayout/ModuleGuard/FeatureGuard استيراد مباشر لا lazy
- [ ] تحميل مسبق عند hover على رابط القائمة الجانبية

## 4) أخطاء دقة
- [ ] حد 1000 صف: useDashboardData، قائمة الفواتير، عملاء InvoiceCreatePage، حسابات ProductEditPage
- [ ] user.id بدل ownerId: ContactDetailPage، useDashboardData، TopBar، AccountStatementV2Page
- [ ] ContactsPage: التأثير يتجاهل ownerId
- [ ] ProductEditPage.save: حذف ثم إدراج بدون فحص خطأ → فحص كل خطأ / دالة save_product بمعاملة
- [ ] useInternalMessages: فلتر بالمستخدم الحالي
- [ ] InvoicesPage: لا جلب قبل انتهاء الصلاحيات
- [ ] AccountStatementV2Page: تسجيل lastTxFilterKeyRef

## قياس قبل/بعد
- [ ] عدد الطلبات المتسلسلة حتى قائمة الفواتير
- [ ] عدد قنوات البث في قائمة الفواتير
- [ ] زمن الفتح والتنقل
- [ ] بصمة الشاشات لكل دور

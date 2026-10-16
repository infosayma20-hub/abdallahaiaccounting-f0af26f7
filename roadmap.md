# خارطة الطريق

## المرحلة 4أ — تسريع فتح البرنامج والتنقل + إصلاح أخطاء الدقة ✅ (مكتملة 2026-10-16)

1. ✅ دالة `get_my_bootstrap()` (migration 0149) + خطاف `useBootstrap` — طلب واحد بدل ~10 جولات متتالية.
2. ✅ مزوّد صلاحيات واحد: `useUserRoles`/`useMyFeaturePermissions`/`useMyAppOverrides`/`usePermission`/`useDataOwnerId`/`useRoleRedirect`/`CompanyProvider`/`useSubscription`/`OnboardingGate` كلها تقرأ من الحزمة؛ قناة بث واحدة لكل مستخدم.
3. ✅ تحميل الشيفرة: WebLayout/ModuleGuard/FeatureGuard استيراد مباشر؛ تحميل مسبق عند مرور الفأرة على روابط القائمة الجانبية (`src/lib/pagePreload.ts`).
4. ✅ أخطاء الدقة: حد 1000/5000 الصامت (لوحة التحكم + قائمة الفواتير صارا بصفحات كاملة)؛ user.id بدل ownerId في ContactDetailPage/useDashboardData/TopBar/ContactsPage؛ حفظ باركود المنتج يفحص الأخطاء؛ الرسائل الداخلية بجلب مستهدف؛ منع الجلب المزدوج في InvoicesPage.

**قياسات بعد التنفيذ:** طلبات الخلفية حتى قائمة الفواتير 52→43 (سلسلة الصلاحيات نفسها صارت RPC واحد + role_defaults مرة بالجلسة)؛ get_team_owner_id 2→1؛ user_roles المنفصل اختفى. اختبارات الصلاحيات دون اتصال 11/11 ناجحة. فشل accessContext/payroll parity قديم لا علاقة له بالتعديل.

## قادم (بانتظار برومبتات المستخدم)
- الشريحة الأولى من الفاتورة الموحّدة: فاتورة مبيعات آجلة ببنود خدمات فقط (لم تبدأ — بانتظار موافقة/برومبت).


# موديول عروض أسعار أموالي (Amwali Quotations)

موديول مستقل تماماً، محمي بصلاحية **Super Admin فقط**. لن يمس أي Route، صلاحية، فاتورة، أو محاسبة قائمة. الصفحة الحالية `/contracts/amwali-quote` تبقى كنموذج طباعة سريع، ويُبنى فوقها موديول كامل بقاعدة بيانات وحالات.

## 1) الصلاحيات والحماية

- Guard واحد `<RequireSuperAdmin/>` يستخدم `usePermission().isSuperAdmin` + fallback على البريد `info.sayma20@gmail.com`.
- كل Routes الموديول ملفوفة به. أي مستخدم آخر يُعاد توجيهه لـ `/`.
- لا يظهر أي Sidebar / Menu / Card للموديول إلا للسوبر أدمن.

## 2) قاعدة البيانات (Lovable Cloud)

جداول جديدة فقط، بدون تعديل على أي جدول موجود:

- `amwali_quotation_settings` (سطر واحد singleton): العملة، مدة الصلاحية بالأيام، نسبة الضريبة، نسبة الخصم الافتراضية، نص المقدمة، نص الشروط، نص سياسة الدعم SLA (JSON)، نص التوقيع، Footer، ألوان (JSON)، شعار (URL).
- `amwali_quotation_catalog_items`: بنود القالب الافتراضية — `code, name, description, pricing_type, onetime_price, annual_price, default_qty, sort_order, active`.
  - `pricing_type` enum: `fixed | per_pos | per_kiosk | per_hr_employee | per_crm_user | annual_only | onetime_only | custom`.
- `amwali_quotations`: `quote_number` (auto `QUO-YYYY-###`), `status` (`draft|approved|cancelled`)، بيانات العميل، تواريخ، عملة، خصم، ضريبة، إجماليات محسوبة، عدادات (`pos_points, kiosk_points, hr_employees, crm_users, system_users`)، ملاحظات داخلية، `created_by`.
- `amwali_quotation_items`: بنود العرض نفسه (منسوخة من الكاتالوج وقت الإنشاء وقابلة للتعديل داخل العرض فقط).
- تسلسل رقم العرض عبر function `next_amwali_quote_number()` مع سنة.
- RLS: كل الجداول مقصورة على السوبر أدمن فقط (via `has_role(auth.uid(),'super_admin')`). GRANTs كاملة للـ authenticated + service_role.
- Seed للـ 11 بند الافتراضية عند أول تشغيل عبر migration.

## 3) الواجهات

Routes جديدة تحت `/amwali-quotations`:

- `/amwali-quotations` — قائمة عروض الأسعار: بحث، فلاتر (حالة/تاريخ)، أعمدة (رقم، عميل، تاريخ، صالح حتى، الإجمالي، الحالة، منشئ). أزرار: **جديد**، **نسخ**، **تعديل**، **طباعة**، **اعتماد**، **إلغاء**، **حذف** (بتأكيد).
- `/amwali-quotations/new` و `/amwali-quotations/:id/edit` — محرر:
  - رأس: رقم تلقائي، تاريخ، صالح حتى، عملة، حالة (شارة).
  - بيانات العميل + ملاحظات داخلية (لا تُطبع).
  - **عدادات مستقلة**: عدد نقاط POS، عدد نقاط Kiosk، عدد موظفي HR، عدد مستخدمي CRM. تغيّرها يُحدّث كمية البنود المرتبطة بها تلقائياً (حسب `pricing_type`).
  - جدول بنود قابل للتعديل: إضافة/حذف بند، تغيير الوصف/الكمية/السعرين، Drag-and-Drop للترتيب.
  - المجاميع Live: إجمالي «لمرة واحدة»، إجمالي الاشتراك السنوي، خصم، ضريبة، **الإجمالي المستحق للسنة الأولى = التفعيل + الاشتراك السنوي الأول** (بند صريح).
  - أزرار: **حفظ كمسودة**، **اعتماد**، **إلغاء**، **نسخ**، **معاينة/طباعة**، **Export PDF** (window.print إلى PDF بنفس تنسيق الطباعة الحالي).
- `/amwali-quotations/settings` — إعدادات القالب:
  - CRUD كامل على بنود الكاتالوج + تفعيل/تعطيل + Drag-and-Drop.
  - تعديل: العملة الافتراضية، مدة الصلاحية، نسبة الخصم/الضريبة، نص المقدمة، الشروط، سياسة الدعم، التوقيع، Footer، الألوان، الشعار.
  - زر **حفظ كـ Default Template**.

## 4) البنود الافتراضية (Seed)

1. نظام المحاسبة — 500$ / 350$ سنوي — `fixed` qty=1.
2. نقطة البيع POS — 300$ / 100$ — `per_pos`.
3. HR — الأساسي 1500$ / 0 — `onetime_only` qty=1.
4. موظفو HR — 0 / 10$ — `per_hr_employee` (وصف: لا يُعتبرون مستخدمين للنظام).
5. CRM — الأساسي 500$ / 0 — `onetime_only` qty=1.
6. مستخدمو CRM — 0 / 50$ — `per_crm_user`.
7. الكيوسك — 500$ / 150$ — `per_kiosk` (ملاحظة: الأجهزة غير مشمولة).
8. إدارة النظام الداخلي والنماذج — 0 / 500$ — `annual_only`.
9. التكاملات و API — 0 / 1000$ — `annual_only` (مع فقرة تحذير التكاملات المعقدة).
10. الدعم الفني السنوي — 0 / 2000$ — `annual_only` (يفعّل قسم SLA في الطباعة).
11. مراكز التكلفة — Optional add-on — قيم قابلة للتعديل — `fixed`.
12. معادلة الإنتاج — Optional add-on — قيم قابلة للتعديل — `fixed`.
13. باقة تعديلات صغيرة — Optional — مع حقلي «ساعات مشمولة» و«سعر الساعة الإضافية» في الإعدادات — `fixed`.

## 5) الطباعة / PDF

- طبقة `<PrintView/>` مستقلة بنفس تنسيق `AmwaliQuotePage` الحالي، محسّنة للـ A4 مع فواصل صفحات صحيحة، وترويسة/تذييل يتكرران، ومجموع نهائي مرة واحدة فقط في الأخير.
- إخفاء كل عناصر التحكم (`.no-print`) بما فيها الملاحظات الداخلية.
- توقيعان في آخر صفحة + Footer «أموالي — حلول محاسبية وإدارية ذكية · www.amwali.app».
- Export PDF عبر `window.print()` → «Save as PDF» (نفس أسلوب كشف الحساب في المشروع).

## 6) عدم كسر أي شيء

- لا تعديل على أي جدول أو Route قائم.
- الصفحة الحالية `/contracts/amwali-quote` تبقى تعمل كما هي (نموذج طباعة سريع)؛ يُضاف زر «افتح موديول عروض الأسعار» يقودك للجديد.
- بطاقة الوصول من `PrintTemplatesPage` تبقى، مع إضافة بطاقة ثانية «موديول عروض أسعار أموالي» تظهر للسوبر أدمن فقط.
- زر لموديول عروض الأسعار داخل لوحة السوبر أدمن.

## 7) تفاصيل تقنية

- ملفات جديدة:
  - `src/pages/amwali-quotations/QuotationsListPage.tsx`
  - `src/pages/amwali-quotations/QuotationEditorPage.tsx`
  - `src/pages/amwali-quotations/QuotationSettingsPage.tsx`
  - `src/pages/amwali-quotations/PrintView.tsx`
  - `src/components/amwali-quotations/RequireSuperAdmin.tsx`
  - `src/hooks/useAmwaliQuotationSettings.ts`
  - `src/hooks/useAmwaliQuotations.ts`
- Routes مضافة في `src/App.tsx` تحت `RequireAuth` + `RequireSuperAdmin`.
- Migration واحد يُنشئ الجداول + Seed + Function ترقيم + RLS + GRANTs.
- كل الحسابات في hook مشترك `calcQuotationTotals()` لضمان تطابق العرض والطباعة والقاعدة.

## 8) اختبارات يدوية بعد التنفيذ

- إنشاء عرض جديد، تعديل، حذف بند، تغيير عدادات POS/Kiosk/HR/CRM، احتساب الإجمالي، حفظ كمسودة، اعتماد، إلغاء، نسخ، طباعة، Export PDF.
- تسجيل دخول بحساب غير سوبر أدمن → تأكد أن الروابط لا تظهر وأن الوصول المباشر يُرفض.
- التأكد أن الفواتير/المحاسبة/العقود لم تتأثر.

## ملاحظة على الحجم

هذا الموديول كبير نسبياً. سيتم تنفيذه على دفعة واحدة كاملة (Migration + Pages + Routes + Print) في رد واحد بعد موافقتك.

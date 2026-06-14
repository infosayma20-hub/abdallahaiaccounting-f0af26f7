INSERT INTO public.form_templates (
  id, user_id, is_system, name, description, category, schema,
  target_job_title_names, reviewer_role, frequency, is_active, is_deleted
) VALUES
(
  '22222222-2222-2222-2222-222222222222', NULL, true,
  'تشبيك على النظافة',
  'تقرير يومي لفحص النظافة في الفرع/المطعم.',
  'operations',
  '{"sections":[{"key":"header","title":"بيانات التقرير","type":"fields","fields":[{"key":"date","label":"التاريخ","type":"date","required":true},{"key":"shift","label":"الشفت","type":"select","options":["صباحي","مسائي","ليلي"]},{"key":"branch","label":"الفرع","type":"text","required":true},{"key":"inspector","label":"اسم المفتش","type":"text","required":true}]},{"key":"areas","title":"تقييم النظافة لكل منطقة","type":"repeater","item_label":"منطقة","fields":[{"key":"area","label":"المنطقة","type":"select","options":["المطبخ","الصالة","الحمامات","المخزن","الكاونتر","الواجهة الخارجية","الثلاجات","المعدات"]},{"key":"rating","label":"التقييم","type":"select","options":["ممتاز","جيد","مقبول","ضعيف","غير مقبول"]},{"key":"issues","label":"الملاحظات/المشاكل","type":"textarea"},{"key":"action_required","label":"الإجراء المطلوب","type":"textarea"}]},{"key":"summary","title":"الملخص","type":"fields","fields":[{"key":"overall_rating","label":"التقييم العام","type":"select","options":["ممتاز","جيد","مقبول","ضعيف"]},{"key":"recommendations","label":"التوصيات","type":"textarea"}]}]}'::jsonb,
  ARRAY['مدير الفرع','مشرف الفرع','مساعد مدير الفرع','كابتن','Branch Manager','Shift Supervisor'],
  'admin','daily',true,false
),
(
  '33333333-3333-3333-3333-333333333333', NULL, true,
  'تقرير جودة المرافق والمعدات',
  'تقييم أسبوعي لحالة المرافق والمعدات.',
  'operations',
  '{"sections":[{"key":"header","title":"بيانات التقرير","type":"fields","fields":[{"key":"week_from","label":"من تاريخ","type":"date","required":true},{"key":"week_to","label":"إلى تاريخ","type":"date","required":true},{"key":"branch","label":"الفرع","type":"text","required":true},{"key":"prepared_by","label":"إعداد","type":"text","required":true}]},{"key":"equipment","title":"المعدات","type":"repeater","item_label":"معدة","fields":[{"key":"name","label":"اسم المعدة","type":"text"},{"key":"location","label":"الموقع","type":"text"},{"key":"condition","label":"الحالة","type":"select","options":["تعمل بكفاءة","تحتاج صيانة","معطلة","خارج الخدمة"]},{"key":"last_maintenance","label":"آخر صيانة","type":"date"},{"key":"notes","label":"ملاحظات","type":"textarea"}]},{"key":"facilities","title":"المرافق","type":"repeater","item_label":"مرفق","fields":[{"key":"name","label":"المرفق","type":"select","options":["تكييف","تدفئة","إضاءة","سباكة","كهرباء","تهوية","شبكة إنترنت","CCTV","أخرى"]},{"key":"status","label":"الحالة","type":"select","options":["سليم","يحتاج إصلاح","معطل"]},{"key":"description","label":"وصف المشكلة","type":"textarea"},{"key":"priority","label":"الأولوية","type":"select","options":["عالية","متوسطة","منخفضة"]}]},{"key":"summary","title":"التوصيات","type":"fields","fields":[{"key":"urgent_actions","label":"إجراءات عاجلة","type":"textarea"},{"key":"estimated_cost","label":"التكلفة التقديرية للصيانة","type":"number"}]}]}'::jsonb,
  ARRAY['مدير الفرع','مشرف الفرع','مساعد مدير الفرع','Branch Manager','Facility Manager'],
  'admin','weekly',true,false
),
(
  '44444444-4444-4444-4444-444444444444', NULL, true,
  'طلب إجراء عقابي',
  'نموذج لرفع طلب إجراء تأديبي/عقابي بحق موظف.',
  'hr',
  '{"sections":[{"key":"requester","title":"بيانات مقدم الطلب","type":"fields","fields":[{"key":"date","label":"تاريخ الطلب","type":"date","required":true},{"key":"requested_by","label":"اسم مقدم الطلب","type":"text","required":true},{"key":"requester_position","label":"المنصب","type":"text","required":true},{"key":"branch","label":"الفرع","type":"text"}]},{"key":"employee","title":"بيانات الموظف المُشتكى عليه","type":"fields","fields":[{"key":"employee_name","label":"اسم الموظف","type":"text","required":true},{"key":"employee_position","label":"المنصب","type":"text"},{"key":"employee_department","label":"القسم","type":"text"}]},{"key":"incident","title":"تفاصيل المخالفة","type":"fields","fields":[{"key":"incident_date","label":"تاريخ الواقعة","type":"date","required":true},{"key":"incident_time","label":"وقت الواقعة","type":"text"},{"key":"incident_place","label":"مكان الواقعة","type":"text"},{"key":"violation_type","label":"نوع المخالفة","type":"select","options":["تأخر متكرر","غياب بدون إذن","سوء سلوك","إهمال","مخالفة تعليمات","تقصير في الواجبات","سوء معاملة زبون","سوء معاملة زميل","أخرى"]},{"key":"description","label":"وصف تفصيلي للواقعة","type":"textarea","required":true},{"key":"witnesses","label":"شهود (إن وجدوا)","type":"textarea"},{"key":"previous_warnings","label":"إنذارات سابقة","type":"textarea"}]},{"key":"requested_action","title":"الإجراء المطلوب","type":"fields","fields":[{"key":"suggested_action","label":"الإجراء المقترح","type":"select","options":["تنبيه شفهي","إنذار خطي","خصم من الراتب","إيقاف عن العمل","إنهاء خدمة","إجراء آخر"]},{"key":"suggested_amount","label":"قيمة الخصم المقترح (إن وجد)","type":"number"},{"key":"justification","label":"المبررات","type":"textarea","required":true}]}]}'::jsonb,
  ARRAY['مدير الفرع','مشرف الفرع','مدير الموارد البشرية','مدير عام','HR Manager','Branch Manager'],
  'admin','on_demand',true,false
),
(
  '55555555-5555-5555-5555-555555555555', NULL, true,
  'إبلاغ عن عطل',
  'الإبلاغ عن عطل أو خلل في الفرع يحتاج صيانة.',
  'operations',
  '{"sections":[{"key":"reporter","title":"بيانات المُبلِّغ","type":"fields","fields":[{"key":"date","label":"التاريخ","type":"date","required":true},{"key":"time","label":"الوقت","type":"text"},{"key":"reported_by","label":"اسم المُبلِّغ","type":"text","required":true},{"key":"branch","label":"الفرع","type":"text","required":true}]},{"key":"issue","title":"تفاصيل العطل","type":"fields","fields":[{"key":"category","label":"نوع العطل","type":"select","options":["كهرباء","سباكة","تكييف/تدفئة","معدة مطبخ","ثلاجة/فريزر","فرن","نقاط بيع/كمبيوتر","شبكة إنترنت","CCTV","أثاث","مبنى/إنشائي","أخرى"],"required":true},{"key":"location","label":"الموقع داخل الفرع","type":"text","required":true},{"key":"description","label":"وصف العطل","type":"textarea","required":true},{"key":"impact","label":"تأثير العطل على العمل","type":"select","options":["متوقف كلياً","يؤثر جزئياً","لا يؤثر حالياً"]},{"key":"urgency","label":"درجة الاستعجال","type":"select","options":["عاجل جداً","عاجل","عادي"],"required":true}]},{"key":"actions","title":"الإجراءات المتخذة","type":"fields","fields":[{"key":"immediate_action","label":"إجراء فوري تم اتخاذه","type":"textarea"},{"key":"contacted_maintenance","label":"تم التواصل مع الصيانة؟","type":"select","options":["نعم","لا"]},{"key":"contact_person","label":"اسم فني/جهة الصيانة","type":"text"},{"key":"estimated_cost","label":"التكلفة التقديرية (إن وُجدت)","type":"number"}]},{"key":"attachments","title":"معلومات إضافية","type":"fields","fields":[{"key":"notes","label":"ملاحظات","type":"textarea"}]}]}'::jsonb,
  ARRAY['مدير الفرع','مشرف الفرع','مساعد مدير الفرع','كابتن','كاشير','Branch Manager','Shift Supervisor','Cashier'],
  'admin','on_demand',true,false
);
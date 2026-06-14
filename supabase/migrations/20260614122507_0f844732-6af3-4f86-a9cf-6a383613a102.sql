
-- =====================================================
-- Dynamic Form Templates Engine
-- =====================================================

CREATE TABLE public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_system boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  schema jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  target_job_title_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_employee_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  reviewer_role text NOT NULL DEFAULT 'admin',
  frequency text NOT NULL DEFAULT 'once',
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_templates_owner_check CHECK (is_system = true OR user_id IS NOT NULL)
);

CREATE INDEX idx_form_templates_user ON public.form_templates(user_id) WHERE is_deleted = false;
CREATE INDEX idx_form_templates_system ON public.form_templates(is_system) WHERE is_system = true AND is_deleted = false;
CREATE INDEX idx_form_templates_target_jobs ON public.form_templates USING gin(target_job_title_names);
CREATE INDEX idx_form_templates_target_emps ON public.form_templates USING gin(target_employee_ids);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_templates TO authenticated;
GRANT ALL ON public.form_templates TO service_role;

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read active system templates
CREATE POLICY "Anyone can read active system templates"
  ON public.form_templates FOR SELECT TO authenticated
  USING (is_system = true AND is_active = true AND is_deleted = false);

-- Team can read company templates
CREATE POLICY "Team can read company templates"
  ON public.form_templates FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND is_team_member(auth.uid(), user_id));

-- Team admins can manage company templates
CREATE POLICY "Team admins can insert company templates"
  ON public.form_templates FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NOT NULL
    AND is_team_member(auth.uid(), user_id)
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
  );

CREATE POLICY "Team admins can update company templates"
  ON public.form_templates FOR UPDATE TO authenticated
  USING (
    user_id IS NOT NULL
    AND is_team_member(auth.uid(), user_id)
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
  );

CREATE POLICY "Team admins can delete company templates"
  ON public.form_templates FOR DELETE TO authenticated
  USING (
    user_id IS NOT NULL
    AND is_team_member(auth.uid(), user_id)
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- updated_at trigger
CREATE TRIGGER trg_form_templates_updated_at
  BEFORE UPDATE ON public.form_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Extend employee_forms
-- =====================================================
ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.form_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text;

CREATE INDEX IF NOT EXISTS idx_employee_forms_template ON public.employee_forms(template_id) WHERE template_id IS NOT NULL;

-- =====================================================
-- Helper: is template assigned to employee?
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_template_assigned_to_employee(
  _template_id uuid,
  _employee_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM form_templates t, employees e, job_titles jt
    WHERE t.id = _template_id
      AND e.id = _employee_id
      AND t.is_active = true AND t.is_deleted = false
      AND (
        _employee_id = ANY(t.target_employee_ids)
        OR (
          e.job_title_id = jt.id
          AND jt.name = ANY(t.target_job_title_names)
        )
        OR (
          e.job_title IS NOT NULL
          AND e.job_title = ANY(t.target_job_title_names)
        )
      )
  );
$$;

-- =====================================================
-- Seed: "Quarterly Marketing Plan" system template
-- =====================================================
INSERT INTO public.form_templates (id, is_system, name, description, category, target_job_title_names, frequency, reviewer_role, schema)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  true,
  'الخطة التسويقية الربعية',
  'نموذج إعداد الخطة التسويقية الربعية لسلسلة المطاعم — يُعبأ من قبل مدير التسويق كل ربع سنة.',
  'marketing',
  ARRAY['مدير التسويق','Marketing Manager','مدير تسويق'],
  'quarterly',
  'admin',
  $json${
    "sections":[
      {"key":"period","title":"الفترة","type":"fields","fields":[
        {"key":"from","label":"من تاريخ","type":"date","required":true},
        {"key":"to","label":"إلى تاريخ","type":"date","required":true},
        {"key":"prepared_by","label":"إعداد (مدير التسويق)","type":"text","required":true}
      ]},
      {"key":"campaigns","title":"أولاً: الحملات التسويقية الشهرية","type":"repeater","item_label":"حملة","fields":[
        {"key":"month","label":"الشهر","type":"select","options":["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]},
        {"key":"title","label":"عنوان الحملة","type":"text"},
        {"key":"occasion","label":"المناسبة","type":"text"},
        {"key":"goal","label":"الهدف","type":"textarea"},
        {"key":"notes","label":"ملاحظات","type":"textarea"}
      ]},
      {"key":"promotions","title":"ثانياً: العروض الترويجية","type":"repeater","item_label":"عرض","fields":[
        {"key":"name","label":"اسم العرض","type":"text"},
        {"key":"occasion","label":"المناسبة","type":"text"},
        {"key":"period","label":"فترة التنفيذ","type":"text"},
        {"key":"components","label":"المكونات","type":"textarea"},
        {"key":"price_before","label":"السعر قبل العرض","type":"number"},
        {"key":"price_after","label":"السعر بعد العرض","type":"number"},
        {"key":"channels","label":"آليات الترويج","type":"textarea"}
      ]},
      {"key":"contests","title":"ثالثاً: المسابقات","type":"repeater","item_label":"مسابقة","fields":[
        {"key":"name","label":"اسم المسابقة","type":"text"},
        {"key":"occasion","label":"المناسبة","type":"text"},
        {"key":"duration","label":"المدة","type":"text"},
        {"key":"prize","label":"الجائزة","type":"text"},
        {"key":"channels","label":"مواقع النشر","type":"text"},
        {"key":"goal","label":"الهدف","type":"textarea"}
      ]},
      {"key":"community","title":"رابعاً: خدمة مجتمعية","type":"repeater","item_label":"نشاط","fields":[
        {"key":"organization","label":"المؤسسة","type":"text"},
        {"key":"idea","label":"الفكرة","type":"textarea"},
        {"key":"documentation","label":"التوثيق","type":"text"},
        {"key":"date","label":"الموعد","type":"date"},
        {"key":"goal","label":"الهدف","type":"text"}
      ]},
      {"key":"kids_events","title":"خامساً: فعاليات الأطفال","type":"repeater","item_label":"فعالية","fields":[
        {"key":"name","label":"اسم الفعالية","type":"text"},
        {"key":"place","label":"المكان","type":"text"},
        {"key":"date","label":"التاريخ","type":"date"},
        {"key":"media","label":"التوثيق الإعلامي","type":"text"},
        {"key":"channels","label":"وسائل الترويج","type":"text"},
        {"key":"budget","label":"الميزانية","type":"number"}
      ]},
      {"key":"influencers","title":"سادساً: المؤثرون","type":"repeater","item_label":"مؤثر","fields":[
        {"key":"name","label":"اسم المؤثر","type":"text"},
        {"key":"idea","label":"الفكرة","type":"textarea"},
        {"key":"posts_count","label":"عدد المنشورات","type":"number"},
        {"key":"date","label":"تاريخ التنفيذ","type":"date"},
        {"key":"cost","label":"التكلفة","type":"number"},
        {"key":"expected","label":"النتائج المتوقعة","type":"textarea"}
      ]},
      {"key":"videos","title":"سابعاً: الفيديوهات الاحترافية","type":"repeater","item_label":"فيديو","fields":[
        {"key":"idea","label":"فكرة الفيديو","type":"textarea"},
        {"key":"producer","label":"الجهة المنفذة","type":"text"},
        {"key":"production_date","label":"موعد الإنتاج","type":"date"},
        {"key":"publish_date","label":"موعد النشر","type":"date"},
        {"key":"goal","label":"الهدف","type":"text"}
      ]},
      {"key":"apps","title":"ثامناً: التطبيقات","type":"repeater","item_label":"حملة تطبيق","fields":[
        {"key":"app","label":"التطبيق","type":"select","options":["تلبينات","طلبات","هنقرستيشن","كريم","أخرى"]},
        {"key":"campaign","label":"اسم الحملة","type":"text"},
        {"key":"duration","label":"المدة","type":"text"},
        {"key":"details","label":"تفاصيل الحملة","type":"textarea"},
        {"key":"cost","label":"التكلفة","type":"number"}
      ]},
      {"key":"radio","title":"تاسعاً: الإذاعات","type":"repeater","item_label":"إذاعة","fields":[
        {"key":"station","label":"اسم الإذاعة","type":"text"},
        {"key":"duration","label":"مدة الحملة","type":"text"},
        {"key":"ads_count","label":"عدد الإعلانات","type":"number"},
        {"key":"cost","label":"التكلفة","type":"number"}
      ]},
      {"key":"media","title":"عاشراً: وسائل الإعلام","type":"repeater","item_label":"وسيلة","fields":[
        {"key":"media","label":"الوسيلة الإعلامية","type":"text"},
        {"key":"title","label":"عنوان المادة","type":"text"},
        {"key":"duration","label":"مدة النشر","type":"text"},
        {"key":"cost","label":"التكلفة","type":"number"},
        {"key":"goal","label":"الهدف","type":"text"}
      ]},
      {"key":"social_videos","title":"الحادي عشر: مواقع التواصل — الفيديوهات","type":"repeater","item_label":"فيديو","fields":[
        {"key":"idea","label":"الفكرة","type":"textarea"},
        {"key":"publish_date","label":"تاريخ النشر","type":"date"},
        {"key":"platform","label":"المنصة","type":"select","options":["فيسبوك","انستجرام","تيك توك","يوتيوب","سناب شات","تويتر/X","ثريدز","لينكدإن"]},
        {"key":"funded","label":"ممول/غير ممول","type":"select","options":["ممول","غير ممول"]}
      ]},
      {"key":"social_designs","title":"الحادي عشر: مواقع التواصل — التصاميم","type":"repeater","item_label":"تصميم","fields":[
        {"key":"idea","label":"الفكرة","type":"textarea"},
        {"key":"publish_date","label":"تاريخ النشر","type":"date"},
        {"key":"platform","label":"المنصة","type":"select","options":["فيسبوك","انستجرام","تيك توك","يوتيوب","سناب شات","تويتر/X","ثريدز","لينكدإن"]},
        {"key":"funded","label":"ممول/غير ممول","type":"select","options":["ممول","غير ممول"]}
      ]},
      {"key":"companies","title":"الثاني عشر: الشركات والمؤسسات المستهدفة","type":"repeater","item_label":"شركة","fields":[
        {"key":"name","label":"اسم الشركة أو المؤسسة","type":"text"},
        {"key":"approach","label":"آلية الاستهداف","type":"textarea"},
        {"key":"responsible","label":"المسؤول","type":"text"},
        {"key":"date","label":"موعد التنفيذ","type":"date"}
      ]},
      {"key":"indoor_screens","title":"الثالث عشر: الشاشات الداخلية","type":"repeater","item_label":"شاشة","fields":[
        {"key":"idea","label":"الفكرة","type":"text"},
        {"key":"branch","label":"الفرع","type":"text"},
        {"key":"duration","label":"مدة العرض","type":"text"},
        {"key":"goal","label":"الهدف","type":"text"}
      ]},
      {"key":"iso","title":"الرابع عشر: استثمار شهادة ISO 22000","type":"repeater","item_label":"نشاط","fields":[
        {"key":"idea","label":"الفكرة","type":"textarea"},
        {"key":"approach","label":"آلية التنفيذ","type":"textarea"},
        {"key":"publish_date","label":"موعد النشر","type":"date"},
        {"key":"platform","label":"المنصة","type":"text"}
      ]},
      {"key":"creative_ideas","title":"الخامس عشر: 5 أفكار إبداعية جديدة","type":"repeater","item_label":"فكرة","min_items":5,"fields":[
        {"key":"idea","label":"الفكرة","type":"textarea","required":true}
      ]},
      {"key":"budget","title":"السادس عشر: الميزانية","type":"repeater","item_label":"بند","fields":[
        {"key":"item","label":"البند","type":"select","options":["الحملات","المؤثرون","الإذاعات","الإعلام","الفعاليات","الإنتاج المرئي","أخرى"]},
        {"key":"cost","label":"التكلفة المتوقعة","type":"number"}
      ]},
      {"key":"closing_report","title":"السابع عشر: التقرير الختامي","type":"fields","fields":[
        {"key":"executed","label":"ما تم تنفيذه","type":"textarea"},
        {"key":"not_executed","label":"ما لم يتم تنفيذه وأسبابه","type":"textarea"},
        {"key":"results","label":"النتائج بالأرقام","type":"textarea"},
        {"key":"comparison","label":"مقارنة النتائج بالأهداف","type":"textarea"},
        {"key":"recommendations","label":"التوصيات للربع القادم","type":"textarea"}
      ]},
      {"key":"approval","title":"اعتماد الخطة","type":"fields","fields":[
        {"key":"marketing_manager","label":"مدير التسويق","type":"text","required":true},
        {"key":"operations_manager","label":"مدير العمليات","type":"text"},
        {"key":"general_manager","label":"المدير العام","type":"text"},
        {"key":"date","label":"التاريخ","type":"date","required":true}
      ]}
    ]
  }$json$::jsonb
);

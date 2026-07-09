
-- ============================================================
-- Amwali Quotations Module (Super Admin only)
-- ============================================================

-- Pricing type enum
DO $$ BEGIN
  CREATE TYPE public.amwali_pricing_type AS ENUM (
    'fixed', 'per_pos', 'per_kiosk', 'per_hr_employee',
    'per_crm_user', 'per_system_user', 'annual_only', 'onetime_only', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.amwali_quotation_status AS ENUM ('draft', 'approved', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shared updated_at trigger fn (safe if already exists)
CREATE OR REPLACE FUNCTION public.amwali_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

-- ============================================================
-- 1) Settings singleton
-- ============================================================
CREATE TABLE IF NOT EXISTS public.amwali_quotation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  currency TEXT NOT NULL DEFAULT 'USD',
  validity_days INTEGER NOT NULL DEFAULT 15,
  default_tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  default_discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  intro_text TEXT NOT NULL DEFAULT 'يسر شركة أموالي تقديم عرض السعر التالي للاشتراك في خدمات ومنتجات نظام أموالي المحاسبي والإداري، وذلك وفق البنود والأسعار والشروط الموضحة أدناه.',
  terms_text TEXT NOT NULL DEFAULT '• الأسعار لا تشمل ضريبة القيمة المضافة إن وُجدت.
• رسوم التفعيل «لمرة واحدة» تُدفع عند بدء المشروع أو التفعيل.
• الاشتراك السنوي يُسدَّد مقدماً في بداية كل سنة اشتراك.
• عرض السعر ساري لمدة 15 يوماً من تاريخه ما لم يُذكر خلاف ذلك.
• أي مستخدم أو نقطة بيع أو نقطة كيوسك إضافية تُحتسب وفق نفس التسعير الموضح في العرض.
• موظفو HR لا يُعتبرون مستخدمين للنظام، ويُحتسبون فقط كعدد موظفين داخل نظام الموارد البشرية.
• التكاملات المعقدة مع الجهات الخارجية يتم تسعيرها بعرض منفصل بعد دراسة نطاق العمل.
• الدعم الفني لا يشمل التطويرات الجديدة أو التعديلات الكبيرة أو إدخال البيانات.
• الأجهزة والطابعات والشاشات والشبكات والتجهيزات لا تدخل ضمن السعر إلا إذا أُضيفت كبنود منفصلة.
• أي تدريب إضافي أو زيارات ميدانية يمكن تسعيرها كبند منفصل.
• نقل البيانات من أنظمة قديمة يتم تقييمه وتسعيره حسب حجم البيانات وجودتها.',
  support_policy_text TEXT NOT NULL DEFAULT 'سياسة الدعم الفني وأوقات الرد (SLA):

الدعم الفني السنوي يشمل استقبال البلاغات، متابعة المشاكل التشغيلية، المساعدة في الاستخدام، التحقق من الأخطاء، وتوجيه المستخدمين. لا يشمل تطوير خصائص جديدة، تعديلات برمجية كبيرة، تكاملات معقدة، إدخال بيانات، أو تغيير جوهري في طريقة عمل النظام إلا إذا اتُّفق عليها كبند منفصل.

قنوات الدعم:
• WhatsApp Business أو رقم الدعم المعتمد.
• البريد الإلكتروني.
• نظام تذاكر الدعم (Ticketing) إن وُجد.
• مكالمة هاتفية للحالات الطارئة فقط.

أوقات العمل الرسمية للدعم: الأحد – الخميس، 9:00 ص إلى 5:00 م بتوقيت فلسطين. لا يشمل الجمعة والعطل الرسمية إلا للحالات الحرجة.

تصنيف الأولويات وأوقات الرد الأولي:
• Priority 1 – حرجة جداً (توقف نظام/كاشير/فوترة): 2 ساعات عمل.
• Priority 2 – عالية (خلل يؤثر على فرع/قسم/تقارير مهمة): 4 ساعات عمل.
• Priority 3 – متوسطة (شاشة فرعية/صلاحية/استفسار): 1 يوم عمل.
• Priority 4 – بسيطة/تحسين/اقتراح: 2 يوم عمل.

أوقات الرد أعلاه هي أوقات استجابة أولية وليست ضماناً لحل نهائي خلال نفس المدة، لأن وقت الحل يعتمد على طبيعة المشكلة وتوفر المعلومات وتعاون العميل.',
  signature_text TEXT NOT NULL DEFAULT 'إن بنود هذا العرض قُرئت وأُفهمت للطرفين، وتم التوقيع بعون الله في نسختين بيد كل طرف نسخة.',
  footer_text TEXT NOT NULL DEFAULT 'أموالي — حلول محاسبية وإدارية ذكية · www.amwali.app',
  colors JSONB NOT NULL DEFAULT '{"primary":"#0D1B2E","accent":"#1B3A5C"}'::jsonb,
  logo_url TEXT,
  small_customizations_included_hours NUMERIC(6,2) NOT NULL DEFAULT 5,
  small_customizations_extra_hour_price NUMERIC(14,2) NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amwali_quotation_settings TO authenticated;
GRANT ALL ON public.amwali_quotation_settings TO service_role;
ALTER TABLE public.amwali_quotation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages amwali settings"
  ON public.amwali_quotation_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_amwali_settings_touch
  BEFORE UPDATE ON public.amwali_quotation_settings
  FOR EACH ROW EXECUTE FUNCTION public.amwali_touch_updated_at();

-- Seed the singleton row
INSERT INTO public.amwali_quotation_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- ============================================================
-- 2) Catalog items (template of default items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.amwali_quotation_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pricing_type public.amwali_pricing_type NOT NULL DEFAULT 'fixed',
  onetime_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  default_qty NUMERIC(14,2) NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amwali_quotation_catalog_items TO authenticated;
GRANT ALL ON public.amwali_quotation_catalog_items TO service_role;
ALTER TABLE public.amwali_quotation_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages amwali catalog"
  ON public.amwali_quotation_catalog_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_amwali_catalog_touch
  BEFORE UPDATE ON public.amwali_quotation_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.amwali_touch_updated_at();

-- Seed default catalog items (13)
INSERT INTO public.amwali_quotation_catalog_items
  (code, name, description, pricing_type, onetime_price, annual_price, default_qty, sort_order)
VALUES
  ('ACCOUNTING',      'نظام المحاسبة',                                    'اشتراك النظام المحاسبي الأساسي — لمرة واحدة + اشتراك سنوي.',                                        'fixed',            500,  350, 1,  10),
  ('POS',             'نقطة البيع POS',                                    'يُحتسب لكل نقطة بيع.',                                                                              'per_pos',          300,  100, 1,  20),
  ('HR_BASE',         'نظام الموارد البشرية HR — الأساسي',                'تفعيل نظام HR لمرة واحدة (مستقل عن عدد الموظفين ومستخدمي النظام).',                                'onetime_only',    1500,    0, 1,  30),
  ('HR_EMPLOYEE',     'موظفو HR (لكل موظف سنوياً)',                        'يُحتسب لكل موظف داخل نظام HR فقط — لا يعتبرون مستخدمين للنظام.',                                    'per_hr_employee',    0,   10, 0,  31),
  ('CRM_BASE',        'الكول سنتر ومتابعة الزبائن CRM — الأساسي',         'تفعيل نظام CRM/الكول سنتر لمرة واحدة.',                                                             'onetime_only',     500,    0, 1,  40),
  ('CRM_USER',        'مستخدمو CRM (لكل مستخدم سنوياً)',                   'يُحتسب لكل مستخدم لديه صلاحية دخول على CRM.',                                                       'per_crm_user',       0,   50, 0,  41),
  ('KIOSK',           'نظام الكيوسك Kiosk',                                'يُحتسب لكل نقطة كيوسك. الأجهزة والشاشات والطابعات غير مشمولة إلا كبند منفصل.',                     'per_kiosk',        500,  150, 1,  50),
  ('INTERNAL_MGMT',   'إدارة النظام الداخلي والنماذج والربط بين الأقسام', 'اشتراك سنوي فقط — يشمل إدارة النماذج والصلاحيات والربط الداخلي وتحديثات النماذج القياسية.',        'annual_only',        0,  500, 1,  60),
  ('API_INT',         'التكاملات والروابط API ومع الجهات الخارجية',        'اشتراك سنوي — يشمل مفاتيح API والربط القياسي والتكاملات البسيطة الجاهزة. التكاملات المعقدة تُسعَّر بعرض منفصل.', 'annual_only',    0, 1000, 1,  70),
  ('SUPPORT',         'الدعم الفني السنوي',                                'دعم فني متكامل وفق سياسة SLA الموضحة في الشروط.',                                                    'annual_only',        0, 2000, 1,  80),
  ('COST_CENTERS',    'مراكز التكلفة والتحليل المالي (اختياري)',           'تفعيل مراكز التكلفة وربطها بالحسابات والفروع والمصاريف والإيرادات والتقارير.',                       'fixed',            300,  200, 1,  90),
  ('PRODUCTION',      'معادلة الإنتاج والتصنيع (اختياري)',                 'إعداد وصفات الإنتاج، مكونات المنتج، تكلفة المواد، الهدر، والتحويل إلى منتج جاهز.',                   'fixed',            500,  300, 1, 100),
  ('SMALL_CUSTOM',    'باقة تعديلات صغيرة (اختياري)',                      'تعديلات بسيطة سنوية (نص/حقل/فلتر/طباعة). لا تشمل بناء موديول جديد أو تكامل خارجي أو تعديلات محاسبية.', 'fixed',            0,  400, 1, 110)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3) Quotation number generator
-- ============================================================
CREATE TABLE IF NOT EXISTS public.amwali_quotation_sequences (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amwali_quotation_sequences TO authenticated;
GRANT ALL ON public.amwali_quotation_sequences TO service_role;
ALTER TABLE public.amwali_quotation_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin reads amwali sequences" ON public.amwali_quotation_sequences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.next_amwali_quote_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM now())::int;
  n INTEGER;
BEGIN
  INSERT INTO public.amwali_quotation_sequences (year, last_number)
  VALUES (y, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = amwali_quotation_sequences.last_number + 1
  RETURNING last_number INTO n;
  RETURN 'QUO-' || y::text || '-' || LPAD(n::text, 3, '0');
END; $$;

-- ============================================================
-- 4) Quotations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.amwali_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE,
  status public.amwali_quotation_status NOT NULL DEFAULT 'draft',
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Customer
  customer_name TEXT,
  company_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  internal_notes TEXT,

  -- Independent counters
  pos_points INTEGER NOT NULL DEFAULT 0,
  kiosk_points INTEGER NOT NULL DEFAULT 0,
  hr_employees INTEGER NOT NULL DEFAULT 0,
  crm_users INTEGER NOT NULL DEFAULT 0,
  system_users INTEGER NOT NULL DEFAULT 0,

  -- Totals
  subtotal_onetime NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_annual NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Snapshots of settings texts at time of save
  intro_text TEXT,
  terms_text TEXT,
  support_policy_text TEXT,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amwali_quotations_status ON public.amwali_quotations(status);
CREATE INDEX IF NOT EXISTS idx_amwali_quotations_date ON public.amwali_quotations(quote_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amwali_quotations TO authenticated;
GRANT ALL ON public.amwali_quotations TO service_role;
ALTER TABLE public.amwali_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages amwali quotations"
  ON public.amwali_quotations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_amwali_quotations_touch
  BEFORE UPDATE ON public.amwali_quotations
  FOR EACH ROW EXECUTE FUNCTION public.amwali_touch_updated_at();

-- ============================================================
-- 5) Quotation items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.amwali_quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.amwali_quotations(id) ON DELETE CASCADE,
  catalog_code TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pricing_type public.amwali_pricing_type NOT NULL DEFAULT 'fixed',
  qty NUMERIC(14,2) NOT NULL DEFAULT 1,
  onetime_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_onetime NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_annual NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amwali_items_quotation ON public.amwali_quotation_items(quotation_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amwali_quotation_items TO authenticated;
GRANT ALL ON public.amwali_quotation_items TO service_role;
ALTER TABLE public.amwali_quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages amwali items"
  ON public.amwali_quotation_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

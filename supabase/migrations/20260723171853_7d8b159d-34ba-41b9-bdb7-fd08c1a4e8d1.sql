INSERT INTO public.form_templates (id, name, description, category, schema, frequency, target_job_title_names, target_employee_ids, is_active, is_system, user_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'نموذج إدارة وتنفيذ وتقييم الفعاليات والأنشطة',
  'FM-MKT-001 — دورة حياة الفعاليات: التخطيط، التنفيذ، القياس، والتقرير الختامي.',
  'marketing',
  $json${
    "sections": [
      {
        "key": "basic",
        "type": "fields",
        "title": "أولاً: البيانات الأساسية",
        "fields": [
          {"key": "event_name", "type": "text", "label": "اسم الفعالية", "required": true},
          {"key": "ref_number", "type": "text", "label": "الرقم المرجعي"},
          {"key": "event_type", "type": "select", "label": "نوع الفعالية", "options": ["معرض","مهرجان","رعاية","افتتاح","نشاط مجتمعي","ترويج داخلي","أخرى"]},
          {"key": "participation", "type": "select", "label": "طبيعة المشاركة", "options": ["تنظيم كامل","مشاركة بجناح","رعاية","دعم عيني","حضور رمزي"]},
          {"key": "organizer", "type": "text", "label": "الجهة المنظمة"},
          {"key": "organizer_contact", "type": "text", "label": "جهة الاتصال ورقم التواصل"},
          {"key": "location", "type": "text", "label": "المكان"},
          {"key": "branch", "type": "select", "label": "الفرع المعني", "options": ["سفيان","فيصل","المركزي","رام الله - الطيرة","جميع الفروع"]},
          {"key": "date", "type": "date", "label": "التاريخ"},
          {"key": "start_time", "type": "text", "label": "وقت البداية"},
          {"key": "end_time", "type": "text", "label": "وقت النهاية"},
          {"key": "expected_attendees", "type": "number", "label": "العدد المتوقع للحضور"},
          {"key": "event_owner", "type": "text", "label": "مسؤول الفعالية"},
          {"key": "total_budget", "type": "number", "label": "الموازنة التقديرية (شيكل)"},
          {"key": "status", "type": "select", "label": "حالة الطلب", "options": ["قيد الدراسة","معتمد","معتمد بتحفظ","مرفوض","مؤجل"]}
        ]
      },
      {
        "key": "rationale",
        "type": "fields",
        "title": "ثانياً: الفكرة والمبررات",
        "fields": [
          {"key": "idea", "type": "textarea", "label": "فكرة الفعالية ووصفها"},
          {"key": "justification", "type": "textarea", "label": "مبررات المشاركة والقيمة المضافة"},
          {"key": "target_audience", "type": "text", "label": "الفئة المستهدفة"},
          {"key": "key_message", "type": "text", "label": "الرسالة التسويقية الرئيسية"},
          {"key": "hashtag", "type": "text", "label": "الشعار / الوسم"},
          {"key": "promo_offer", "type": "text", "label": "العرض الترويجي المرافق"}
        ]
      },
      {
        "key": "objectives",
        "type": "repeater",
        "title": "ثالثاً: الأهداف ومؤشرات القياس",
        "item_label": "هدف",
        "fields": [
          {"key": "objective", "type": "text", "label": "الهدف"},
          {"key": "kpi", "type": "text", "label": "مؤشر القياس"},
          {"key": "target", "type": "text", "label": "القيمة المستهدفة"}
        ]
      },
      {
        "key": "alternatives",
        "type": "repeater",
        "title": "رابعاً: البدائل المدروسة",
        "item_label": "بديل",
        "fields": [
          {"key": "alternative", "type": "text", "label": "البديل"},
          {"key": "cost", "type": "number", "label": "الكلفة التقديرية"},
          {"key": "reason", "type": "text", "label": "سبب الاستبعاد"}
        ]
      },
      {
        "key": "risks",
        "type": "repeater",
        "title": "خامساً: المخاطر وخطة الاستجابة",
        "item_label": "خطر",
        "fields": [
          {"key": "risk", "type": "text", "label": "وصف الخطر"},
          {"key": "score", "type": "select", "label": "الدرجة", "options": ["منخفض","متوسط","عالٍ","حرج"]},
          {"key": "mitigation", "type": "text", "label": "إجراء التخفيف"},
          {"key": "owner", "type": "text", "label": "المسؤول"}
        ]
      },
      {
        "key": "logistics",
        "type": "fields",
        "title": "سادساً: اللوجستيات والتصاريح",
        "fields": [
          {"key": "permits", "type": "textarea", "label": "التصاريح المطلوبة"},
          {"key": "equipment", "type": "textarea", "label": "المعدات والتجهيزات"},
          {"key": "setup_time", "type": "text", "label": "مدة التجهيز المسبق"},
          {"key": "food_safety", "type": "textarea", "label": "متطلبات سلامة الغذاء"}
        ]
      },
      {
        "key": "team",
        "type": "repeater",
        "title": "سابعاً: فريق العمل",
        "item_label": "عضو",
        "fields": [
          {"key": "name", "type": "text", "label": "الاسم"},
          {"key": "role", "type": "text", "label": "الدور"},
          {"key": "contact", "type": "text", "label": "رقم التواصل"}
        ]
      },
      {
        "key": "checklist",
        "type": "repeater",
        "title": "ثامناً: قائمة تنفيذ",
        "item_label": "مهمة",
        "fields": [
          {"key": "task", "type": "text", "label": "المهمة"},
          {"key": "owner", "type": "text", "label": "المسؤول"},
          {"key": "due", "type": "date", "label": "تاريخ الاستحقاق"},
          {"key": "status", "type": "select", "label": "الحالة", "options": ["لم يبدأ","جاري","منجز","متأخر"]}
        ]
      },
      {
        "key": "budget",
        "type": "repeater",
        "title": "تاسعاً: الموازنة التفصيلية",
        "item_label": "بند",
        "fields": [
          {"key": "item", "type": "text", "label": "البند"},
          {"key": "estimated", "type": "number", "label": "تقديري"},
          {"key": "actual", "type": "number", "label": "فعلي"},
          {"key": "notes", "type": "text", "label": "ملاحظات"}
        ]
      },
      {
        "key": "results",
        "type": "fields",
        "title": "عاشراً: نتائج الفعالية",
        "fields": [
          {"key": "actual_attendees", "type": "number", "label": "عدد الحضور الفعلي"},
          {"key": "sales", "type": "number", "label": "المبيعات المحققة (شيكل)"},
          {"key": "leads", "type": "number", "label": "عدد العملاء الجدد"},
          {"key": "social_reach", "type": "number", "label": "الوصول على السوشيال"},
          {"key": "media_coverage", "type": "textarea", "label": "التغطية الإعلامية"}
        ]
      },
      {
        "key": "closing_report",
        "type": "fields",
        "title": "الحادي عشر: التقرير الختامي والدروس المستفادة",
        "fields": [
          {"key": "achievements", "type": "textarea", "label": "أهم الإنجازات"},
          {"key": "challenges", "type": "textarea", "label": "التحديات"},
          {"key": "lessons", "type": "textarea", "label": "الدروس المستفادة"},
          {"key": "recommendations", "type": "textarea", "label": "التوصيات للفعاليات القادمة"}
        ]
      },
      {
        "key": "approval",
        "type": "fields",
        "title": "اعتماد النموذج",
        "fields": [
          {"key": "prepared_by", "type": "text", "label": "أُعدّ بواسطة", "required": true},
          {"key": "reviewed_by", "type": "text", "label": "روجع بواسطة"},
          {"key": "approved_by", "type": "text", "label": "اعتُمد بواسطة"},
          {"key": "approval_date", "type": "date", "label": "تاريخ الاعتماد"}
        ]
      }
    ]
  }$json$::jsonb,
  'once',
  ARRAY[]::text[],
  ARRAY[]::uuid[],
  true,
  true,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    schema = EXCLUDED.schema,
    is_active = true;
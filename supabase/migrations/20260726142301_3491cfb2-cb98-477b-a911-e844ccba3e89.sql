UPDATE public.form_templates
SET schema = '{
  "sections": [
    {
      "key": "header",
      "type": "fields",
      "title": "بيانات التقرير",
      "fields": [
        {"key":"report_date","type":"date","label":"التاريخ","required":true},
        {"key":"branch","type":"text","label":"الفرع","required":true},
        {"key":"shift","type":"select","label":"الوردية","options":["صباحي","مسائي","يوم كامل"],"required":true},
        {"key":"shift_supervisor","type":"text","label":"مشرف الوردية","required":true},
        {"key":"quality_manager","type":"text","label":"مدير الجودة"}
      ]
    },
    {
      "key": "receiving",
      "type": "repeater",
      "title": "استلام المواد الأولية (OPT-02)",
      "item_label": "صنف مستلم",
      "fields": [
        {"key":"supplier","label":"المورد","type":"text"},
        {"key":"item","label":"الصنف","type":"text"},
        {"key":"quantity","label":"الكمية","type":"number"},
        {"key":"unit","label":"الوحدة","type":"text"},
        {"key":"receive_temp","label":"حرارة الاستلام °C","type":"number"},
        {"key":"production_date","label":"تاريخ الإنتاج","type":"date"},
        {"key":"expiry_date","label":"تاريخ الانتهاء","type":"date"},
        {"key":"packaging","label":"حالة التغليف","type":"select","options":["سليم","تالف"]},
        {"key":"decision","label":"القرار","type":"select","options":["مقبول","مرفوض"]},
        {"key":"reject_reason","label":"سبب الرفض","type":"text"}
      ]
    },
    {
      "key": "production",
      "type": "repeater",
      "title": "إدارة الإنتاج (OPT-01)",
      "item_label": "وجبة/منتج",
      "fields": [
        {"key":"meal","label":"الوجبة/المنتج","type":"text"},
        {"key":"planned_qty","label":"الكمية المخططة","type":"number"},
        {"key":"actual_qty","label":"الكمية الفعلية","type":"number"},
        {"key":"cook_temp","label":"حرارة الطهي °C","type":"number"},
        {"key":"cook_time","label":"وقت الطهي","type":"text"},
        {"key":"cool_temp","label":"حرارة التبريد °C","type":"number"},
        {"key":"batch_no","label":"رقم الدفعة (Batch)","type":"text"},
        {"key":"pack_time","label":"وقت التعبئة","type":"text"},
        {"key":"dispatch_temp","label":"حرارة التسليم للتوصيل °C","type":"number"}
      ]
    },
    {
      "key": "cold_storage",
      "type": "repeater",
      "title": "ضبط المخازن ووحدات التبريد",
      "item_label": "وحدة تبريد",
      "fields": [
        {"key":"unit","label":"الوحدة (ثلاجة/فريزر)","type":"text"},
        {"key":"morning_reading","label":"القراءة الصباحية °C","type":"number"},
        {"key":"evening_reading","label":"القراءة المسائية °C","type":"number"},
        {"key":"allowed_range","label":"الحد المسموح","type":"text"},
        {"key":"corrective_action","label":"إجراء تصحيحي","type":"text"}
      ]
    },
    {
      "key": "lab_tests",
      "type": "repeater",
      "title": "الفحوص المخبرية (OPT-03)",
      "item_label": "فحص مخبري",
      "fields": [
        {"key":"sample_type","label":"نوع العينة","type":"text"},
        {"key":"test_type","label":"نوع الفحص","type":"text"},
        {"key":"result","label":"النتيجة","type":"text"},
        {"key":"allowed_limit","label":"الحد المسموح","type":"text"},
        {"key":"deviation","label":"الانحراف","type":"text"},
        {"key":"corrective_action","label":"الإجراء التصحيحي","type":"text"}
      ]
    },
    {
      "key": "non_conformity",
      "type": "repeater",
      "title": "الإجراءات التصحيحية وعدم المطابقة",
      "item_label": "حالة عدم مطابقة",
      "fields": [
        {"key":"description","label":"وصف عدم المطابقة","type":"textarea"},
        {"key":"root_cause","label":"السبب الجذري","type":"text"},
        {"key":"action","label":"الإجراء","type":"text"},
        {"key":"responsible","label":"المسؤول","type":"text"},
        {"key":"status","label":"الحالة","type":"select","options":["مفتوح","مغلق"]}
      ]
    },
    {
      "key": "kpis",
      "type": "fields",
      "title": "مؤشرات الأداء اليومية (KPI)",
      "fields": [
        {"key":"receive_match_pct","type":"number","label":"نسبة المطابقة بالاستلام %"},
        {"key":"on_time_delivery_pct","type":"number","label":"نسبة الوجبات المسلّمة بالوقت %"},
        {"key":"quality_complaints","type":"number","label":"عدد شكاوى الجودة"},
        {"key":"production_waste","type":"number","label":"هدر الإنتاج (كغم/ش.إ)"}
      ]
    },
    {
      "key": "approval",
      "type": "fields",
      "title": "الاعتماد",
      "fields": [
        {"key":"supervisor_confirm","type":"checkbox","label":"تأكيد مشرف الوردية"},
        {"key":"quality_confirm","type":"checkbox","label":"تأكيد مدير الجودة"},
        {"key":"gm_notes","type":"textarea","label":"ملاحظات المدير العام"}
      ]
    }
  ]
}'::jsonb,
updated_at = now()
WHERE is_system = true AND name = 'إدارة العمليات والتتبع اليومي';
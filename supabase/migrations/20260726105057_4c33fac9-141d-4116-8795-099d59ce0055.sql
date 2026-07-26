UPDATE public.form_templates
SET schema = jsonb_build_object(
  'sections', jsonb_build_array(
    jsonb_build_object(
      'key', 'daily_summary',
      'title', 'ملخص إنجاز اليوم',
      'type', 'fields',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'accomplishments', 'label', 'ماذا أنجزت اليوم؟', 'type', 'textarea')
      )
    )
  )
),
updated_at = now()
WHERE id = 'fb97095a-eaf2-442d-81be-72e2568efe74';
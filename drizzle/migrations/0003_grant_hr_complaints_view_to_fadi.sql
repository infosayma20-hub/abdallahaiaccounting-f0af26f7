-- منح فادي (الموارد البشرية) صلاحية مشاهدة شكاوى الموارد فقط.
-- شكاوى الإدارة العليا تبقى محجوبة عنه (can_view_executive_complaints = false).
UPDATE public.hr_manager_permissions
SET can_view_complaints = true
WHERE hr_auth_id = '65e3ed73-36a0-4487-80d9-6390ae8288da'
  AND can_view_executive_complaints = false;
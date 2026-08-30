CREATE OR REPLACE FUNCTION public.can_access_employee_doc_object(_user_id uuid, _path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp_id uuid;
  _owner uuid;
BEGIN
  BEGIN
    _emp_id := (string_to_array(_path, '/'))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  SELECT COALESCE(e.user_id, e.auth_user_id) INTO _owner
  FROM public.employees e WHERE e.id = _emp_id;

  IF public.is_own_employee_row(_user_id, _emp_id) THEN
    RETURN true;
  END IF;

  RETURN public.can_manage_employee_documents(_user_id, _owner);
END;
$$;

CREATE POLICY "employee_docs_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-documents' AND public.can_access_employee_doc_object((SELECT auth.uid()), name));

CREATE POLICY "employee_docs_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-documents' AND public.can_access_employee_doc_object((SELECT auth.uid()), name));

CREATE POLICY "employee_docs_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-documents' AND public.can_access_employee_doc_object((SELECT auth.uid()), name))
WITH CHECK (bucket_id = 'employee-documents' AND public.can_access_employee_doc_object((SELECT auth.uid()), name));

CREATE POLICY "employee_docs_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'employee-documents' AND public.can_access_employee_doc_object((SELECT auth.uid()), name));
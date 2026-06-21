ALTER TABLE public.pos_users
  ADD COLUMN IF NOT EXISTS hide_employee_workspace boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pos_users.hide_employee_workspace IS
  'When true, hide the Employee workspace card on ChooseWorkspacePage for this auth user. Used for shared call-center company accounts that should never enter the employee workspace.';

UPDATE public.pos_users
   SET hide_employee_workspace = true
 WHERE id = 'a20512c0-7f2d-45b4-85c0-41ea1228a875';
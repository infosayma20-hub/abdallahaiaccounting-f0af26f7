
-- Task users table (separate auth)
CREATE TABLE public.task_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name varchar NOT NULL,
  username varchar NOT NULL,
  password_hash varchar NOT NULL,
  role varchar DEFAULT 'staff',
  avatar_color varchar DEFAULT '#1B3A5C',
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, username)
);

-- Tasks table
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title varchar NOT NULL,
  description text,
  priority varchar NOT NULL DEFAULT 'normal',
  status varchar NOT NULL DEFAULT 'open',
  category varchar,
  due_date date,
  due_time time,
  created_by uuid REFERENCES public.task_users(id),
  assigned_to uuid REFERENCES public.task_users(id),
  assigned_at timestamptz,
  completed_by uuid REFERENCES public.task_users(id),
  completed_at timestamptz,
  completion_note text,
  is_visible_to_all boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Task history table
CREATE TABLE public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_user_id uuid REFERENCES public.task_users(id),
  action varchar NOT NULL,
  old_value text,
  new_value text,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies using is_team_member pattern
CREATE POLICY "team_task_users" ON public.task_users
  FOR ALL USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "team_tasks" ON public.tasks
  FOR ALL USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "team_task_history" ON public.task_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.id = task_id 
      AND public.is_team_member(auth.uid(), t.user_id)
    )
  );

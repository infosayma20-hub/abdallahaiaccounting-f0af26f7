
-- Create attendance_breaks table
CREATE TABLE IF NOT EXISTS public.attendance_breaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_day_id UUID REFERENCES public.attendance_days(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  auth_user_id UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  break_out TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  break_in TIMESTAMPTZ,
  reason TEXT DEFAULT 'استراحة',
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add break columns to attendance_days
ALTER TABLE public.attendance_days 
  ADD COLUMN IF NOT EXISTS total_break_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_work_minutes INTEGER;

-- Enable RLS
ALTER TABLE public.attendance_breaks ENABLE ROW LEVEL SECURITY;

-- RLS policies for attendance_breaks
CREATE POLICY "Employees can view own breaks" ON public.attendance_breaks
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Service role full access breaks" ON public.attendance_breaks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Enable realtime for breaks
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_breaks;

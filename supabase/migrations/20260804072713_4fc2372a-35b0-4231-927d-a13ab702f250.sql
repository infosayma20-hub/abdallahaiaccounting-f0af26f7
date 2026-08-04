create table public.hr_leave_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text,
  branch_id uuid,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_leave_blackout_dates_range_chk check (end_date >= start_date)
);

grant select, insert, update, delete on public.hr_leave_blackout_dates to authenticated;
grant all on public.hr_leave_blackout_dates to service_role;

alter table public.hr_leave_blackout_dates enable row level security;

create policy "Team members can view leave blackout dates"
on public.hr_leave_blackout_dates for select to authenticated
using (is_team_member(auth.uid(), user_id));

create policy "Admins and HR can insert leave blackout dates"
on public.hr_leave_blackout_dates for insert to authenticated
with check (is_team_member(auth.uid(), user_id) and (has_role(auth.uid(),'admin'::app_role) or has_role(auth.uid(),'super_admin'::app_role) or has_role(auth.uid(),'hr_manager'::app_role)));

create policy "Admins and HR can update leave blackout dates"
on public.hr_leave_blackout_dates for update to authenticated
using (is_team_member(auth.uid(), user_id) and (has_role(auth.uid(),'admin'::app_role) or has_role(auth.uid(),'super_admin'::app_role) or has_role(auth.uid(),'hr_manager'::app_role)))
with check (is_team_member(auth.uid(), user_id) and (has_role(auth.uid(),'admin'::app_role) or has_role(auth.uid(),'super_admin'::app_role) or has_role(auth.uid(),'hr_manager'::app_role)));

create policy "Admins and HR can delete leave blackout dates"
on public.hr_leave_blackout_dates for delete to authenticated
using (is_team_member(auth.uid(), user_id) and (has_role(auth.uid(),'admin'::app_role) or has_role(auth.uid(),'super_admin'::app_role) or has_role(auth.uid(),'hr_manager'::app_role)));

create index idx_hr_leave_blackout_owner_dates on public.hr_leave_blackout_dates (user_id, start_date, end_date) where is_active;

create trigger update_hr_leave_blackout_dates_updated_at
before update on public.hr_leave_blackout_dates
for each row execute function public.update_updated_at_column();
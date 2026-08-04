create or replace function public.password_reset_request_bind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_emp record;
  v_local text;
  v_recent int;
begin
  v_email := lower(trim(coalesce(new.email, '')));
  if v_email = '' then
    raise exception 'email is required';
  end if;
  new.email := v_email;

  -- الحقول الحسّاسة تُحدَّد من الخادم فقط
  new.employee_id := null;
  new.employee_name := null;
  new.company_id := null;
  new.status := 'pending';
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution_note := null;

  -- حد أقصى 3 طلبات لنفس البريد خلال ساعة
  select count(*) into v_recent
  from public.password_reset_requests
  where email = v_email and created_at > now() - interval '1 hour';
  if v_recent >= 3 then
    raise exception 'too many password reset requests for this email, please try later';
  end if;

  -- مطابقة دقيقة
  select e.id, e.full_name, e.company_id into v_emp
  from public.employees e
  where lower(e.email) = v_email
  order by e.is_active desc nulls last
  limit 1;

  -- مطابقة متسامحة: تجاهل الحروف المتحركة/الفروقات البسيطة في الجزء المحلي
  if v_emp.id is null then
    v_local := regexp_replace(split_part(v_email, '@', 1), '[aeiou._-]', '', 'g');
    if length(v_local) >= 4 then
      select e.id, e.full_name, e.company_id into v_emp
      from public.employees e
      where split_part(lower(e.email), '@', 2) = split_part(v_email, '@', 2)
        and regexp_replace(split_part(lower(e.email), '@', 1), '[aeiou._-]', '', 'g') = v_local
      order by e.is_active desc nulls last
      limit 1;
    end if;
  end if;

  if v_emp.id is not null then
    new.employee_id := v_emp.id;
    new.employee_name := v_emp.full_name;
    new.company_id := v_emp.company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_password_reset_request_bind on public.password_reset_requests;
create trigger trg_password_reset_request_bind
before insert on public.password_reset_requests
for each row execute function public.password_reset_request_bind();

-- تصحيح الطلبات اليتيمة القديمة
update public.password_reset_requests r
set employee_id = e.id,
    employee_name = e.full_name,
    company_id = e.company_id
from public.employees e
where r.company_id is null
  and split_part(lower(e.email), '@', 2) = split_part(r.email, '@', 2)
  and regexp_replace(split_part(lower(e.email), '@', 1), '[aeiou._-]', '', 'g')
      = regexp_replace(split_part(lower(r.email), '@', 1), '[aeiou._-]', '', 'g');
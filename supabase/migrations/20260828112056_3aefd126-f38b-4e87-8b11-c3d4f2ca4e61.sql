insert into public.notification_log (user_id, type, channel, title, body, path)
select u.id,
       'security_weak_password',
       'in_app',
       'مطلوب تغيير كلمة المرور',
       'كلمة المرور الحالية لحسابك ضعيفة جداً ويمكن تخمينها بسهولة. الرجاء تغييرها الآن إلى كلمة مرور قوية (8 أحرف فأكثر) لحماية بياناتك.',
       '/reset-password'
from auth.users u
where u.deleted_at is null
  and u.encrypted_password = extensions.crypt('123456', u.encrypted_password)
  and not exists (
    select 1 from public.notification_log n
    where n.user_id = u.id and n.type = 'security_weak_password'
  );
-- تنظيف إشعارات التجربة الخاطئة لجميع المستخدمين الذين عندهم اتفاقيات تجربة طويلة (>14 يوم)
-- وذلك لأن المنطق القديم كان يرسلها لهم خطأً
DELETE FROM notification_log
WHERE type IN ('trial_day_1','trial_day_7','trial_day_10','trial_day_13','trial_day_14','trial_welcome','trial_left_7','trial_left_4','trial_left_1','trial_expired')
  AND user_id IN (
    SELECT user_id FROM subscriptions
    WHERE status IN ('trial','trialing')
      AND trial_ends_at IS NOT NULL
      AND (trial_ends_at::date - created_at::date) > 14
  );

-- إعادة ضبط notified_days لإعادة احتساب الإشعارات وفق المنطق الجديد
UPDATE subscriptions
SET notified_days = '{}'
WHERE status IN ('trial','trialing')
  AND trial_ends_at IS NOT NULL
  AND (trial_ends_at::date - created_at::date) > 14;
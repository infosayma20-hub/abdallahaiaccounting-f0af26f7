## المرحلة 0 — نتائج المراجعة (الوضع الحالي)

### جدول `device_tokens`
| الحقل | الحالة | ملاحظة |
|---|---|---|
| `user_id` (FK→auth.users) | ✅ | لا يوجد `company_id` ولا `employee_id` ولا `owner_id` |
| `token` UNIQUE | ✅ | dedupe على مستوى التوكن — تمام |
| `is_active`, `last_seen_at`, `platform`, `device_info` | ✅ | موجودة |
| `last_validated_at` | ❌ | غير موجود |
| RLS | policy واحد فقط: `auth.uid() = user_id` (FOR ALL) | لا يوجد فلتر tenant — Service Role يتجاوزها وهو من يكتب |
| البيانات الحالية | صف واحد فقط active | المرحلة مبكرة، آمنة لإضافات breaking-safe |

### جداول الإشعارات الموجودة
- `notification_log` — سجل الإشعارات الناتجة عن broadcasts فقط (بدون `owner_id`، بدون `event_type`، بدون `dedup_key`).
- `notification_templates` + `notification_broadcasts` — للبثّ اليدوي من الأدمن (sync).
- لا يوجد: `notification_queue`، لا `notification_preferences`، لا digest، لا quiet hours.

### Edge functions الحالية
- `push-send` — Service-role only. يعمل: `SELECT * FROM device_tokens WHERE user_id=? AND is_active`، يستدعي FCM v1، JWT signing **مع cache token** (السطور 14, 37–76 — `cachedToken` صالح ~ساعة). الإرسال **داخل loop تسلسلي**، deactivate عند `UNREGISTERED/NOT_FOUND/INVALID_ARGUMENT`. لا يوجد timeout صريح.
- `notifications-broadcast` — يحلّ الجمهور ثم `Promise.all` batches من 25، كل batch يستدعي `push-send` واحد لكل user → 1000 موظف = 1000 invocation منفصل. **خطر timeout** ضمن invocation الـ broadcast نفسه.
- `push-register`, `push-admin-test`, `push-test`, `notify-admin-signup` — تسجيل/اختبار.

### Triggers الحالية التي تطلق إشعارات
| Trigger | الجدول | يستدعي | tenant filter |
|---|---|---|---|
| `trg_notify_payslip_paid` | `employee_payroll` | `notify_employee_push` | عبر `employees.auth_user_id` → ضمني، **محتوى مالي حسّاس** في body |
| `trg_notify_missing_fingerprint` | `attendance_days` | `notify_employee_push` | ضمني عبر employees |
| `trg_notify_correction_answered` | `correction_requests` | `notify_employee_push` | ضمني |
| `notify_employee_push()` | RPC داخلي | `net.http_post → push-send` **SYNCHRONOUS داخل trigger** | كل trigger = HTTP call فوري |

### الـ ownership helper
- `resolve_effective_owner_id(auth_uid)` متاح ويعطي owner من: sales_rep / employees / invited_by / نفسه. سيُستخدم في `notification_queue.owner_id`.

### المخاطر المؤكّدة الآن
1. كل trigger = HTTP call داخل المعاملة (لو فشل `net.http_post` ما بيرجع خطأ لكن بيستهلك وقت + موارد).
2. لا يوجد dedup → POS resync أو retry يرسل إشعارات مكرّرة.
3. body الراتب يحتوي رقم محتمل (يتسرّب lock screen).
4. `device_tokens` بدون عمود tenant — التحقق الدفاعي يعتمد على ربط عكسي.
5. broadcast لـ 1000 مستخدم = 1000 HTTP call داخل invocation = timeout 150s محتمل.

---

## خطة التنفيذ — 6 مراحل، كل مرحلة قابلة للمراجعة

### المرحلة 1 — Queue + Worker (جوهر الحل)
**Migration (additive):**
- `notification_queue` (id, owner_id, recipient_user_id, event_type, sensitivity 'low'/'high', title, body, data jsonb, priority smallint, dedup_key text UNIQUE, scheduled_for timestamptz, status 'pending'/'sent'/'failed'/'skipped'/'deferred', attempts int, last_error, created_at, updated_at, sent_at).
- indexes: `(status, scheduled_for)` partial WHERE status='pending'، `(owner_id, recipient_user_id, created_at DESC)`، unique `dedup_key`.
- GRANT: `service_role ALL`، `authenticated SELECT` على صفوف `recipient_user_id = auth.uid()` فقط (لو احتجناها لاحقاً).
- RLS: deny by default، policy للقراءة الذاتية للمستلم، policy admin (has_role) للقراءة على نفس الـ tenant.
- دالة `enqueue_notification(...)` SECURITY DEFINER تستخدم `resolve_effective_owner_id` لحلّ owner_id، تُولّد `dedup_key` افتراضياً من `(event_type || recipient || source_id)` لو ما تم تمريره.

**Edge function جديدة `notifications-worker`:**
- تأخذ batch=200، تستخدم `SELECT ... FOR UPDATE SKIP LOCKED` لمنع التداخل بين الـ runs.
- access token caching موجود أصلاً — يُنقل لنفس النمط.
- إرسال مع `Promise.allSettled` و concurrency=25.
- يستخدم FCM HTTP v1 (لا multicast endpoint رسمي لـ v1 — يبقى per-token مع concurrency).
- update status + attempts + sent_at، وعند `UNREGISTERED/NOT_FOUND/INVALID_ARGUMENT` → `is_active=false`.

**Cron (pg_cron + pg_net) عبر insert tool:** كل دقيقة تستدعي `notifications-worker`.

**الـ triggers الحالية:**
- `notify_employee_push` يُعاد كتابتها لتكون `INSERT INTO notification_queue` فقط — **لا HTTP call**.
- التواقيع نفسها → ما في breaking change على الـ triggers.

### المرحلة 2 — Stale tokens + re-registration
- `ALTER device_tokens ADD COLUMN last_validated_at timestamptz`.
- worker يحدّث `last_validated_at = now()` عند نجاح الإرسال.
- العميل (`push-notifications.ts`) يعمل `push-register` عند كل cold start إذا `Notification.permission==='granted'`.
- Cron يومي: deactivate حيث `last_seen_at < now()-60d`.

### المرحلة 3 — الخصوصية (sensitivity)
- عمود `sensitivity` على `notification_queue` (`low` افتراضي، `high` للراتب/المالي).
- worker عند `sensitivity='high'`: يرسل title عام ("قسيمة راتب جديدة") + body عام ("افتح التطبيق للعرض")، التفاصيل في `data` فقط.
- `trg_notify_payslip_paid` يُحدّث ليرسل sensitivity='high' بدون أي رقم في body.

### المرحلة 4 — Notification preferences + digest + quiet hours
- `notification_preferences` (recipient_user_id, event_type, channel_push bool default true, digest_mode bool default false, quiet_hours_start time, quiet_hours_end time, timezone text default 'Asia/Hebron'). PK مركّب.
- RLS: المستخدم يدير preferences الخاصة فيه فقط.
- في `enqueue_notification`: قبل insert يفحص preference → لو مطفي = insert مع status='skipped' للأودِت. لو ضمن quiet hours: status='deferred' + `scheduled_for` = نهاية الصمت بتوقيت timezone.
- digest للمدراء: trigger البصمة الفردي يدخل صف بـ `event_type='attendance_daily_digest'`، وworker مجدول 9:00 ص يجمّعها لكل manager ويرسل ملخّص واحد.

### المرحلة 5 — Tenant safety (دفاع متعدد الطبقات)
- `notification_queue.owner_id` يُحلّ من مصدر الحدث (`employees.user_id`) لا من جلسة المستخدم.
- في worker قبل كل إرسال: تحقّق أن كل `device_tokens.user_id` للمستلم يحلّ إلى نفس `owner_id` (عبر `resolve_effective_owner_id`). لو لا → status='skipped' + `last_error='tenant_mismatch'` + RAISE WARNING.
- RLS على `notification_queue`: deny by default + policy admin يرى صفوف tenant الخاص به (مطابقة owner_id مع owner المستخدم).

### المرحلة 6 — Race conditions + late events
- العمود `dedup_key` UNIQUE → conflict = noop. تمرير `ON CONFLICT DO NOTHING` في `enqueue_notification`.
- العمود `source_created_at` على notification_queue. الـ triggers تمرره من الصف الأصلي.
- worker: قبل الإرسال لو `event_type IN ('pos_order_synced', ...)` و `now() - source_created_at > interval '2 hours'` → status='skipped' + reason='stale_event'.

---

## معايير القبول (سأختبرها بعد كل مرحلة)
1. ✅ trigger يكتب صف queue فقط، صفر HTTP calls.
2. ✅ 3000 token عبر batches من 200/min، concurrency 25 → لا timeout.
3. ✅ token محذوف → deactivate بعد أول فشل، لا retry.
4. ✅ إشعار راتب: title/body عامّين، الأرقام في data فقط.
5. ✅ مدير 50 موظف → digest واحد بدل 50.
6. ✅ اختبار صريح: حدث شركة A لا يصل لـ tokens شركة B.
7. ✅ POS متأخر 3 أيام → skipped.
8. ✅ resync نفس الحدث → dedup_key يمنع التكرار.

## تفاصيل تقنية
- لا تعديل على RLS الحالية، لا تعديل على triggers بخلاف جسم `notify_employee_push` (نفس التوقيع).
- جميع الجداول الجديدة بـ `GRANT` كاملة في نفس الـ migration.
- Vault key الحالي `email_queue_service_role_key` يبقى للاتصال trigger→worker (لو احتجناه)، لكن الجديد: trigger يكتب SQL فقط، الـ cron يستدعي worker بـ service role من جدوله.
- pg_cron + pg_net سيُفعّلان عبر insert tool (لأن URL + key خاصّان بالمشروع).
- migration واحدة لكل مرحلة، تنفيذ تسلسلي مع توقّف للمراجعة بينها.

هل أبدأ بـ **المرحلة 1** (queue + worker + إعادة كتابة `notify_employee_push`)؟
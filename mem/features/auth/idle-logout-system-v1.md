---
name: Idle Logout System V1
description: Inactivity auto-logout — company-level policy via get_effective_session_policy RPC, cross-tab sync over malaky-sync BroadcastChannel, wall-clock 15s ticker, app-wide IdleLogoutGuard mounted in App.tsx, POS excluded
type: feature
---

# Idle Logout System V1

## مصدر السياسة
- جدول `companies` يحوي عمودَي `session_timeout_minutes` (افتراضي 30) و`session_warning_minutes` (افتراضي 2). إعداد على مستوى الشركة، يطبَّق على كل موظفيها.
- قراءة عبر RPC `get_effective_session_policy(_uid)` (SECURITY DEFINER): يستخدم `get_team_owner_id` ثم يطابق `employees.company_id` أو `companies.owner_id`. fallback (30, 2).
- كتابة عبر RPC `update_company_session_policy(_timeout, _warning)`: للمالك أو لمن يملك دور `admin`/`company_admin` فقط، مع تحقّق `warning < timeout` و bounds (0-1440 / 0-60).
- Realtime مفعّل على `public.companies` (REPLICA IDENTITY FULL) → تغيير الإعداد يصل لكل التبويبات لحظياً.

## آلية الكشف
- `src/hooks/useIdleLogout.ts`: مؤقت كل 15 ثانية يقارن `Date.now()` بـ `lastActivityAt` المخزَّن في `localStorage["amwali_last_activity:<user_id>"]`. لا يعتمد على `setTimeout` طويل (يحلّ sleep/wake وtab throttling).
- أحداث النشاط: `mousedown, keydown, scroll, touchstart, click` فقط (لا `mousemove`/`pointermove`).
- على `visibilitychange`/`focus` يُنفَّذ tick فوري بدل انتظار 15 ثانية.

## المزامنة بين التبويبات
- BroadcastChannel `malaky-sync` (مشترك مع نظام الـ cross-tab الموجود).
- نوعا رسالة:
  - `{type:"session_activity", userId, ts}` — debounced كل 5 ثوانٍ. أي تبويب يتلقّاها يحدّث `lastActivityAt`.
  - `{type:"session_force_logout", userId, reason:"timeout"}` — التبويب الذي ينفّذ الخروج يُرسلها، الباقي يستجيبون بـ `performSessionTimeout({silent:true})`.

## التركيب والاستثناءات
- `<IdleLogoutGuard />` مُركَّب مرّة واحدة في `src/App.tsx` داخل `AuthProvider`، يستخدم `useLocation` لاستثناء المسارات:
  - `/auth`, `/auth/*`, `/reset-password`, `/setup`, `/blocked`, `/unsubscribe`
  - `/pos`, `/pos/*` (POS له shift lifecycle و 6 AM cutoff)
  - الصفحات العامة: `/terms`, `/privacy`, `/pricing`, `/features`, `/blog`, `/landing`, `/share`, `/branch-display`
- يعمل تلقائياً لكل البوابات: لوحة الأدمن، بوابة الموظف، بوابة البائع، بوابة المالك، Super Admin، Store Tracker.

## أنواع الخروج (URL reason)
- `/auth?reason=session_expired` (banner أصفر) — refresh_token مات على الخادم (مكتشَف في `accessContext` أو visibility probe).
- `/auth?reason=session_timeout` (banner أزرق) — خمول تجاوز الحد، أصدره `IdleLogoutGuard`.
- بدون reason — خروج يدوي عادي.

## التدقيق
- `performSessionTimeout` يستدعي edge function `log-security-event` بـ `event_type:"session_timeout"` قبل الخروج. يمكن تمييزه عن `logout` اليدوي في `user_security_audit`.

## واجهة الإعدادات
- `src/components/settings/SecuritySettingsSection.tsx` يستدعي `update_company_session_policy` RPC. يُبقي تحديث الحقول القديمة في `company_settings` للتوافق الانتقالي.
- ينبّه المستخدم نصياً أن الإعداد على مستوى الشركة.

## ملفات الواجهة
- `src/lib/sessionLogout.ts` — `performSessionTimeout()` مع single-fire guard.
- `src/hooks/useIdleLogout.ts` — الـ Hook الموحّد.
- `src/components/IdleLogoutGuard.tsx` — يستهلك الـ Hook ويعرض شاشة التحذير.

## خارج النطاق (V1)
- تنفيذ من جانب الخادم (DevTools tamper protection): لم يُنفَّذ لتفادي N ping/min × كل مستخدم. يبقى enforcement محلي. يمكن إضافته لاحقاً عبر Edge Function `enforce-session-policy` + عمود `profiles.last_activity_at`.
- إبطال refresh_token من admin API بعد timeout: مرحلة لاحقة.

## ملفات محذوفة
- `src/components/SessionManager.tsx` — استُبدل بـ `IdleLogoutGuard` + `useIdleLogout`.
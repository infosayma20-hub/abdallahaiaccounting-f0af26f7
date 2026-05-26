# النقطة 6 — تطبيق Feedback / متابعة الزبائن (خطة تصميم فقط)

## 1. المبدأ
- **بدون role جديد**. نستخدم صلاحية ميزة `feedback` (مفتاح ضمن جدول `app_permissions` أو `feature_permissions` الحالي — يُمنح لأي مستخدم).
- شاشة واحدة موحّدة `/feedback` للكول سنتر، الزبون يُعرَّف عبر **رقم الهاتف** (normalize: إزالة المسافات/الشرطات، توحيد `+970/972/05`).
- لا نُنشئ سجل زبون مكرّر؛ نستخدم upsert على `normalized_phone`.

## 2. الجداول الحالية التي نقرأ منها
| الجدول | الاستخدام |
|---|---|
| `call_center_orders` | طلبات الكول سنتر (phone, branch, total, items, created_at) |
| `pos_orders` | الطلبات المُكتملة بالكاشير (للربط حسب `pos_order_id` أو `customer_phone`) |
| `invoices` + `contacts` | الفواتير المُسجَّلة باسم العميل (اختياري — إن وُجد `phone` في `contacts`) |
| `branches` | اسم الفرع للعرض |
| `profiles` | اسم الموظف الذي قام بالاتصال |
| `pos_sessions`, `app_permissions` | التحقق من الصلاحية |

## 3. الجداول الجديدة المقترحة

### 3.1 `feedback_customers` — ملف الزبون الموحّد
```text
id                uuid PK
user_id           uuid (تينانت — owner)
normalized_phone  text NOT NULL          -- مفتاح التوحيد
display_phone     text                    -- كما أدخله الموظف
full_name         text
last_known_branch_id uuid
notes             text                    -- ملاحظات عامة دائمة
total_orders_cached    int  DEFAULT 0     -- محسوب دورياً
last_order_at_cached   timestamptz
do_not_call       boolean DEFAULT false   -- خيار خصوصية
created_at, updated_at
UNIQUE (user_id, normalized_phone)
```

### 3.2 `feedback_calls` — سجل مكالمات Feedback
```text
id                uuid PK
user_id           uuid (تينانت)
customer_id       uuid REFERENCES feedback_customers
related_order_id  uuid NULL REFERENCES call_center_orders  -- مرجع اختياري
related_pos_order_id uuid NULL REFERENCES pos_orders
called_at         timestamptz DEFAULT now()
called_by         uuid (auth.users)
called_by_name    text
outcome           text CHECK IN ('answered','no_answer','busy','wrong_number','do_not_call')
sentiment         text CHECK IN ('satisfied','unsatisfied','complaint','suggestion','neutral')
rating            int  CHECK BETWEEN 1 AND 5  -- اختياري
complaint_text    text
suggestion_text   text
note              text
needs_followup    boolean DEFAULT false
followup_due_at   timestamptz NULL
followup_status   text CHECK IN ('pending','done','snoozed','cancelled') NULL
created_at, updated_at
```
**INDEXES:** `(user_id, customer_id)`, `(user_id, followup_due_at) WHERE needs_followup`.

### 3.3 (اختياري) `feedback_followups` — لو احتجنا متابعات متعددة لكل مكالمة
نتجنّبه في MVP — `needs_followup` على `feedback_calls` كافٍ.

## 4. RLS المقترحة
- Enable RLS على الجدولين.
- **`feedback_customers`**: SELECT/INSERT/UPDATE لأي عضو فريق (`is_team_member(auth.uid(), user_id)`) **+ شرط الصلاحية** `has_app_permission(auth.uid(), 'feedback')`.
- **`feedback_calls`**: نفس الشرط؛ DELETE ممنوع (سجل audit). UPDATE محدود لتعديل `followup_status` و`note` فقط (عبر RPC `update_followup_status`).
- لا نستخدم `UPDATE` مفتوح؛ التعديلات الحرجة عبر RPCs.

## 5. RPCs مقترحة
| RPC | الوظيفة |
|---|---|
| `feedback_upsert_customer(p_phone, p_name, p_branch_id)` | normalize phone + upsert، يرجع `customer_id` |
| `feedback_log_call(p_customer_id, p_related_order_id, p_outcome, p_sentiment, p_rating, p_complaint, p_suggestion, p_note, p_needs_followup, p_followup_due_at)` | إنشاء مكالمة + تحديث cache على customer |
| `feedback_update_followup(p_call_id, p_status, p_note)` | تحديث حالة المتابعة فقط |
| `feedback_get_customer_orders(p_customer_id)` | يجمع طلبات الزبون من `call_center_orders + pos_orders` بـ UNION محدودة + تينانت guard |
| `feedback_search_customers(p_query)` | بحث آمن (phone أو name، ILIKE مع escape، LIMIT 50) |

كلها `SECURITY DEFINER SET search_path = public` مع فحص `is_team_member` و`has_app_permission(_, 'feedback')`.

## 6. الصفحات والمكونات
```text
src/pages/FeedbackPage.tsx                  ← /feedback (محمي بـ ModuleGuard 'feedback')
src/components/feedback/
  CustomerSearchBar.tsx                     ← بحث phone/name + autocomplete
  CustomerList.tsx                          ← قائمة نتائج
  CustomerProfileDrawer.tsx                 ← الملف الموحّد (موبايل: full-screen / ديسكتوب: side drawer)
    ├─ CustomerHeader (الاسم، phone، do_not_call toggle، عدد طلبات، آخر طلب)
    ├─ CustomerOrdersTab (تاريخ، فرع، إجمالي، حالة)
    ├─ CustomerCallsTab (سجل مكالمات Feedback)
    └─ NewCallForm (نموذج إنشاء مكالمة جديدة)
  FollowupsInbox.tsx                        ← قائمة "متابعات مستحقّة اليوم"
  FeedbackStatsHeader.tsx                   ← KPIs (راضي/غير راضي/شكاوى/متابعات معلقة)
```

**Layout موبايل**: bottom-tab بين "بحث | متابعات اليوم | الإحصائيات".  
**Layout ديسكتوب**: قائمة يسار (نتائج البحث) + Drawer يمين (ملف الزبون).

## 7. الصلاحيات والخصوصية
- المستخدم بصلاحية `feedback` فقط:
  - **يرى**: `feedback_customers`, `feedback_calls`, ملخّص طلبات (تاريخ/فرع/مبلغ + items مختصرة).
  - **لا يرى**: المحاسبة، التقارير المالية، الإعدادات، الحسابات، الرواتب، الموظفين، الموردين. يتم منع الوصول عبر `ModuleGuard` الموجود + إخفاء التنقل.
- حقول مخفية: أرقام الحسابات البنكية، PIN، password_hash — لا نقرأها أصلاً.
- `do_not_call = true` → النموذج يمنع تسجيل مكالمة جديدة (إلا بنية واضحة).

## 8. مخاطر التكرار/الخصوصية ومعالجتها
| المخاطرة | المعالجة |
|---|---|
| تكرار الزبون (`+970599…` vs `0599…`) | دالة `normalize_phone()` موحّدة + UNIQUE index |
| تكرار سجل لنفس رقم في تينانتين مختلفين | UNIQUE على `(user_id, normalized_phone)` لا على phone فقط |
| تسريب أرقام عبر تينانتات | كل استعلام محصور بـ `is_team_member` |
| موظف feedback يصل لمسارات أخرى | `ModuleGuard` + إخفاء التبويبات + RLS صارمة على الجداول المالية |
| تحرير سجل مكالمة قديم لإخفاء شكوى | منع UPDATE الحقل النصي بعد X دقائق (trigger)، DELETE ممنوع كلياً |
| spam مكالمات | rate-limit في RPC: لا أكثر من مكالمة واحدة لكل (customer, called_by) خلال 60 ثانية |

## 9. خطة التنفيذ على مراحل آمنة

**المرحلة A — Backend foundation**
1. Migration: `feedback_customers`, `feedback_calls`, indexes, RLS, helper `normalize_phone()`.
2. Migration: RPCs الخمس.
3. إضافة مفتاح صلاحية `'feedback'` لقائمة `app_permissions` + تحديث `has_app_permission` إن لزم.

**المرحلة B — Read-only UI**
4. `FeedbackPage` + `CustomerSearchBar` + `CustomerList` (قراءة فقط).
5. `CustomerProfileDrawer` + Orders tab (قراءة من RPC `feedback_get_customer_orders`).

**المرحلة C — Calls logging**
6. `NewCallForm` + `CustomerCallsTab` + ربط RPC `feedback_log_call`.
7. تحديث cache (total_orders, last_order_at) عبر trigger.

**المرحلة D — Followups**
8. `FollowupsInbox` + RPC `feedback_update_followup`.
9. realtime subscription على `feedback_calls WHERE needs_followup` لإشعار الموظف.

**المرحلة E — Stats & Polish**
10. `FeedbackStatsHeader` + KPIs.
11. تقرير شهري (sentiment breakdown / branch breakdown) — يمكن تأجيله.

**المرحلة F — Hardening**
12. Rate-limit في RPC.
13. trigger يمنع تعديل المكالمات بعد 15 دقيقة.
14. Audit memory + توثيق.

---

## ملاحظات قبل التنفيذ
- نحتاج تأكيدك على **مفتاح الصلاحية**: `feedback` أم `call_center_feedback`؟
- هل نُفعّل `do_not_call` كحقل قانوني (PDPA) من البداية أم لاحقاً؟
- هل ندمج "متابعات اليوم" مع جرس إشعارات `realtime-ecommerce-panel` الحالي أم inbox منفصل؟

بعد موافقتك على هذه الخطة (وردّك على الأسئلة الثلاثة)، ننفّذ المرحلة A فقط ونتوقف للتقرير.

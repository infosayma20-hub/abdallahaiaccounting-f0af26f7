
# خطة تطوير وحدة الكول سنتر — 6 نقاط

**مبدأ صارم:** لا أي تغيير محاسبي. كل التعديلات على طبقة `call_center_orders` (مرحلة ما قبل الفاتورة فقط). الفاتورة الفعلية لا تُنشأ إلا لحظة قبول الكاشير، تماماً كما هي اليوم.

---

## النقطة 1 — إضافة "F12" على زر "تحويل"

**المكان:** `src/pages/POSPage.tsx` السطر 5188.

**التغيير:** نص الزر `تحويل` → `F12 تحويل` (نفس نمط `F2 — دفع` و `F9 طباعة`).

**التأثير:** بصري فقط، صفر مخاطر.

---

## النقطة 2 — Queue الطلبيات لما ما في كاشير متصل

**السلوك المختار:** الطلبية تنحفظ في `call_center_orders` بحالة `pending` كالعادة، **بدون منع/تحذير حاجب**. لما أول كاشير يفتح وردية بفرع X، بيشوف الطلبيات المعلّقة فوراً مع صوت تنبيه.

**التغييرات:**

1. **`CallCenterDispatchDialog.tsx` (سطور 248–255):** إزالة `window.confirm` المُعطِّل. استبداله بـ:
   - يبقى المؤشر "لا يوجد كاشير" أحمر في بطاقة الفرع (موجود أصلاً).
   - يُضاف badge صغير "📥 ستوضع بقائمة الانتظار" تحت تحذير الـ AlertCircle.
   - الإرسال يكمل بدون أي confirm.

2. **`PendingOrdersPanel.tsx`:** لما الكاشير يفتح وردية، الـ panel أصلاً بيعرض طلبيات `status='pending'` للفرع. التحقق:
   - أتأكد أن الاستعلام بيجيب كل `pending` (مش بس اللي بعد فتح الوردية).
   - أضيف صوت تنبيه `kds-voice` لما يطلع طلب جديد بالـ panel أول مرة (queue notification).

**التأثير المحاسبي:** صفر. `call_center_orders` ليست جدول محاسبي.

---

## النقطة 3 — تسجيل خروج الكول سنتر يرجع لشاشة Auth

**المشكلة الحالية:** `handleCallCenterCloseShift` (سطر 3809–3812) ينقل للـ `/apps` (إذا admin) أو `/employee`. مع إن المستخدم هنا call center غير admin → بيروح لـ `/employee`.

**التغيير:** بداخل `handleCallCenterCloseShift`، لما `isCallCenter === true`:
```
await supabase.auth.signOut();
navigate("/auth", { replace: true });
```
بدل التحويل لـ `/employee`.

**التأثير:** UX فقط، لا يمس DB.

---

## النقطة 4 — بطاقة "تعديل" تظهر للكاشير بعد التحويل

**السلوك المختار:** الطلبية الأصلية لا تتغير. الكول سنتر يضغط "تعديل" → تنفتح نفس الـ dialog مع البيانات → الحفظ ينشئ **سجل تعديل منفصل** (`call_center_order_edits`) → الكاشير بشوف بطاقة "🔔 تعديل وارد" بالـ `PendingOrdersPanel` → بيقبل/يرفض → عند القبول، الطلبية الأصلية تُحدّث.

**تغييرات DB (Migration):**

```sql
-- جدول جديد لتعديلات الطلبيات المعلقة
CREATE TABLE public.call_center_order_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES call_center_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- data owner
  proposed_by uuid NOT NULL,
  proposed_by_name text,
  proposed_items jsonb,
  proposed_total numeric,
  proposed_customer_name text,
  proposed_customer_phone text,
  proposed_delivery_address text,
  proposed_delivery_type text,
  proposed_payment_method text,
  proposed_note text,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz DEFAULT now()
);
-- RLS: نفس نمط call_center_orders (multi-tenant عبر user_id = data owner)
-- Realtime: إضافة الجدول لـ supabase_realtime publication
```

**Constraint إضافي:** لا يُسمح بتعديل إذا `call_center_orders.status` صار `accepted` أو أعلى (trigger يرفض الإدراج).

**تغييرات UI:**

1. **`DispatchedOrdersLog.tsx`:** زر جديد "✏️ تعديل" بجانب كل طلبية `pending`. يفتح `CallCenterDispatchDialog` بوضع "edit" مع `existingOrderId`.
2. **`CallCenterDispatchDialog.tsx`:** prop جديد `editingOrderId?: string`. لو موجود → الزر يصير "إرسال التعديل" بدل "تحويل"، والـ INSERT يصير في `call_center_order_edits`.
3. **`PendingOrdersPanel.tsx`:** بطاقة جديدة فوق الطلبية لو فيها `edit` معلق → "🔔 تعديل وارد من الكول سنتر" + زر "قبول التعديل" / "رفض".
4. **عند القبول:** RPC `accept_order_edit(_edit_id)` تطبق التعديل على الطلبية الأصلية وتعلّم الـ edit `accepted`.

**التأثير المحاسبي:** صفر (الفاتورة لسا ما اتنشأت).

---

## النقطة 5 — تأكيد وصول الطلبية للفرع (ACK تلقائي)

**السلوك المختار:** فور ما realtime channel بأي جهاز POS مفتوح بالفرع المستهدف يستقبل الـ INSERT، الجهاز يكتب `delivered_at` على الطلبية. الكول سنتر بيشوف:
- ⏳ "جارٍ الإرسال..." (أول ثانيتين)
- 📨 "وصلت للفرع" (لما `delivered_at` يتعبأ)
- ✅ "تم القبول" (لما `status='accepted'` — موجود اليوم)
- ⚠️ "لم تصل بعد" (لو مرّ 10 ثواني بدون `delivered_at`)

**تغييرات DB:**

```sql
ALTER TABLE call_center_orders 
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN delivered_to_device text;
```

**تغييرات UI:**

1. **`PendingOrdersPanel.tsx`:** داخل realtime listener للـ INSERT، فوراً ينفّذ:
   ```ts
   supabase.from("call_center_orders").update({ 
     delivered_at: new Date().toISOString(),
     delivered_to_device: deviceFingerprint 
   }).eq("id", payload.new.id).is("delivered_at", null);
   ```
   (`is null` يضمن إن أول جهاز يلتقط الـ event هو اللي يأكد).

2. **`DispatchedOrdersLog.tsx`:** عمود جديد "حالة التسليم" بثلاث أيقونات (📤 / 📨 / ✅) + timer "لم تصل بعد" لو > 10s.

3. **`CallCenterDispatchDialog.tsx`:** الـ tracking الموجود (سطور 199–240) نضيف عليه listening لـ `delivered_at`.

**التأثير المحاسبي:** صفر.

---

## النقطة 6 — تطبيق Feedback (MVP + تصنيف + تقرير)

**النطاق:** قائمة زبائن آخر 24 ساعة (من الفواتير + الطلبيات المحولة) → موظف الـ feedback يتصل → يصنّف (راضي/غير راضي/شكوى) + يكتب ملاحظة → تقرير بسيط للإدارة.

**تغييرات DB:**

```sql
CREATE TABLE public.customer_feedback_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- data owner
  customer_name text,
  customer_phone text NOT NULL,
  source_invoice_id uuid,
  source_order_id uuid,  -- call_center_orders.id
  branch_id uuid,
  branch_name text,
  order_total numeric,
  order_date timestamptz,
  
  -- نتيجة المتابعة
  call_status text NOT NULL DEFAULT 'pending', -- pending | contacted | no_answer | wrong_number | skipped
  satisfaction text, -- satisfied | unsatisfied | complaint
  notes text,
  
  contacted_at timestamptz,
  contacted_by uuid,
  contacted_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- index: (user_id, customer_phone, order_date)
-- RLS: نفس نمط multi-tenant
```

**RPC مساعدة:** `feedback_seed_today()` تنشئ سطر `pending` لكل زبون عنده فاتورة/طلبية بآخر 24 ساعة ومش موجود مسبقاً (idempotent).

**Edge Function (cron):** تشغّل `feedback_seed_today` مرة باليوم الساعة 7 صباحاً بتوقيت Hebron.

**UI جديد:**

1. **`src/pages/FeedbackPage.tsx`:**
   - جدول zبائن اليوم (pending أعلى، contacted أسفل).
   - لكل صف: زر "📞 اتصلت" يفتح dialog فيه:
     - radio: راضي / غير راضي / شكوى
     - textarea ملاحظات
     - زر "تم" / "لا يرد" / "رقم خطأ".
   - فلتر بسيط: حسب الفرع، التاريخ، حالة المكالمة.

2. **`src/pages/FeedbackReportPage.tsx`:**
   - KPIs: عدد المكالمات اليوم/الأسبوع، نسبة الرضا، عدد الشكاوى.
   - جدول الشكاوى الأخيرة.

3. **إضافة للـ Apps Registry:** تطبيق "Feedback" برمز `MessageCircle` لون `pink` تحت قسم Operations.

4. **Role جديد:** `feedback_agent` — صلاحية على هذا التطبيق فقط (نفس نمط `call_center` role الحالي).

**التأثير المحاسبي:** صفر. الجدول مستقل تماماً ويقرأ فقط من الفواتير/الطلبيات.

---

## ترتيب التنفيذ المقترح

1. **النقطة 1** (1 سطر) — فوري.
2. **النقطة 3** (3 سطور) — فوري.
3. **النقطة 2** (queue + إزالة confirm + صوت) — 15 دقيقة.
4. **النقطة 5** (migration + delivered_at + UI badges) — 30 دقيقة.
5. **النقطة 4** (جدول edits + RPC + 3 UI changes) — 45 دقيقة.
6. **النقطة 6** (Feedback module كامل) — ساعة.

---

## ما لن أمسّه

- جداول `pos_orders`, `pos_order_lines`, `pos_payments`, `pos_sessions`, journal/ledger.
- منطق الفاتورة نفسها أو الطباعة الحالية.
- `enforce_pos_session_branch_match` trigger.
- صلاحيات admin/device_admin (مكتمل بالجولة السابقة).

---

**أسأل قبل البدء:**
- النقاط 1, 2, 3, 5 آمنة وسريعة. **هل أبدأ بها كحزمة أولى وأوقف للمراجعة قبل النقاط 4 و 6؟**
- النقطة 6 (Feedback) تحتاج Role جديد `feedback_agent` — هل تفضل (أ) Role منفصل، أم (ب) أي مستخدم عنده صلاحية على التطبيق من شاشة إدارة الصلاحيات الحالية بدون role جديد؟

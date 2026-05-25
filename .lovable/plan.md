# خطة: حماية عهدة الكاشير من تعدد الأجهزة (Concurrent Shifts)

الهدف: منع السيناريو حيث يفتح الكاشير حسابه على جهازين، أحدهما يقفل العهدة (`pos_sessions.state='closed'`) والثاني يستمر بالبيع على نفس الـ session أو يفتح session موازية بدون علم.

الجدول المعني: `public.pos_sessions` (state, closed_at, cashier_pos_user_id, terminal_id, device_id).

---

## المبدأ
- **DB هي السلطة**: قيود وتريغرات على `pos_sessions` و`pos_orders` تمنع البيع على session مغلقة، ومنع وجود session مفتوحتين لنفس الكاشير في نفس الوقت.
- **الواجهة تعكس فقط**: Realtime + فحص قبل التأكيد، بدون منطق مالي جديد في React.
- **ما نضيع طلب مفتوح**: لو الكاشير صاير عنده فاتورة شغّالة، نعرض شاشة منع واضحة مع زر "تحديث" بدل رمي البيانات.

---

## 1) طبقة قاعدة البيانات (الأساس)

### 1.1 Unique partial index
منع وجود أكثر من session مفتوحة لنفس الكاشير في نفس الشركة:
```
CREATE UNIQUE INDEX pos_sessions_one_open_per_cashier
ON pos_sessions (company_id, cashier_pos_user_id)
WHERE state = 'open' AND is_deleted = false;
```
هذا يمنع الجهاز B من فتح session جديدة أثناء وجود واحدة مفتوحة على A.

### 1.2 Trigger يحمي pos_orders
BEFORE INSERT/UPDATE على `pos_orders`:
- يقرأ `pos_sessions.state` للـ session_id المرتبطة.
- لو `state != 'open'` أو `is_deleted = true` → `RAISE EXCEPTION 'POS_SHIFT_CLOSED'` مع كود واضح للواجهة.
- نفس الفحص يُطبّق على `pos_payments` و`pos_inventory_movements` المرتبطة بالطلب.

### 1.3 RPC ذرّي للإغلاق
`close_pos_session(session_id, closing_cash)`:
- يقفل الـ session بشرط `state='open'` (CAS).
- لو session مقفولة فعلاً من جهاز ثاني → يُرجع `ALREADY_CLOSED` بدل خطأ.

---

## 2) Realtime للجهاز الثاني

تفعيل Realtime على `pos_sessions`:
```
ALTER PUBLICATION supabase_realtime ADD TABLE pos_sessions;
```

داخل POSPage:
- اشتراك بالـ session الحالية (`id = currentSessionId`).
- لحظة استلام `UPDATE` مع `state='closed'` → تحديث الواجهة لوضع "العهدة أُغلقت من جهاز آخر" + تعطيل البيع.

---

## 3) فحص ما قبل البيع (Safety net)

قبل تأكيد كل فاتورة في `POSPage`:
1. `SELECT state, closed_at FROM pos_sessions WHERE id = $1` (call واحد سريع).
2. لو `closed` → نوقف، نعرض الشاشة المانعة.
3. لو DB رفض الإدراج لأي سبب بكود `POS_SHIFT_CLOSED` → نفس المعالجة.

هذا يغطي حتى لو فشل Realtime (شبكة سيئة).

---

## 4) شاشة "العهدة مغلقة من جهاز آخر"

Modal RTL داخل `/pos`:
- عنوان: **تم إغلاق العهدة من جهاز آخر**
- شرح: العهدة الحالية أُغلقت من جلسة أخرى لنفس حسابك. لا يمكن إكمال البيع.
- زر **عرض ملخص العهدة المغلقة** (للقراءة فقط).
- زر **فتح عهدة جديدة** (يستدعي RPC الفتح كالمعتاد).
- زر **العودة إلى شاشة الموظف**.
- **لا حذف للسلة الحالية**: نخزنها كـ draft في IndexedDB حتى لو فتح عهدة جديدة يقدر يكمل نفس الطلب (اختياري في فيز 2).

---

## 5) منع الفتح المزدوج من البداية

في تدفق "فتح عهدة":
- قبل عرض شاشة opening cash، نفحص: هل يوجد `pos_sessions` مفتوحة لنفس `cashier_pos_user_id`؟
- إذا نعم على جهاز آخر:
  - عرض: "لديك عهدة مفتوحة بالفعل على جهاز آخر (terminal: X، فُتحت الساعة Y)".
  - خياران: **متابعة على هذا الجهاز** (يستخدم نفس session_id) أو **إغلاق العهدة الأخرى أولاً** (يتطلب صلاحية مشرف لاحقاً).

---

## 6) تأثير على ميزات قائمة

- **Heartbeat الـ Bridge** اللي اتنفذ سابقاً: لا تغيير، يبقى مستقل.
- **POS Offline (IndexedDB)**: الفواتير المخزنة محلياً لما تتزامن سيمر عليها الـ trigger في 1.2 → لو الـ session اللي ارتبطت فيها مقفولة، الإدراج يُرفض. نحتاج معالجة: نعرض في `pos_sync_log` رسالة "فشل المزامنة: العهدة مغلقة" مع زر "إعادة ربط بعهدة جديدة".
- **التقارير اليومية**: لا تتأثر، نفس logic الـ shift cutoff.
- **محاسبياً**: لا قيود مكررة لأن DB يرفض الإدراج من البداية، فالـ journal entries ما تتولّد.

---

## 7) خطة التنفيذ بالترتيب

1. **Migration**: Unique index + trigger على pos_orders + RPC الإغلاق + تفعيل Realtime.
2. **Hook**: `useCurrentShiftWatcher` يشترك بـ Realtime ويُرجع `{ state, closedFrom }`.
3. **Guard في POSPage**: قبل كل تأكيد فاتورة، استدعاء فحص state + التقاط خطأ `POS_SHIFT_CLOSED`.
4. **شاشة المنع** ShiftClosedElsewhereDialog مع الأزرار في القسم 4.
5. **تدفق "فتح عهدة"**: فحص وجود session مفتوحة + الخيارين.
6. **Sync log**: معالجة فشل المزامنة بسبب session مقفولة.
7. **اختبار**: محاكاة جهازين (تبويبين)، تأكيد منع البيع + ظهور الشاشة فوراً.

---

## ما لن يتغير
- منطق فتح/إغلاق العهدة نفسه (نفس الأرصدة، نفس التقارير).
- Print Bridge وملف device.json.
- مخطط journal_entries / journal_lines.
- صلاحيات RLS الحالية (نضيف فقط، لا نعدّل).

---

## للتأكيد قبل البدء
1. هل نسمح بـ "متابعة على هذا الجهاز" (تحويل session لجهاز ثاني تلقائياً)، أم نطلب من الكاشير إغلاق الأول دائماً؟
2. هل إغلاق العهدة الأخرى يحتاج رمز/موافقة مشرف، أم يكفي تنبيه؟
3. هل نخزن السلة الحالية كـ draft عند المنع (فيز 2)، أم نتركها للكاشير يعيد إدخالها؟

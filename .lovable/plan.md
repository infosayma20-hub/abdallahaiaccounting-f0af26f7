# إجراءات المحاسب من دراسة الوردية (عامة لكل شركات يونيفاي)

## الهدف
المحاسب المخوّل يقدر يصحح الوردية من شاشة دراسة الوردية **بعد ما تتسكر الوردية وقبل ما يعتمد تدقيقها**. بعد الاعتماد بتنقفل الوردية. الميزة عامة لكل الشركات، بس **الصلاحية حاليًا مفتوحة لأدمن بيت الكل (amr_x6) فقط**.

## الإجراءات الأربعة
1. **تغيير نوع الدفع**: كل دفعة بتظهر بتفصيلها (كاش، فيزا البنك المعرّف، فيزا ويلز أو أي تطبيق توصيل، ذمة). المحاسب بيحولها لنوع ثاني، والقيد القديم بينعكس وبينعمل قيد جديد على الحساب الصحيح.
2. **تعديل مبلغ الدفعة وتقسيمها**: مثلًا 50 ₪ فيزا بتصير 30 كاش و20 فيزا. لازم يضل مجموع الدفعات مساوي لقيمة الفاتورة.
3. **إلغاء فاتورة**: الإلغاء بيعكس القيد ويرجع المخزون، والفاتورة الأصلية بتضل محفوظة بحالة «ملغاة».
4. **إلغاء مشتريات أو مصروف من الوردية**: بقيد عكسي، والسجل الأصلي بيضل محفوظ ومعلّم أنه ملغى.

بعد كل إجراء بينحسب الكاش المتوقع وفرق الصندوق بالوردية من جديد.

## الضوابط
- **السبب إلزامي** بكل إجراء.
- **سجل قبل وبعد**: مين عدّل، وإمتى، وشو كانت القيمة قبل وبعد التعديل، والسبب. السجل بيظهر بقسم داخل دراسة الوردية.
- ما في حذف لأي إشي: كل تصحيح بيكون بقيد عكسي وقيد جديد.
- الإجراء بيترفض إذا الوردية لسا مفتوحة، أو تدقيقها معتمد، أو فترتها المالية مقفلة.
- الصلاحية بتنفحص على الخادم مع فحص الشركة، مش بس بالواجهة.

## الصلاحيات
بنضيف 4 صلاحيات جديدة للمحاسب ضمن صلاحيات نقطة البيع: تغيير الدفع، تعديل المبلغ، إلغاء فاتورة، وإلغاء مشتريات أو مصروف. الصلاحيات مطفية افتراضيًا لكل الشركات، وبنفعّلها حاليًا لأدمن amr_x6 فقط.

## إشي مش رح نعمله
ما رح نبعت إشعارات لكمال ومصعب، لأنهم تابعين للملكي وهاي الميزة عامة.

## Technical details
- New table `pos_shift_corrections` (company/owner scope, session_id, order_id/purchase_id/expense_id, action, before jsonb, after jsonb, reason, actor, created_at, reversal/new transaction ids). Grants + RLS via is_team_member.
- New SECURITY DEFINER RPCs (all check: auth user is team member of owner, new accountant perm flag or owner admin, session state closed, `pos_shift_audits.status` not approved, fiscal period open, reason ≥3 chars):
  - `pos_shift_change_payment_v1(payment_id, new_method, new_delivery_app?, reason)`
  - `pos_shift_split_payment_v1(order_id, payments jsonb, reason)` — sum must equal order net.
  - `pos_shift_void_order_v1(order_id, reason)` — reuses `void_pos_order` logic, but without requiring an open session.
  - `pos_shift_cancel_purchase_v1(purchase_id, reason)`. Expenses go through the existing `pos_cancel_expense_v1` behind the same gate.
  - GL: `create_reverse_entry` on the original payment transaction, then a new transaction on the target account (resolved the same way as the live POS: card bank, delivery app AR, 1130, cash box).
- `accountant_permissions`: add 4 boolean columns (default false); enable only for amr_x6 owner 9e4d10d9-….
- UI: actions menu per payment/invoice/purchase line in `POSShiftAuditReport.tsx` (hidden without perm or when locked), reason dialog, corrections log section; reload the reconciliation after each action.
- Tests: gate rules (open/approved session rejected, missing reason rejected, split sum mismatch rejected) in a DO-block rollback test plus unit tests for client validation.
- Record the rule in `src/components/pos/AGENTS.md`.

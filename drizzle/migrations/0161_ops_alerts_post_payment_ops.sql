CREATE OR REPLACE FUNCTION public.tg_ops_alert_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE v_owner uuid; v_cashier text; v_branch text; v_det text; v_mgr uuid;
        v_type text; v_title text;
BEGIN
  IF NEW.action='manager_order_discount' THEN
    v_type := 'ops_discount_after_payment';
    v_title := '🏷️ خصم على فاتورة بعد الدفع';
    v_det := '💰 الخصم '||COALESCE(NEW.metadata->>'discount','')||' ₪ — الإجمالي الجديد '||COALESCE(NEW.metadata->>'new_total','')||' ₪';
  ELSIF NEW.action='pos_return' THEN
    v_type := 'ops_return';
    v_title := '↩️ مردود / استرداد بعد الدفع';
    v_det := '💰 قيمة المردود '||COALESCE(NEW.metadata->>'total','')||' ₪ — طريقة الاسترداد: '||_ops_pay_label(COALESCE(NEW.metadata->>'payment_method',''));
  ELSIF NEW.action LIKE 'change_payment_method%' OR NEW.action='manager_payment_adjustment' THEN
    v_type := 'ops_payment_change';
    v_title := '💳 تغيير طريقة الدفع';
    v_det := '🔁 '||CASE WHEN NEW.metadata ? 'from_method' THEN 'من '||_ops_pay_label(NEW.metadata->>'from_method')||' إلى '||_ops_pay_label(NEW.metadata->>'to_method')
              WHEN NEW.metadata ? 'method' THEN 'تعديل دفع من المدير: '||_ops_pay_label(NEW.metadata->>'method')||' '||COALESCE(NEW.metadata->>'amount','')||' '||COALESCE(NEW.metadata->>'currency','')
              ELSE NEW.action END;
  ELSE
    RETURN NEW;
  END IF;

  SELECT s.user_id, s.cashier_name, b.name INTO v_owner, v_cashier, v_branch
    FROM pos_sessions s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=NEW.session_id;
  IF v_owner IS NULL THEN SELECT user_id, name INTO v_owner, v_cashier FROM pos_users WHERE id=NEW.pos_user_id; END IF;
  BEGIN v_mgr := COALESCE(NEW.manager_user_id,(NEW.metadata->>'manager_user_id')::uuid); EXCEPTION WHEN OTHERS THEN v_mgr := NEW.manager_user_id; END;

  PERFORM notify_ops_alert(v_owner, v_type, v_title,
    v_det
    ||E'\n👤 الكاشير: '||COALESCE(v_cashier,'—')||E'\n🏪 '||COALESCE(v_branch,'—')
    ||E'\n✅ المعتمد: '||CASE WHEN v_mgr IS NULL THEN 'بدون مدير' ELSE _ops_user_label(v_mgr) END
    ||COALESCE(E'\n📝 '||NULLIF(trim(NEW.notes),''),'')
    ||E'\n🕒 '||to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
    NULL, v_type||':'||NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END
$func$;
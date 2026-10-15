CREATE OR REPLACE FUNCTION public._ops_user_label(_uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT NULLIF(trim(full_name),'') FROM profiles WHERE id=_uid),
    (SELECT NULLIF(trim(name),'') FROM pos_users WHERE auth_user_id=_uid AND name IS NOT NULL LIMIT 1),
    (SELECT NULLIF(trim(full_name),'') FROM malaki_portal_users WHERE auth_user_id=_uid LIMIT 1),
    (SELECT email FROM auth.users WHERE id=_uid), '—')
$$;

CREATE OR REPLACE FUNCTION public._ops_pay_label(_m text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE lower(coalesce(_m,'')) WHEN 'cash' THEN 'كاش' WHEN 'visa' THEN 'فيزا' WHEN 'card' THEN 'بطاقة'
    WHEN 'credit' THEN 'ذمة' WHEN 'account' THEN 'ذمة' WHEN 'mixed' THEN 'مختلط' WHEN 'employee_account' THEN 'حساب موظف'
    WHEN 'bank_transfer' THEN 'تحويل بنكي' WHEN '' THEN '؟' ELSE _m END
$$;

CREATE OR REPLACE FUNCTION public.tg_ops_alert_order_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record;
BEGIN
  IF NEW.state='cancelled' AND OLD.state IS DISTINCT FROM 'cancelled' THEN
    SELECT * INTO c FROM _ops_order_ctx(NEW.id);
    PERFORM notify_ops_alert(NEW.user_id,'ops_order_cancel','❌ إلغاء فاتورة',
      '🧾 '||COALESCE(c.o_number,'')||E'\n💰 '||COALESCE(round(c.o_total,2)::text,'0')||' ₪'
      ||E'\n👤 الكاشير: '||COALESCE(NULLIF(trim(NEW.cancelled_by),''),c.o_cashier,'—')||E'\n🏪 '||COALESCE(c.o_branch,'—')
      ||E'\n✅ المعتمد: '||COALESCE(NULLIF(trim(NEW.cancelled_approved_by),''),'—')
      ||E'\n📝 '||COALESCE(NULLIF(trim(NEW.cancel_reason),''),'بدون سبب')
      ||E'\n🕒 '||to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
      NULL, 'cancel:'||NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_ops_alert_payment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid; v_cashier text; v_branch text; v_det text; v_mgr uuid;
BEGIN
  IF NOT (NEW.action LIKE 'change_payment_method%' OR NEW.action='manager_payment_adjustment') THEN RETURN NEW; END IF;
  SELECT s.user_id, s.cashier_name, b.name INTO v_owner, v_cashier, v_branch
    FROM pos_sessions s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=NEW.session_id;
  IF v_owner IS NULL THEN SELECT user_id, name INTO v_owner, v_cashier FROM pos_users WHERE id=NEW.pos_user_id; END IF;
  BEGIN v_mgr := COALESCE(NEW.manager_user_id,(NEW.metadata->>'manager_user_id')::uuid); EXCEPTION WHEN OTHERS THEN v_mgr := NEW.manager_user_id; END;
  v_det := CASE WHEN NEW.metadata ? 'from_method' THEN 'من '||_ops_pay_label(NEW.metadata->>'from_method')||' إلى '||_ops_pay_label(NEW.metadata->>'to_method')
                WHEN NEW.metadata ? 'method' THEN 'تعديل دفع من المدير: '||_ops_pay_label(NEW.metadata->>'method')||' '||COALESCE(NEW.metadata->>'amount','')||' '||COALESCE(NEW.metadata->>'currency','')
                ELSE NEW.action END;
  PERFORM notify_ops_alert(v_owner,'ops_payment_change','💳 تغيير طريقة الدفع',
    '🔁 '||v_det||E'\n👤 الكاشير: '||COALESCE(v_cashier,'—')||E'\n🏪 '||COALESCE(v_branch,'—')
    ||E'\n✅ المعتمد: '||CASE WHEN v_mgr IS NULL THEN 'بدون مدير' ELSE _ops_user_label(v_mgr) END
    ||COALESCE(E'\n📝 '||NULLIF(trim(NEW.notes),''),'')
    ||E'\n🕒 '||to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
    NULL, 'pay:'||NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
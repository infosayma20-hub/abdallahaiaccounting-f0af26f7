ALTER TABLE public.malaki_portal_users ADD COLUMN IF NOT EXISTS receive_ops_alerts boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.notify_ops_alert(_owner uuid, _type text, _title text, _body text, _path text, _source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF _owner IS NULL THEN RETURN; END IF;
  FOR r IN SELECT DISTINCT auth_user_id FROM malaki_portal_users
    WHERE user_id=_owner AND is_active AND receive_ops_alerts AND auth_user_id IS NOT NULL LOOP
    BEGIN
      PERFORM enqueue_notification(r.auth_user_id, _type, _title, _body, _path,
        jsonb_build_object('source_id',_source), 'low', 3::smallint, _type||':'||_source||':'||r.auth_user_id, now(), NULL);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    INSERT INTO notification_log(user_id,type,channel,title,body,path)
    VALUES (r.auth_user_id,_type,'in_app',_title,_body,_path);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_ops_alert(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._ops_user_label(_uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT NULLIF(trim(full_name),'') FROM profiles WHERE id=_uid),
    (SELECT name FROM pos_users WHERE auth_user_id=_uid LIMIT 1),
    (SELECT email FROM auth.users WHERE id=_uid), '—')
$$;
REVOKE ALL ON FUNCTION public._ops_user_label(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._ops_order_ctx(_order uuid, OUT o_number text, OUT o_total numeric, OUT o_cashier text, OUT o_branch text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.order_number, COALESCE(o.subtotal,o.total), s.cashier_name, b.name
  FROM pos_orders o LEFT JOIN pos_sessions s ON s.id=o.session_id
  LEFT JOIN branches b ON b.id=COALESCE(o.branch_id,s.branch_id) WHERE o.id=_order
$$;
REVOKE ALL ON FUNCTION public._ops_order_ctx(uuid) FROM PUBLIC, anon, authenticated;

-- 1) Cancellation
CREATE OR REPLACE FUNCTION public.tg_ops_alert_order_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record;
BEGIN
  IF NEW.state='cancelled' AND OLD.state IS DISTINCT FROM 'cancelled' THEN
    SELECT * INTO c FROM _ops_order_ctx(NEW.id);
    PERFORM notify_ops_alert(NEW.user_id,'ops_order_cancel','❌ إلغاء فاتورة',
      '🧾 '||COALESCE(c.o_number,'')||E'\n💰 '||COALESCE(round(c.o_total,2)::text,'0')||' ₪'
      ||E'\n👤 الكاشير: '||COALESCE(c.o_cashier,'—')||E'\n🏪 '||COALESCE(c.o_branch,'—')
      ||E'\n✅ المعتمد: '||COALESCE(_ops_user_label(NEW.cancelled_approved_by),'—')
      ||E'\n📝 '||COALESCE(NULLIF(trim(NEW.cancel_reason),''),'بدون سبب')
      ||E'\n🕒 '||to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
      NULL, 'cancel:'||NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_alert_order_cancel ON public.pos_orders;
CREATE TRIGGER trg_ops_alert_order_cancel AFTER UPDATE OF state ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_ops_alert_order_cancel();

-- 2) Discount
CREATE OR REPLACE FUNCTION public.tg_ops_alert_discount() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; v_pct text;
BEGIN
  SELECT * INTO c FROM _ops_order_ctx(NEW.order_id);
  v_pct := CASE WHEN COALESCE(NEW.subtotal_before,0)>0 THEN round(NEW.discount_amount*100/NEW.subtotal_before)::text||'%' ELSE '' END;
  PERFORM notify_ops_alert(NEW.user_id,'ops_discount','🏷️ خصم '||v_pct,
    '🧾 '||COALESCE(c.o_number,'')||E'\n💰 الخصم '||round(NEW.discount_amount,2)||' ₪ من '||round(COALESCE(NEW.subtotal_before,0),2)||' ₪'
    ||E'\n👤 الكاشير: '||COALESCE(c.o_cashier,_ops_user_label(NEW.applied_by_user_id))||E'\n🏪 '||COALESCE(c.o_branch,'—')
    ||E'\n✅ المعتمد: '||_ops_user_label(COALESCE(NEW.manager_user_id,NEW.applied_by_user_id))
    ||E'\n📝 '||COALESCE(NULLIF(trim(NEW.reason),''),'بدون سبب')
    ||E'\n🕒 '||to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
    NULL, 'disc:'||NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_alert_discount ON public.pos_order_discounts;
CREATE TRIGGER trg_ops_alert_discount AFTER INSERT ON public.pos_order_discounts
FOR EACH ROW EXECUTE FUNCTION public.tg_ops_alert_discount();

-- 3) Payment method change
CREATE OR REPLACE FUNCTION public.tg_ops_alert_payment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid; v_cashier text; v_branch text; v_det text;
BEGIN
  IF NOT (NEW.action LIKE 'change_payment_method%' OR NEW.action='manager_payment_adjustment') THEN RETURN NEW; END IF;
  SELECT s.user_id, s.cashier_name, b.name INTO v_owner, v_cashier, v_branch
    FROM pos_sessions s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=NEW.session_id;
  IF v_owner IS NULL THEN SELECT user_id, name INTO v_owner, v_cashier FROM pos_users WHERE id=NEW.pos_user_id; END IF;
  v_det := CASE WHEN NEW.metadata ? 'from_method' THEN COALESCE(NEW.metadata->>'from_method','?')||' ← '||COALESCE(NEW.metadata->>'to_method','?')
                WHEN NEW.metadata ? 'method' THEN COALESCE(NEW.metadata->>'method','')||' '||COALESCE(NEW.metadata->>'amount','')||' '||COALESCE(NEW.metadata->>'currency','')
                ELSE NEW.action END;
  PERFORM notify_ops_alert(v_owner,'ops_payment_change','💳 تغيير طريقة الدفع',
    '🔁 '||v_det||E'\n👤 الكاشير: '||COALESCE(v_cashier,'—')||E'\n🏪 '||COALESCE(v_branch,'—')
    ||E'\n✅ المعتمد: '||COALESCE(_ops_user_label(COALESCE(NEW.manager_user_id,(NEW.metadata->>'manager_user_id')::uuid)),'—')
    ||COALESCE(E'\n📝 '||NULLIF(trim(NEW.notes),''),'')
    ||E'\n🕒 '||to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
    NULL, 'pay:'||NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_alert_payment_change ON public.pos_sensitive_actions_log;
CREATE TRIGGER trg_ops_alert_payment_change AFTER INSERT ON public.pos_sensitive_actions_log
FOR EACH ROW EXECUTE FUNCTION public.tg_ops_alert_payment_change();

-- 4) Attendance edit
CREATE OR REPLACE FUNCTION public.tg_ops_alert_attendance_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid; v_emp text; v_date text;
  fmt_t text := 'HH24:MI';
BEGIN
  IF NEW.table_name<>'attendance_days' THEN RETURN NEW; END IF;
  SELECT e.user_id, e.full_name, d.attendance_date::text INTO v_owner, v_emp, v_date
    FROM attendance_days d JOIN employees e ON e.id=d.employee_id WHERE d.id=NEW.record_id;
  PERFORM notify_ops_alert(v_owner,'ops_attendance_edit','🕘 تعديل بصمة',
    '👤 الموظف: '||COALESCE(v_emp,'—')||E'\n📅 '||COALESCE(v_date, NEW.new_values->>'attendance_date','—')
    ||E'\n⏱️ قبل: '||COALESCE(to_char((NEW.old_values->>'first_check_in')::timestamptz AT TIME ZONE 'Asia/Hebron',fmt_t),'—')||' - '||COALESCE(to_char((NEW.old_values->>'last_check_out')::timestamptz AT TIME ZONE 'Asia/Hebron',fmt_t),'—')
    ||E'\n⏱️ بعد: '||COALESCE(to_char((NEW.new_values->>'first_check_in')::timestamptz AT TIME ZONE 'Asia/Hebron',fmt_t),'—')||' - '||COALESCE(to_char((NEW.new_values->>'last_check_out')::timestamptz AT TIME ZONE 'Asia/Hebron',fmt_t),'—')
    ||E'\n✏️ عدّلها: '||_ops_user_label(NEW.changed_by)
    ||E'\n📝 '||COALESCE(NULLIF(trim(NEW.reason),''),'بدون سبب')
    ||E'\n🕒 '||to_char(NEW.created_at AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
    NULL, 'att:'||NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_alert_attendance_edit ON public.attendance_audit_logs;
CREATE TRIGGER trg_ops_alert_attendance_edit AFTER INSERT ON public.attendance_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_ops_alert_attendance_edit();

UPDATE public.malaki_portal_users SET receive_ops_alerts=true
WHERE id IN ('74627447-7df8-4570-abea-6b21d7cd2bbf','52fc73e4-10dd-4ecf-9865-de81b7a907ca');
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticateRequest } from "../_shared/auth.ts";

// Simple bcrypt-like hash comparison using Web Crypto
async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

const LOCK_DURATION_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof Response) return auth;
    const { userId } = auth;

    const supabase: any = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { action, ...params } = await req.json();

    switch (action) {
      case "verify_pin": {
        const { pos_user_id, pin, device_fingerprint } = params;
        if (!pos_user_id || !pin || !device_fingerprint) {
          return jsonResponse({ error: "بيانات ناقصة" }, 400);
        }

        // Get POS user
        const { data: posUser, error: userErr } = await supabase
          .from("pos_users")
          .select("*")
          .eq("id", pos_user_id)
          .eq("user_id", userId)
          .single();

        if (userErr || !posUser) {
          // Add artificial delay to prevent timing attacks
          await delay(200 + Math.random() * 300);
          return jsonResponse({ error: "بيانات غير صحيحة" }, 401);
        }

        // Check if locked
        if (posUser.pin_locked_until && new Date(posUser.pin_locked_until) > new Date()) {
          const remaining = Math.ceil((new Date(posUser.pin_locked_until).getTime() - Date.now()) / 60000);
          await logAudit(supabase, userId, posUser.company_id, posUser.id, "pin_fail_locked", "user", posUser.id, { device_fingerprint, remaining_minutes: remaining });
          return jsonResponse({ error: `الحساب مقفل. حاول بعد ${remaining} دقيقة`, locked: true, remaining_minutes: remaining }, 403);
        }

        // Check if active
        if (!posUser.is_active) {
          return jsonResponse({ error: "الحساب معطل" }, 403);
        }

        // Validate device access
        const { data: deviceRecord } = await supabase
          .from("pos_devices")
          .select("id, is_active")
          .eq("device_fingerprint", device_fingerprint)
          .eq("company_id", posUser.company_id)
          .single();

        if (!deviceRecord || !deviceRecord.is_active) {
          await logAudit(supabase, userId, posUser.company_id, posUser.id, "pin_fail_device", "device", null, { device_fingerprint });
          return jsonResponse({ error: "هذا الجهاز غير مسجل أو غير مفعل" }, 403);
        }

        // Check device access permission
        const { data: accessRecord } = await supabase
          .from("pos_user_device_access")
          .select("can_login")
          .eq("pos_user_id", posUser.id)
          .eq("device_id", deviceRecord.id)
          .single();

        if (!accessRecord || !accessRecord.can_login) {
          await logAudit(supabase, userId, posUser.company_id, posUser.id, "pin_fail_no_access", "device", deviceRecord.id, { device_fingerprint });
          return jsonResponse({ error: "لا يُسمح لك بالدخول من هذا الجهاز" }, 403);
        }

        // Verify PIN
        const salt = posUser.id; // Use user ID as salt
        const pinHash = await hashPin(pin, salt);

        if (pinHash !== posUser.pin_hash) {
          const newAttempts = (posUser.pin_failed_attempts || 0) + 1;
          const updates: Record<string, unknown> = { pin_failed_attempts: newAttempts };

          if (newAttempts >= MAX_FAILED_ATTEMPTS) {
            updates.pin_locked_until = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
          }

          await supabase.from("pos_users").update(updates).eq("id", posUser.id);
          await logAudit(supabase, userId, posUser.company_id, posUser.id, "pin_fail", "user", posUser.id, {
            device_fingerprint, attempts: newAttempts, locked: newAttempts >= MAX_FAILED_ATTEMPTS
          });

          await delay(200 + Math.random() * 300);
          const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
          return jsonResponse({
            error: remaining > 0 ? `رمز خاطئ. ${remaining} محاولات متبقية` : `تم قفل الحساب لمدة ${LOCK_DURATION_MINUTES} دقيقة`,
            remaining_attempts: remaining,
            locked: newAttempts >= MAX_FAILED_ATTEMPTS
          }, 401);
        }

        // PIN correct - check for existing open session on another device
        const { data: existingSession } = await supabase
          .from("pos_sessions")
          .select("id, device_id")
          .eq("cashier_pos_user_id", posUser.id)
          .eq("state", "open")
          .single();

        if (existingSession && existingSession.device_id !== deviceRecord.id) {
          return jsonResponse({
            error: "لديك وردية مفتوحة على جهاز آخر. أغلقها أولاً أو اطلب موافقة المدير",
            conflict: true,
            existing_session_id: existingSession.id
          }, 409);
        }

        // Reset failed attempts and update last login
        await supabase.from("pos_users").update({
          pin_failed_attempts: 0,
          pin_locked_until: null,
          last_login_at: new Date().toISOString()
        }).eq("id", posUser.id);

        // Update device last seen
        await supabase.from("pos_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", deviceRecord.id);

        // Get permissions
        const { data: permissions } = await supabase
          .from("pos_user_permissions")
          .select("*")
          .eq("pos_user_id", posUser.id)
          .single();

        // Log success
        await logAudit(supabase, userId, posUser.company_id, posUser.id, "pin_login", "user", posUser.id, {
          device_fingerprint, device_id: deviceRecord.id
        });

        return jsonResponse({
          success: true,
          pos_user: {
            id: posUser.id,
            name: posUser.name,
            role: posUser.role,
            avatar_url: posUser.avatar_url,
            company_id: posUser.company_id,
          },
          permissions: permissions || getDefaultPermissions(posUser.role),
          device_id: deviceRecord.id,
          existing_session: existingSession ? { id: existingSession.id } : null,
        });
      }

      case "hash_pin": {
        // Used when creating/updating POS users - hash their PIN server-side
        const { pin, pos_user_id: saltId } = params;
        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
          return jsonResponse({ error: "الرمز يجب أن يكون 4 أرقام" }, 400);
        }
        const hash = await hashPin(pin, saltId);
        return jsonResponse({ hash });
      }

      case "get_device_users": {
        // Get list of users allowed on this device
        const { device_fingerprint, company_id } = params;
        if (!device_fingerprint || !company_id) {
          return jsonResponse({ error: "بيانات ناقصة" }, 400);
        }

        // Find device
        const { data: device } = await supabase
          .from("pos_devices")
          .select("id")
          .eq("device_fingerprint", device_fingerprint)
          .eq("company_id", company_id)
          .eq("user_id", userId)
          .single();

        if (!device) {
          return jsonResponse({ error: "جهاز غير مسجل", unregistered: true }, 404);
        }

        // Get users with access to this device
        const { data: accessList } = await supabase
          .from("pos_user_device_access")
          .select("pos_user_id")
          .eq("device_id", device.id)
          .eq("can_login", true);

        if (!accessList || accessList.length === 0) {
          return jsonResponse({ users: [], device_id: device.id });
        }

        const posUserIds = accessList.map((a: any) => a.pos_user_id);
        const { data: users } = await supabase
          .from("pos_users")
          .select("id, name, avatar_url, role, is_active, pin_locked_until")
          .in("id", posUserIds)
          .eq("is_active", true);

        return jsonResponse({
          users: (users || []).map((u: any) => ({
            ...u,
            is_locked: u.pin_locked_until ? new Date(u.pin_locked_until) > new Date() : false,
          })),
          device_id: device.id
        });
      }

      case "register_device": {
        const { device_fingerprint, device_name, company_id } = params;
        if (!device_fingerprint || !device_name || !company_id) {
          return jsonResponse({ error: "بيانات ناقصة" }, 400);
        }

        const { data: existing } = await supabase
          .from("pos_devices")
          .select("id")
          .eq("device_fingerprint", device_fingerprint)
          .eq("company_id", company_id)
          .single();

        if (existing) {
          return jsonResponse({ device_id: existing.id, existing: true });
        }

        const { data: newDevice, error: devErr } = await supabase
          .from("pos_devices")
          .insert({
            user_id: userId,
            company_id,
            device_name,
            device_fingerprint,
            last_seen_at: new Date().toISOString()
          })
          .select("id")
          .single();

        if (devErr) {
          return jsonResponse({ error: "فشل تسجيل الجهاز" }, 500);
        }

        await logAudit(supabase, userId, company_id, null, "device_registered", "device", newDevice.id, { device_fingerprint, device_name });

        return jsonResponse({ device_id: newDevice.id, existing: false });
      }

      default:
        return jsonResponse({ error: "إجراء غير معروف" }, 400);
    }
  } catch (err) {
    console.error("pos-pin-auth error:", err);
    return jsonResponse({ error: "خطأ في الخادم" }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDefaultPermissions(role: string) {
  switch (role) {
    case "pos_admin":
      return {
        can_open_register: true, can_close_register: true, can_apply_discount: true,
        max_discount_percent: 100, can_view_profits: true, can_edit_prices: true,
        can_void_sales: true, can_refund: true, can_view_shift_details: true, require_manager_approval: false
      };
    case "pos_manager":
      return {
        can_open_register: true, can_close_register: true, can_apply_discount: true,
        max_discount_percent: 50, can_view_profits: true, can_edit_prices: false,
        can_void_sales: true, can_refund: true, can_view_shift_details: true, require_manager_approval: false
      };
    default:
      return {
        can_open_register: true, can_close_register: true, can_apply_discount: false,
        max_discount_percent: 0, can_view_profits: false, can_edit_prices: false,
        can_void_sales: false, can_refund: false, can_view_shift_details: false, require_manager_approval: true
      };
  }
}

async function logAudit(
  supabase: any,
  userId: string, companyId: string, actorPosUserId: string | null,
  actionType: string, entityType: string, entityId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    await supabase.from("pos_audit_logs").insert({
      user_id: userId,
      company_id: companyId,
      actor_pos_user_id: actorPosUserId,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      device_fingerprint: metadata.device_fingerprint as string || null,
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}

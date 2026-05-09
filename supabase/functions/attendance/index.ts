import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function haversineDistance(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "مستخدم غير صالح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const path = pathParts[pathParts.length - 1];

    // GET /attendance/my or GET /attendance?action=my
    const action = url.searchParams.get("action") || path;

    if (req.method === "GET" && (action === "my" || path === "my")) {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let query = supabase
        .from("attendance_days")
        .select("*, attendance_events(*)")
        .eq("auth_user_id", user.id)
        .order("attendance_date", { ascending: false });
      if (from) query = query.gte("attendance_date", from);
      if (to) query = query.lte("attendance_date", to);
      const { data, error } = await query.limit(60);
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /attendance/breaks — get today's breaks
    if (req.method === "GET" && (action === "breaks" || path === "breaks")) {
      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single();
      if (!employee) {
        return new Response(JSON.stringify({ error: "لم يتم العثور على سجل الموظف" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const today = new Date().toISOString().split("T")[0];
      const { data: breaks } = await supabase
        .from("attendance_breaks")
        .select("*")
        .eq("employee_id", employee.id)
        .gte("break_out", `${today}T00:00:00`)
        .lte("break_out", `${today}T23:59:59`)
        .order("break_out", { ascending: true });
      return new Response(JSON.stringify(breaks || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /attendance/checkin or /attendance/checkout or /attendance/break_out or /attendance/break_in
    if (req.method === "POST") {
      const body = await req.json();
      const { branch_id, qr_token, latitude, longitude, device_info, reason } = body;
      const bodyAction = body.action || path;
      
      const validActions = ["checkin", "checkout", "break_out", "break_in"];
      if (!validActions.includes(bodyAction)) {
        return new Response(JSON.stringify({ error: "مسار غير موجود" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!branch_id || !qr_token || latitude == null || longitude == null) {
        return new Response(
          JSON.stringify({ error: "بيانات ناقصة: branch_id, qr_token, latitude, longitude مطلوبة" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Validate branch
      const { data: branch, error: branchErr } = await supabase
        .from("branches")
        .select("id, name, latitude, longitude, radius_meters, secret_key, qr_rotation_minutes, qr_mode, user_id, require_gps")
        .eq("id", branch_id)
        .eq("is_active", true)
        .single();
      if (branchErr || !branch) {
        return new Response(JSON.stringify({ error: "الفرع غير موجود أو غير فعال" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Geofencing check (per-branch toggle, default ON)
      const gpsRequired = branch.require_gps !== false;
      if (gpsRequired) {
        if (latitude === 0 && longitude === 0) {
          return new Response(
            JSON.stringify({ error: "يرجى تفعيل خدمات الموقع (GPS) لهذا الفرع" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const dist = haversineDistance(latitude, longitude, branch.latitude, branch.longitude);
        if (dist > branch.radius_meters) {
          return new Response(
            JSON.stringify({
              error: `أنت خارج نطاق الفرع (${Math.round(dist)}م بعيد، الحد الأقصى ${branch.radius_meters}م)`,
              distance: Math.round(dist),
              max_radius: branch.radius_meters,
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 3. Validate QR token using HMAC
      const branchSecret = branch.secret_key;
      const rotationMinutes = branch.qr_rotation_minutes || 240;
      
      async function computeHMAC(message: string, sk: string): Promise<string> {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(sk), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      }

      let tokenValid = false;

      if (branch.qr_mode === 'static') {
        const staticToken = await computeHMAC(`${branch_id}:static`, branchSecret);
        tokenValid = qr_token === staticToken;
      } else {
        const currentWindow = Math.floor(Date.now() / (rotationMinutes * 60 * 1000));
        const currentToken = await computeHMAC(`${branch_id}:${currentWindow}`, branchSecret);
        const prevToken = await computeHMAC(`${branch_id}:${currentWindow - 1}`, branchSecret);
        tokenValid = qr_token === currentToken || qr_token === prevToken;
      }
      
      if (!tokenValid) {
        return new Response(JSON.stringify({ error: "رمز QR غير صالح أو منتهي الصلاحية" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Get employee record
      const { data: employee, error: empErr } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, user_id, company_id, work_hours_per_day")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single();
      if (empErr || !employee) {
        return new Response(JSON.stringify({ error: "لم يتم العثور على سجل الموظف" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4.b Multi-tenant guard — employee must belong to the same tenant as the branch
      if (employee.user_id !== branch.user_id) {
        console.warn("[attendance] cross-tenant scan blocked", {
          employee_id: employee.id, employee_owner: employee.user_id,
          branch_id, branch_owner: branch.user_id,
        });
        return new Response(
          JSON.stringify({ error: "هذا الفرع لا يتبع شركتك." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4.c Branch assignment guard — if employee is pinned to a branch, block other branches
      // Allowed if: matches main branch OR present in employee_allowed_branches.
      if (employee.branch_id && employee.branch_id !== branch_id) {
        const { data: allowed } = await supabase
          .from("employee_allowed_branches")
          .select("id")
          .eq("employee_id", employee.id)
          .eq("branch_id", branch_id)
          .maybeSingle();

        if (!allowed) {
          // Look up the employee's main branch name for a clearer message
          const { data: mainBranch } = await supabase
            .from("branches")
            .select("name")
            .eq("id", employee.branch_id)
            .maybeSingle();
          console.warn("[attendance] branch mismatch", {
            employee_id: employee.id,
            employee_main_branch: employee.branch_id,
            scanned_branch: branch_id,
          });
          return new Response(
            JSON.stringify({
              error: `هذا QR لفرع "${branch.name}" بينما فرعك المخصص هو "${mainBranch?.name || "غير محدد"}". يرجى مراجعة الإدارة لإضافة هذا الفرع لقائمة فروعك المسموح بها.`,
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const today = new Date().toISOString().split("T")[0];

      // 5. Get today's events to determine current state
      const { data: todayEvents } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", employee.id)
        .gte("event_time", `${today}T00:00:00`)
        .lte("event_time", `${today}T23:59:59`)
        .eq("status", "valid")
        .order("event_time", { ascending: true });

      const events = todayEvents || [];
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;

      // Check for open break
      const { data: openBreak } = await supabase
        .from("attendance_breaks")
        .select("id, break_out")
        .eq("employee_id", employee.id)
        .is("break_in", null)
        .gte("break_out", `${today}T00:00:00`)
        .lte("break_out", `${today}T23:59:59`)
        .single();

      const isOnBreak = !!openBreak;

      // ─── Handle break_out (مغادرة مؤقتة) ───
      if (bodyAction === "break_out") {
        // Must be checked in and NOT on break
        if (!lastEvent || lastEvent.event_type === "check_out") {
          return new Response(JSON.stringify({ error: "لا يمكن المغادرة المؤقتة بدون تسجيل دخول" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (isOnBreak) {
          return new Response(JSON.stringify({ error: "لديك مغادرة مؤقتة مفتوحة بالفعل. سجّل العودة أولاً" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get attendance_day_id
        const { data: dayRecord } = await supabase
          .from("attendance_days")
          .select("id")
          .eq("employee_id", employee.id)
          .eq("attendance_date", today)
          .single();

        const now = new Date().toISOString();
        const { error: breakErr } = await supabase.from("attendance_breaks").insert({
          attendance_day_id: dayRecord?.id || null,
          employee_id: employee.id,
          auth_user_id: user.id,
          branch_id,
          break_out: now,
          reason: reason || "استراحة",
        });
        if (breakErr) throw breakErr;

        return new Response(JSON.stringify({
          success: true,
          message: `تم تسجيل المغادرة المؤقتة ✅ (${reason || 'استراحة'})`,
          action: "break_out",
          time: now,
          branch: branch.name,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─── Handle break_in (عودة من المغادرة) ───
      if (bodyAction === "break_in") {
        if (!isOnBreak) {
          return new Response(JSON.stringify({ error: "لا يوجد مغادرة مؤقتة مفتوحة" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const now = new Date();
        const breakOutTime = new Date(openBreak!.break_out);
        const durationMinutes = Math.round((now.getTime() - breakOutTime.getTime()) / 60000);

        // Update the break record
        const { error: updateErr } = await supabase
          .from("attendance_breaks")
          .update({
            break_in: now.toISOString(),
            duration_minutes: durationMinutes,
          })
          .eq("id", openBreak!.id);
        if (updateErr) throw updateErr;

        // Recalculate total break minutes for today
        const { data: allBreaks } = await supabase
          .from("attendance_breaks")
          .select("duration_minutes")
          .eq("employee_id", employee.id)
          .gte("break_out", `${today}T00:00:00`)
          .lte("break_out", `${today}T23:59:59`)
          .not("break_in", "is", null);

        const totalBreakMinutes = (allBreaks || []).reduce((s: number, b: any) => s + (b.duration_minutes || 0), 0);

        // Update attendance_days
        const { data: dayRecord } = await supabase
          .from("attendance_days")
          .select("id, total_hours")
          .eq("employee_id", employee.id)
          .eq("attendance_date", today)
          .single();

        if (dayRecord) {
          const totalWorkMinutes = (dayRecord.total_hours || 0) * 60;
          const netWorkMinutes = Math.max(0, totalWorkMinutes - totalBreakMinutes);
          await supabase
            .from("attendance_days")
            .update({
              total_break_minutes: totalBreakMinutes,
              net_work_minutes: netWorkMinutes,
            })
            .eq("id", dayRecord.id);
        }

        return new Response(JSON.stringify({
          success: true,
          message: `تم تسجيل العودة ✅ (${durationMinutes} دقيقة استراحة)`,
          action: "break_in",
          time: now.toISOString(),
          duration_minutes: durationMinutes,
          total_break_minutes: totalBreakMinutes,
          branch: branch.name,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─── Original checkin/checkout logic ───
      const eventType = bodyAction === "checkin" ? "check_in" : "check_out";

      // Validate sequence
      if (eventType === "check_in") {
        if (lastEvent && lastEvent.event_type === "check_in") {
          return new Response(
            JSON.stringify({ error: "لديك بصمة دخول مسجلة بدون خروج. سجّل خروجك أولاً" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // check_out
        if (!lastEvent || lastEvent.event_type === "check_out") {
          return new Response(
            JSON.stringify({ error: "لا يوجد بصمة دخول مفتوحة" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Cannot checkout while on break
        if (isOnBreak) {
          return new Response(
            JSON.stringify({ error: "لا يمكن تسجيل الخروج أثناء المغادرة المؤقتة. سجّل العودة أولاً" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const now = new Date().toISOString();

      // 6. Insert attendance event
      const { error: eventErr } = await supabase.from("attendance_events").insert({
        employee_id: employee.id,
        auth_user_id: user.id,
        branch_id,
        event_type: eventType,
        event_time: now,
        latitude,
        longitude,
        qr_token_used: qr_token,
        device_info: device_info || null,
        status: "valid",
      });
      if (eventErr) throw eventErr;

      // 7. Recalculate attendance_days from all events
      const { data: allEvents } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", employee.id)
        .gte("event_time", `${today}T00:00:00`)
        .lte("event_time", `${today}T23:59:59`)
        .eq("status", "valid")
        .order("event_time", { ascending: true });

      const evts = allEvents || [];
      const firstCheckIn = evts.find(e => e.event_type === "check_in")?.event_time || null;
      const lastCheckOut = [...evts].reverse().find(e => e.event_type === "check_out")?.event_time || null;

      // Calculate total hours from paired sessions
      let totalHours = 0;
      let sessionStart: string | null = null;
      for (const evt of evts) {
        if (evt.event_type === "check_in") {
          sessionStart = evt.event_time;
        } else if (evt.event_type === "check_out" && sessionStart) {
          totalHours += (new Date(evt.event_time).getTime() - new Date(sessionStart).getTime()) / 3600000;
          sessionStart = null;
        }
      }

      const dailyHours = employee.work_hours_per_day || 8;
      const overtime = Math.max(0, totalHours - dailyHours);
      const currentlyIn = evts[evts.length - 1]?.event_type === "check_in";

      // Determine status
      const hour = new Date(firstCheckIn || now).getHours();
      let dayStatus = "present";
      if (hour >= 9) dayStatus = "late";
      if (!currentlyIn && lastCheckOut) dayStatus = totalHours > 0 ? (hour >= 9 ? "late" : "present") : "incomplete";

      // Get break minutes
      const { data: dayBreaks } = await supabase
        .from("attendance_breaks")
        .select("duration_minutes")
        .eq("employee_id", employee.id)
        .gte("break_out", `${today}T00:00:00`)
        .lte("break_out", `${today}T23:59:59`)
        .not("break_in", "is", null);
      const totalBreakMinutes = (dayBreaks || []).reduce((s: number, b: any) => s + (b.duration_minutes || 0), 0);
      const netWorkMinutes = Math.max(0, Math.round(totalHours * 60) - totalBreakMinutes);

      await supabase.from("attendance_days").upsert(
        {
          employee_id: employee.id,
          auth_user_id: user.id,
          branch_id,
          attendance_date: today,
          first_check_in: firstCheckIn,
          last_check_out: lastCheckOut,
          total_hours: Math.round(totalHours * 100) / 100,
          overtime_hours: Math.round(overtime * 100) / 100,
          status: dayStatus,
          total_break_minutes: totalBreakMinutes,
          net_work_minutes: netWorkMinutes,
        },
        { onConflict: "employee_id,attendance_date" }
      );

      const sessionCount = evts.filter(e => e.event_type === "check_in").length;

      return new Response(
        JSON.stringify({
          success: true,
          message: eventType === "check_in"
            ? `تم تسجيل الدخول بنجاح ✅ (الجلسة ${sessionCount})`
            : `تم تسجيل الخروج بنجاح ✅`,
          event_type: eventType,
          time: now,
          branch: branch.name,
          session_count: sessionCount,
          total_hours: Math.round(totalHours * 100) / 100,
          net_work_minutes: netWorkMinutes,
          total_break_minutes: totalBreakMinutes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "مسار غير موجود" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

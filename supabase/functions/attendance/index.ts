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

    // POST /attendance/checkin or /attendance/checkout
    if (req.method === "POST") {
      const body = await req.json();
      const { branch_id, qr_token, latitude, longitude, device_info } = body;
      // Support action from body or URL path
      const bodyAction = body.action || path;
      if (bodyAction !== "checkin" && bodyAction !== "checkout") {
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

      // 1. Validate branch - only select needed fields (secret_key is needed server-side for HMAC)
      const { data: branch, error: branchErr } = await supabase
        .from("branches")
        .select("id, name, latitude, longitude, radius_meters, secret_key, qr_rotation_minutes")
        .eq("id", branch_id)
        .eq("is_active", true)
        .single();
      if (branchErr || !branch) {
        return new Response(JSON.stringify({ error: "الفرع غير موجود أو غير فعال" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Geofencing check (skip if geolocation failed - lat/lng are 0)
      if (latitude !== 0 || longitude !== 0) {
        const dist = haversineDistance(latitude, longitude, branch.latitude, branch.longitude);
        if (dist > branch.radius_meters) {
          return new Response(
            JSON.stringify({
              error: `أنت خارج نطاق الفرع (${Math.round(dist)}م بعيد، الحد الأقصى ${branch.radius_meters}م)`,
              distance: Math.round(dist),
              max_radius: branch.radius_meters,
              your_location: { latitude, longitude },
              branch_location: { latitude: branch.latitude, longitude: branch.longitude },
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

      // Check if branch uses static QR mode
      const { data: branchFull } = await supabase
        .from("branches")
        .select("qr_mode")
        .eq("id", branch_id)
        .single();

      if (branchFull?.qr_mode === 'static') {
        // Static mode: token = HMAC(branchId:static, secret)
        const staticToken = await computeHMAC(`${branch_id}:static`, branchSecret);
        tokenValid = qr_token === staticToken;
      } else {
        // Rotating mode: check current and previous time windows
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
        .select("id, full_name, branch_id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single();
      if (empErr || !employee) {
        return new Response(JSON.stringify({ error: "لم يتم العثور على سجل الموظف" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const eventType = bodyAction === "checkin" ? "check_in" : "check_out";

      // 5. Prevent duplicate check-in without check-out
      if (eventType === "check_in") {
        const { data: existingDay } = await supabase
          .from("attendance_days")
          .select("id, status, first_check_in, last_check_out")
          .eq("employee_id", employee.id)
          .eq("attendance_date", today)
          .single();

        if (existingDay && existingDay.first_check_in && !existingDay.last_check_out) {
          return new Response(
            JSON.stringify({ error: "لديك بصمة دخول مسجلة بدون خروج. سجّل خروجك أولاً" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (existingDay && existingDay.last_check_out) {
          return new Response(
            JSON.stringify({ error: "تم تسجيل حضورك وانصرافك لهذا اليوم بالفعل" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 6. Check-out requires existing check-in
      if (eventType === "check_out") {
        const { data: existingDay } = await supabase
          .from("attendance_days")
          .select("id, first_check_in, last_check_out")
          .eq("employee_id", employee.id)
          .eq("attendance_date", today)
          .single();

        if (!existingDay || !existingDay.first_check_in) {
          return new Response(
            JSON.stringify({ error: "لا يوجد بصمة دخول لهذا اليوم" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (existingDay.last_check_out) {
          return new Response(
            JSON.stringify({ error: "تم تسجيل الانصراف لهذا اليوم بالفعل" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const now = new Date().toISOString();

      // 7. Insert attendance event
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

      // 8. Upsert attendance day
      if (eventType === "check_in") {
        // Determine if late (after 9:00 AM)
        const hour = new Date().getHours();
        const isLate = hour >= 9;

        await supabase.from("attendance_days").upsert(
          {
            employee_id: employee.id,
            auth_user_id: user.id,
            branch_id,
            attendance_date: today,
            first_check_in: now,
            status: isLate ? "late" : "present",
          },
          { onConflict: "employee_id,attendance_date" }
        );
      } else {
        // Check-out: update existing day
        const { data: dayRecord } = await supabase
          .from("attendance_days")
          .select("first_check_in")
          .eq("employee_id", employee.id)
          .eq("attendance_date", today)
          .single();

        let totalHours = 0;
        if (dayRecord?.first_check_in) {
          totalHours = (new Date(now).getTime() - new Date(dayRecord.first_check_in).getTime()) / 3600000;
        }
        const overtime = Math.max(0, totalHours - 8);

        await supabase
          .from("attendance_days")
          .update({
            last_check_out: now,
            total_hours: Math.round(totalHours * 100) / 100,
            overtime_hours: Math.round(overtime * 100) / 100,
          })
          .eq("employee_id", employee.id)
          .eq("attendance_date", today);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: eventType === "check_in" ? "تم تسجيل الدخول بنجاح ✅" : "تم تسجيل الخروج بنجاح ✅",
          event_type: eventType,
          time: now,
          branch: branch.name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "مسار غير موجود" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

// Local business day in Palestine (Asia/Hebron) — avoids UTC midnight cutoffs.
function hebronToday(): string {
  // en-CA → "YYYY-MM-DD"
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron" }).format(new Date());
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

function localDateTimeToUtcIso(datePart: string, hour = 0, minute = 0, second = 0): string {
  const [year, month, day] = datePart.split("-").map(Number);
  const timeZone = "Asia/Hebron";
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  utc = new Date(utc.getTime() - timeZoneOffsetMs(utc, timeZone));
  // Second pass covers DST boundary days safely.
  utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - timeZoneOffsetMs(utc, timeZone));
  return utc.toISOString();
}

function addDays(datePart: string, days: number): string {
  const [year, month, day] = datePart.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function hebronDayRangeUtc(datePart: string): { start: string; end: string } {
  return {
    start: localDateTimeToUtcIso(datePart, 0, 0, 0),
    end: localDateTimeToUtcIso(addDays(datePart, 1), 0, 0, 0),
  };
}

function hebronHour(iso: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hebron",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso)).find((p) => p.type === "hour")?.value;
  return Number(hour || 0);
}

function hebronDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron" }).format(new Date(iso));
}

// Quick magic-bytes check that the decoded buffer is a JPEG / PNG / WebP.
function isSupportedImage(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // WEBP: "RIFF"...."WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return true;
  return false;
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
      const today = hebronToday();
      const todayRange = hebronDayRangeUtc(today);
      const { data: breaks } = await supabase
        .from("attendance_breaks")
        .select("*")
        .eq("employee_id", employee.id)
        .gte("break_out", todayRange.start)
        .lt("break_out", todayRange.end)
        .order("break_out", { ascending: true });
      return new Response(JSON.stringify(breaks || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /attendance/checkin or /attendance/checkout or /attendance/break_out or /attendance/break_in
    if (req.method === "POST") {
      const body = await req.json();
      const { branch_id, qr_token, latitude, longitude, device_info, reason, selfie_base64, device_fingerprint } = body;
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
        .select("id, name, latitude, longitude, radius_meters, secret_key, qr_rotation_minutes, qr_mode, user_id, require_gps, require_attendance_selfie")
        .eq("id", branch_id)
        .eq("is_active", true)
        .single();
      if (branchErr || !branch) {
        return new Response(JSON.stringify({ error: "الفرع غير موجود أو غير فعال" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2.0 Selfie requirement check — مطلوب فقط عند تسجيل الدخول.
      // الخروج يكتفي بمسح QR (قرار سياسي للتسريع وتفادي مشاكل الكاميرا الأمامية).
      const selfieRequired = !!branch.require_attendance_selfie &&
        bodyAction === "checkin";
      if (selfieRequired) {
        if (!selfie_base64 || typeof selfie_base64 !== "string" || selfie_base64.length < 1000) {
          return new Response(
            JSON.stringify({ error: "هذا الفرع يتطلب التقاط صورة سيلفي عند البصمة." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Limit ~5MB binary => ~6.7MB base64. Reject larger to match bucket policy.
        if (selfie_base64.length > 6_900_000) {
          return new Response(
            JSON.stringify({ error: "حجم الصورة كبير جداً. يرجى إعادة الالتقاط." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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

      const today = hebronToday();
      const todayRange = hebronDayRangeUtc(today);

      // 5. Get today's events to determine current state
      const { data: todayEvents } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", employee.id)
        .gte("event_time", todayRange.start)
        .lt("event_time", todayRange.end)
        .eq("status", "valid")
        .order("event_time", { ascending: true });

      const events = todayEvents || [];
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;
      const MAX_OPEN_SESSION_MS = 36 * 60 * 60 * 1000;
      const openLookbackStart = new Date(Date.now() - MAX_OPEN_SESSION_MS).toISOString();
      const { data: recentSequenceEvents } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", employee.id)
        .gte("event_time", openLookbackStart)
        .eq("status", "valid")
        .order("event_time", { ascending: true });

      const sequenceEvents = recentSequenceEvents || [];
      const lastClosedIdx = [...sequenceEvents].map((e) => e.event_type).lastIndexOf("check_out");
      const openSessionStart = sequenceEvents.slice(lastClosedIdx + 1).find((e) => e.event_type === "check_in") || null;

      // Check for open break
      const { data: openBreak } = await supabase
        .from("attendance_breaks")
        .select("id, break_out")
        .eq("employee_id", employee.id)
        .is("break_in", null)
        .gte("break_out", todayRange.start)
        .lt("break_out", todayRange.end)
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
          .gte("break_out", todayRange.start)
          .lt("break_out", todayRange.end)
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
        if (openSessionStart) {
          return new Response(
            JSON.stringify({ error: "لديك بصمة دخول مسجلة بدون خروج. سجّل خروجك أولاً" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // check_out
        if (!openSessionStart) {
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
      const attendanceDate = eventType === "check_out" && openSessionStart
        ? hebronDateFromIso(openSessionStart.event_time)
        : today;
      const attendanceRange = hebronDayRangeUtc(attendanceDate);
      const attendanceCalcEnd = eventType === "check_out"
        ? new Date(Date.now() + 1000).toISOString()
        : attendanceRange.end;

      // 5.b Idempotency guard — if an identical event for this employee was
      // recorded within the last 30 seconds (e.g. user retried after a blank
      // screen / network blip), short-circuit instead of inserting a duplicate.
      {
        const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
        const recentSameType = events
          .filter((e) => e.event_type === (bodyAction === "checkin" ? "check_in" : "check_out"))
          .filter((e) => new Date(e.event_time).getTime() >= new Date(thirtySecondsAgo).getTime());
        if (recentSameType.length > 0) {
          return new Response(
            JSON.stringify({
              success: true,
              duplicate_suppressed: true,
              message: bodyAction === "checkin"
                ? "تم تسجيل الدخول مسبقاً ✅"
                : "تم تسجيل الخروج مسبقاً ✅",
              event_type: bodyAction === "checkin" ? "check_in" : "check_out",
              time: recentSameType[recentSameType.length - 1].event_time,
              branch: branch.name,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 6. For selfie-required branches, upload the selfie BEFORE writing the event.
      // If upload fails we fail the whole request (fail-closed) — no event is written.
      let preUploadedPath: string | null = null;
      if (selfieRequired) {
        try {
          const b64 = selfie_base64.includes(",") ? selfie_base64.split(",")[1] : selfie_base64;
          const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          if (binary.length > 5 * 1024 * 1024) {
            return new Response(
              JSON.stringify({ error: "حجم الصورة كبير جداً (الحد 5MB)." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (!isSupportedImage(binary)) {
            return new Response(
              JSON.stringify({ error: "نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WebP." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const datePart = today;
          // Use a temporary suffix; we'll move/keep this path and link it to the event below.
          const tmpId = crypto.randomUUID();
          const storagePath = `${employee.user_id}/${employee.id}/${datePart}/${tmpId}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from("attendance-selfies")
            .upload(storagePath, binary, { contentType: "image/jpeg", upsert: false });
          if (uploadErr) throw uploadErr;
          preUploadedPath = storagePath;
        } catch (selfieErr: any) {
          console.error("[attendance] selfie upload failed (event NOT written):", selfieErr);
          return new Response(
            JSON.stringify({ error: "تعذّر رفع صورة التحقق. حاول مرة أخرى." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 6.1 Insert attendance event
      const { data: insertedEvent, error: eventErr } = await supabase.from("attendance_events").insert({
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
      }).select("id").single();
      if (eventErr) {
        // Roll back the orphan selfie if event creation failed.
        if (preUploadedPath) {
          await supabase.storage.from("attendance-selfies").remove([preUploadedPath]).catch(() => {});
        }
        throw eventErr;
      }

      // 6.b Link the pre-uploaded selfie to the event via attendance_event_verifications.
      // If linking fails on a selfie-required branch we delete BOTH the event and the file
      // so we never leave a "valid" event without verification.
      if (selfieRequired && preUploadedPath && insertedEvent?.id) {
        const { error: verErr } = await supabase
          .from("attendance_event_verifications")
          .insert({
            attendance_event_id: insertedEvent.id,
            employee_id: employee.id,
            auth_user_id: user.id,
            user_id: employee.user_id,
            branch_id,
            verification_type: "selfie",
            storage_path: preUploadedPath,
            captured_at: now,
            device_info: device_info || null,
          });
        if (verErr) {
          console.error("[attendance] verification insert failed — rolling back event", verErr);
          await supabase.from("attendance_events").delete().eq("id", insertedEvent.id);
          await supabase.storage.from("attendance-selfies").remove([preUploadedPath]).catch(() => {});
          return new Response(
            JSON.stringify({ error: "تعذّر إكمال التحقق. أعد المحاولة." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 6.c Device fingerprint tracking + new-device alert (best-effort, must not break attendance).
      if (device_fingerprint && typeof device_fingerprint === "string" && device_fingerprint.length >= 16) {
        try {
          const { data: trusted } = await supabase
            .from("employee_trusted_devices")
            .select("id, last_seen_at")
            .eq("employee_id", employee.id)
            .eq("device_fingerprint", device_fingerprint)
            .maybeSingle();

          if (trusted) {
            await supabase
              .from("employee_trusted_devices")
              .update({ last_seen_at: now, updated_at: now, label: device_info || null })
              .eq("id", trusted.id);
          } else {
            // New device → register as trusted and raise an alert.
            await supabase.from("employee_trusted_devices").insert({
              employee_id: employee.id,
              auth_user_id: user.id,
              company_id: employee.company_id,
              device_fingerprint,
              label: device_info || null,
              first_seen_at: now,
              last_seen_at: now,
            });

            // De-duplicate: don't create a second alert for the same employee+fingerprint within 60s.
            const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
            const { data: recent } = await supabase
              .from("employee_device_alerts")
              .select("id")
              .eq("employee_id", employee.id)
              .eq("device_fingerprint", device_fingerprint)
              .gte("event_time", oneMinuteAgo)
              .limit(1);

            if (!recent || recent.length === 0) {
              await supabase.from("employee_device_alerts").insert({
                employee_id: employee.id,
                auth_user_id: user.id,
                company_id: employee.company_id,
                branch_id,
                event_type: "new_device",
                event_time: now,
                device_fingerprint,
                notes: `${eventType} • ${device_info || ""}${preUploadedPath ? " • selfie:" + preUploadedPath : ""}`.slice(0, 1000),
              });
            }
          }
        } catch (devErr) {
          // Non-blocking: attendance must succeed even if device tracking fails,
          // but the error is logged EXPLICITLY (not silently) so it surfaces in
          // edge function logs for HR to investigate.
          console.error("[attendance] DEVICE_TRACKING_FAILED", {
            employee_id: employee.id,
            company_id: employee.company_id,
            fingerprint_prefix: device_fingerprint.slice(0, 12),
            error: devErr instanceof Error ? devErr.message : String(devErr),
          });
        }
      }

      // 7. Recalculate attendance_days from all events
      const { data: allEvents } = await supabase
        .from("attendance_events")
        .select("event_type, event_time")
        .eq("employee_id", employee.id)
        .gte("event_time", attendanceRange.start)
        .lt("event_time", attendanceCalcEnd)
        .eq("status", "valid")
        .order("event_time", { ascending: true });

      const evts = allEvents || [];

      // ── Hours policy (documented) ──
      // 1. Debounce: same-type events occurring within 60s of the previous same-type
      //    event are treated as accidental double-taps and dropped from the calculation
      //    (the underlying event rows are still kept in DB for audit).
      // 2. Sessions: after debouncing, we pair check_in → check_out in chronological order.
      //    `total_hours` is the SUM of durations of all CLOSED sessions (an unmatched
      //    final check_in is excluded until a check_out is recorded).
      // 3. Minimum session: a session shorter than MIN_SESSION_MS (60s) is ignored.
      // We do NOT use "first check_in → last check_out" and we do NOT apply any shift
      // template here — the frontend (EmployeeHomeTab) MUST follow the same rules.
      const DEBOUNCE_MS = 60_000;
      const MIN_SESSION_MS = 60_000; // ignore sessions shorter than 1 minute
      const cleaned: { event_type: string; event_time: string }[] = [];
      for (const evt of evts) {
        const last = cleaned[cleaned.length - 1];
        if (last && last.event_type === evt.event_type) {
          const gap = new Date(evt.event_time).getTime() - new Date(last.event_time).getTime();
          if (gap < DEBOUNCE_MS) continue; // duplicate same-type within 60s → skip
        }
        cleaned.push(evt);
      }

      const firstCheckIn = cleaned.find(e => e.event_type === "check_in")?.event_time || null;
      const lastCheckOut = [...cleaned].reverse().find(e => e.event_type === "check_out")?.event_time || null;

      // Pair check_in → check_out, ignore sessions shorter than MIN_SESSION_MS
      let totalHours = 0;
      let sessionStart: string | null = null;
      for (const evt of cleaned) {
        if (evt.event_type === "check_in") {
          if (!sessionStart) sessionStart = evt.event_time;
        } else if (evt.event_type === "check_out" && sessionStart) {
          const durMs = new Date(evt.event_time).getTime() - new Date(sessionStart).getTime();
          if (durMs >= MIN_SESSION_MS) {
            totalHours += durMs / 3600000;
          }
          sessionStart = null;
        }
      }

      const dailyHours = employee.work_hours_per_day || 8;
      const overtime = Math.max(0, totalHours - dailyHours);
      const currentlyIn = evts[evts.length - 1]?.event_type === "check_in";

      // Determine status
      const hour = hebronHour(firstCheckIn || now);
      let dayStatus = "present";
      if (hour >= 9) dayStatus = "late";
      if (!currentlyIn && lastCheckOut) dayStatus = totalHours > 0 ? (hour >= 9 ? "late" : "present") : "incomplete";

      // Get break minutes
      const { data: dayBreaks } = await supabase
        .from("attendance_breaks")
        .select("duration_minutes")
        .eq("employee_id", employee.id)
        .gte("break_out", attendanceRange.start)
        .lt("break_out", attendanceCalcEnd)
        .not("break_in", "is", null);
      const totalBreakMinutes = (dayBreaks || []).reduce((s: number, b: any) => s + (b.duration_minutes || 0), 0);
      const netWorkMinutes = Math.max(0, Math.round(totalHours * 60) - totalBreakMinutes);

      await supabase.from("attendance_days").upsert(
        {
          employee_id: employee.id,
          auth_user_id: user.id,
          branch_id,
          attendance_date: attendanceDate,
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

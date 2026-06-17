import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function hebronDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron" }).format(new Date(iso));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("ZKTECO_WEBHOOK_SECRET");

    if (!webhookSecret || webhookSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    // Action: sync_punches — receive attendance logs from ZKTeco device
    if (action === "sync_punches") {
      const { punches } = body;
      // punches: Array of { fingerprint_id: number, timestamp: string, punch_type: number }
      // punch_type: 0 = check_in, 1 = check_out (ZKTeco standard)

      if (!Array.isArray(punches) || punches.length === 0) {
        return new Response(JSON.stringify({ success: true, processed: 0, message: "No punches to process" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let processed = 0;
      let errors: string[] = [];

      const sortedPunches = [...punches].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const punch of sortedPunches) {
        try {
          const { fingerprint_id, timestamp, punch_type } = punch;

          if (fingerprint_id == null || !timestamp) {
            errors.push(`Invalid punch data: ${JSON.stringify(punch)}`);
            continue;
          }

          // Find employee by fingerprint_id
          const { data: employee, error: empErr } = await supabase
            .from("employees")
            .select("id, full_name, branch_id, auth_user_id, work_hours_per_day")
            .eq("fingerprint_id", fingerprint_id)
            .eq("is_active", true)
            .single();

          if (empErr || !employee) {
            errors.push(`No employee found for fingerprint_id ${fingerprint_id}`);
            continue;
          }

          const eventTime = new Date(timestamp);
          const punchIso = eventTime.toISOString();
          const today = hebronDateFromIso(punchIso);
          let eventType = punch_type === 1 ? "check_out" : "check_in";

          // Check for duplicate event (same employee, same minute)
          const minuteStart = new Date(eventTime);
          minuteStart.setSeconds(0, 0);
          const minuteEnd = new Date(minuteStart.getTime() + 60000);

          const { data: existingAnyEvent } = await supabase
            .from("attendance_events")
            .select("id")
            .eq("employee_id", employee.id)
            .gte("event_time", minuteStart.toISOString())
            .lt("event_time", minuteEnd.toISOString())
            .limit(1);

          if (existingAnyEvent && existingAnyEvent.length > 0) {
            // Already recorded, skip
            continue;
          }

          const lookbackStart = new Date(eventTime.getTime() - 7 * 86400_000).toISOString();
          const { data: recentSequenceEvents } = await supabase
            .from("attendance_events")
            .select("event_type, event_time")
            .eq("employee_id", employee.id)
            .gte("event_time", lookbackStart)
            .lte("event_time", punchIso)
            .eq("status", "valid")
            .order("event_time", { ascending: true });

          const sequenceEvents = recentSequenceEvents || [];
          const lastClosedIdx = [...sequenceEvents].map((e) => e.event_type).lastIndexOf("check_out");
          const openCandidates = sequenceEvents.slice(lastClosedIdx + 1).filter((e) => e.event_type === "check_in");
          const openSessionStart = openCandidates.length > 0 ? openCandidates[openCandidates.length - 1] : null;

          if (eventType === "check_in" && openSessionStart) {
            eventType = "check_out";
          }

          const attendanceDate = eventType === "check_out" && openSessionStart
            ? hebronDateFromIso(openSessionStart.event_time)
            : today;

          // Insert attendance event
          const { error: eventErr } = await supabase.from("attendance_events").insert({
            employee_id: employee.id,
            auth_user_id: employee.auth_user_id || "00000000-0000-0000-0000-000000000000",
            branch_id: employee.branch_id || "00000000-0000-0000-0000-000000000000",
            event_type: eventType,
            event_time: eventTime.toISOString(),
            device_info: "ZKTeco K40",
            status: "valid",
            // Physical fingerprint device — preserve its timestamp (do NOT override with now())
            server_recorded: false,
          });

          if (eventErr) {
            errors.push(`Event insert error for FP ${fingerprint_id}: ${eventErr.message}`);
            continue;
          }

          const attendanceRange = hebronDayRangeUtc(attendanceDate);
          const attendanceCalcEnd = eventType === "check_out"
            ? new Date(eventTime.getTime() + 1000).toISOString()
            : attendanceRange.end;

          if (eventType === "check_in") {
            const hour = hebronHour(punchIso);
            const isLate = hour >= 9;

            await supabase.from("attendance_days").upsert(
              {
                employee_id: employee.id,
                auth_user_id: employee.auth_user_id || "00000000-0000-0000-0000-000000000000",
                branch_id: employee.branch_id,
                attendance_date: attendanceDate,
                first_check_in: punchIso,
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
              .eq("attendance_date", attendanceDate)
              .single();

            if (dayRecord?.first_check_in) {
              const { data: allEvents } = await supabase
                .from("attendance_events")
                .select("event_type, event_time")
                .eq("employee_id", employee.id)
                .gte("event_time", attendanceRange.start)
                .lt("event_time", attendanceCalcEnd)
                .eq("status", "valid")
                .order("event_time", { ascending: true });

              const evts = allEvents || [];
              const firstCheckIn = evts.find((e) => e.event_type === "check_in")?.event_time || dayRecord.first_check_in;
              const lastCheckOut = [...evts].reverse().find((e) => e.event_type === "check_out")?.event_time || punchIso;
              let totalHours = 0;
              let sessionStart: string | null = null;
              for (const evt of evts) {
                if (evt.event_type === "check_in") sessionStart = evt.event_time;
                else if (evt.event_type === "check_out" && sessionStart) {
                  const durMs = new Date(evt.event_time).getTime() - new Date(sessionStart).getTime();
                  if (durMs >= 60_000) totalHours += durMs / 3600000;
                  sessionStart = null;
                }
              }
              const dailyHours = employee.work_hours_per_day || 8;
              const overtime = Math.max(0, totalHours - dailyHours);

              await supabase
                .from("attendance_days")
                .update({
                  first_check_in: firstCheckIn,
                  last_check_out: lastCheckOut,
                  total_hours: Math.round(totalHours * 100) / 100,
                  overtime_hours: Math.round(overtime * 100) / 100,
                })
                .eq("employee_id", employee.id)
                .eq("attendance_date", attendanceDate);
            } else {
              // No check-in yet — create day with check-out only (manual correction needed)
              await supabase.from("attendance_days").upsert(
                {
                  employee_id: employee.id,
                  auth_user_id: employee.auth_user_id || "00000000-0000-0000-0000-000000000000",
                  branch_id: employee.branch_id,
                  attendance_date: attendanceDate,
                  last_check_out: punchIso,
                  status: "incomplete",
                },
                { onConflict: "employee_id,attendance_date" }
              );
            }
          }

          processed++;
        } catch (e) {
          errors.push(`Punch error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          processed,
          total: punches.length,
          errors: errors.length > 0 ? errors : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: health check
    if (action === "ping") {
      return new Response(JSON.stringify({ success: true, message: "ZKTeco webhook is alive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

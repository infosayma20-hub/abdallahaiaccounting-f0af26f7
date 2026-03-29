import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

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

      for (const punch of punches) {
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
          const today = eventTime.toISOString().split("T")[0];
          const eventType = punch_type === 1 ? "check_out" : "check_in";

          // Check for duplicate event (same employee, same minute)
          const minuteStart = new Date(eventTime);
          minuteStart.setSeconds(0, 0);
          const minuteEnd = new Date(minuteStart.getTime() + 60000);

          const { data: existingEvent } = await supabase
            .from("attendance_events")
            .select("id")
            .eq("employee_id", employee.id)
            .eq("event_type", eventType)
            .gte("event_time", minuteStart.toISOString())
            .lt("event_time", minuteEnd.toISOString())
            .limit(1);

          if (existingEvent && existingEvent.length > 0) {
            // Already recorded, skip
            continue;
          }

          // Insert attendance event
          const { error: eventErr } = await supabase.from("attendance_events").insert({
            employee_id: employee.id,
            auth_user_id: employee.auth_user_id || "00000000-0000-0000-0000-000000000000",
            branch_id: employee.branch_id || "00000000-0000-0000-0000-000000000000",
            event_type: eventType,
            event_time: eventTime.toISOString(),
            device_info: "ZKTeco K40",
            status: "valid",
          });

          if (eventErr) {
            errors.push(`Event insert error for FP ${fingerprint_id}: ${eventErr.message}`);
            continue;
          }

          // Upsert attendance day
          if (eventType === "check_in") {
            const hour = eventTime.getHours();
            const isLate = hour >= 9;

            await supabase.from("attendance_days").upsert(
              {
                employee_id: employee.id,
                auth_user_id: employee.auth_user_id || "00000000-0000-0000-0000-000000000000",
                branch_id: employee.branch_id,
                attendance_date: today,
                first_check_in: eventTime.toISOString(),
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

            if (dayRecord?.first_check_in) {
              const totalHours =
                (eventTime.getTime() - new Date(dayRecord.first_check_in).getTime()) / 3600000;
              const dailyHours = employee.work_hours_per_day || 10;
              const overtime = Math.max(0, totalHours - dailyHours);

              await supabase
                .from("attendance_days")
                .update({
                  last_check_out: eventTime.toISOString(),
                  total_hours: Math.round(totalHours * 100) / 100,
                  overtime_hours: Math.round(overtime * 100) / 100,
                })
                .eq("employee_id", employee.id)
                .eq("attendance_date", today);
            } else {
              // No check-in yet — create day with check-out only (manual correction needed)
              await supabase.from("attendance_days").upsert(
                {
                  employee_id: employee.id,
                  auth_user_id: employee.auth_user_id || "00000000-0000-0000-0000-000000000000",
                  branch_id: employee.branch_id,
                  attendance_date: today,
                  last_check_out: eventTime.toISOString(),
                  status: "incomplete",
                },
                { onConflict: "employee_id,attendance_date" }
              );
            }
          }

          processed++;
        } catch (e) {
          errors.push(`Punch error: ${e.message}`);
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

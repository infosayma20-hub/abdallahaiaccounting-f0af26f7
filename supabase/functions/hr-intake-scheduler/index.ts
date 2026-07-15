// hr-intake-scheduler
// -------------------
// Runs hourly (via pg_cron). For every company that opted into
// automatic intake management, it computes whether the "advances"
// and "leaves" employee forms should be OPEN today, and flips the
// existing `hr_allow_advance_requests` / `hr_allow_leave_requests`
// switches accordingly.
//
// Companies with `hr_intake_auto_managed = false` are never touched.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Settings = {
  id: string;
  hr_intake_auto_managed: boolean;
  hr_allow_advance_requests: boolean | null;
  hr_allow_leave_requests: boolean | null;
  hr_advance_requests_closed_message: string | null;
  hr_leave_requests_closed_message: string | null;
  hr_advance_intake_schedule_enabled: boolean;
  hr_advance_intake_open_day: number | null;
  hr_advance_intake_close_day: number | null;
  hr_leave_intake_schedule_enabled: boolean;
  hr_leave_intake_open_day: number | null;
  hr_leave_intake_close_day: number | null;
  hr_payroll_freeze_enabled: boolean;
  hr_payroll_freeze_days_before: number;
  hr_salary_day: number | null;
};

const AUTO_MSG_PREFIX = "[تلقائي]";

/** Palestine local day-of-month (Asia/Hebron). */
function localDayOfMonth(now: Date): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hebron",
    day: "2-digit",
  });
  return Number(fmt.format(now));
}

/** Inclusive day-window check. Supports wrap-around (e.g. open=25 close=5). */
function isWithinWindow(today: number, open: number, close: number): boolean {
  if (open === close) return today === open;
  if (open < close) return today >= open && today <= close;
  // wrap: open=25, close=5 → open days 25..31 or 1..5
  return today >= open || today <= close;
}

/** Days remaining until the next occurrence of `day` (0 = today). */
function daysUntil(today: number, day: number): number {
  // Approximate month length 30 — enough for a "N days before payroll" window.
  return (day - today + 30) % 30;
}

function computeAdvanceState(s: Settings, today: number): { open: boolean; reason: string | null } {
  // Payroll-freeze window has priority.
  if (s.hr_payroll_freeze_enabled && s.hr_salary_day) {
    const dist = daysUntil(today, s.hr_salary_day);
    if (dist <= (s.hr_payroll_freeze_days_before ?? 5)) {
      return {
        open: false,
        reason: `${AUTO_MSG_PREFIX} مغلق تلقائياً — تجميد ما قبل الرواتب. يُعاد الفتح بعد يوم الراتب (${s.hr_salary_day}).`,
      };
    }
  }
  // Monthly schedule.
  if (s.hr_advance_intake_schedule_enabled && s.hr_advance_intake_open_day && s.hr_advance_intake_close_day) {
    const inside = isWithinWindow(today, s.hr_advance_intake_open_day, s.hr_advance_intake_close_day);
    if (!inside) {
      return {
        open: false,
        reason: `${AUTO_MSG_PREFIX} استقبال طلبات السلف مغلق حالياً. يُفتح من يوم ${s.hr_advance_intake_open_day} حتى يوم ${s.hr_advance_intake_close_day} من كل شهر.`,
      };
    }
  }
  return { open: true, reason: null };
}

function computeLeaveState(s: Settings, today: number): { open: boolean; reason: string | null } {
  if (s.hr_leave_intake_schedule_enabled && s.hr_leave_intake_open_day && s.hr_leave_intake_close_day) {
    const inside = isWithinWindow(today, s.hr_leave_intake_open_day, s.hr_leave_intake_close_day);
    if (!inside) {
      return {
        open: false,
        reason: `${AUTO_MSG_PREFIX} استقبال طلبات الإجازات مغلق حالياً. يُفتح من يوم ${s.hr_leave_intake_open_day} حتى يوم ${s.hr_leave_intake_close_day} من كل شهر.`,
      };
    }
  }
  return { open: true, reason: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = localDayOfMonth(new Date());

  const { data: rows, error } = await admin
    .from("company_settings")
    .select(
      "id, hr_intake_auto_managed, hr_allow_advance_requests, hr_allow_leave_requests, hr_advance_requests_closed_message, hr_leave_requests_closed_message, hr_advance_intake_schedule_enabled, hr_advance_intake_open_day, hr_advance_intake_close_day, hr_leave_intake_schedule_enabled, hr_leave_intake_open_day, hr_leave_intake_close_day, hr_payroll_freeze_enabled, hr_payroll_freeze_days_before, hr_salary_day"
    )
    .eq("hr_intake_auto_managed", true);

  if (error) {
    console.error("fetch settings failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const raw of (rows || []) as Settings[]) {
    const adv = computeAdvanceState(raw, today);
    const lv = computeLeaveState(raw, today);

    const patch: Record<string, unknown> = {};
    // Only update fields that actually change (idempotent).
    if ((raw.hr_allow_advance_requests ?? true) !== adv.open) {
      patch.hr_allow_advance_requests = adv.open;
    }
    if ((raw.hr_allow_leave_requests ?? true) !== lv.open) {
      patch.hr_allow_leave_requests = lv.open;
    }
    // Manage messages ONLY when they are auto-generated (start with the marker)
    // or empty — never overwrite a message the admin wrote manually.
    const advMsg = raw.hr_advance_requests_closed_message || "";
    if (!adv.open && adv.reason && (advMsg === "" || advMsg.startsWith(AUTO_MSG_PREFIX)) && advMsg !== adv.reason) {
      patch.hr_advance_requests_closed_message = adv.reason;
    } else if (adv.open && advMsg.startsWith(AUTO_MSG_PREFIX)) {
      patch.hr_advance_requests_closed_message = null;
    }
    const lvMsg = raw.hr_leave_requests_closed_message || "";
    if (!lv.open && lv.reason && (lvMsg === "" || lvMsg.startsWith(AUTO_MSG_PREFIX)) && lvMsg !== lv.reason) {
      patch.hr_leave_requests_closed_message = lv.reason;
    } else if (lv.open && lvMsg.startsWith(AUTO_MSG_PREFIX)) {
      patch.hr_leave_requests_closed_message = null;
    }

    if (Object.keys(patch).length === 0) {
      results.push({ id: raw.id, changed: false });
      continue;
    }

    const { error: uErr } = await admin
      .from("company_settings")
      .update(patch)
      .eq("id", raw.id);
    if (uErr) {
      console.error("update failed for", raw.id, uErr);
      results.push({ id: raw.id, changed: false, error: uErr.message });
    } else {
      results.push({ id: raw.id, changed: true, patch });
    }
  }

  return new Response(
    JSON.stringify({ today, processed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
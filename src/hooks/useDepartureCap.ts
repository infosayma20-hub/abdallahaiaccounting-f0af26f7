import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTURE_CAP_MIN } from "@/lib/attendance-departures";

/**
 * إعداد سقف المغادرات اليومي (الوقت بين الجلسات) من إعدادات الموارد البشرية.
 * الميزة اختيارية لكل شركة: `hr_departure_cap_enabled` + `hr_departure_cap_minutes`.
 * عند تعطيلها لا تُعرض أي مؤشرات أو تنبيهات تجاوز في أي شاشة.
 */
export type DepartureCapConfig = { enabled: boolean; cap: number; loading: boolean };

export function useDepartureCap(): DepartureCapConfig {
  const [state, setState] = useState<DepartureCapConfig>({ enabled: false, cap: DEPARTURE_CAP_MIN, loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) { if (alive) setState((s) => ({ ...s, loading: false })); return; }
        const { data: owner } = await supabase.rpc("get_team_owner_id", { _user_id: uid });
        const ownerId = (owner as string) || uid;
        const { data } = await supabase
          .from("company_settings")
          .select("hr_departure_cap_enabled, hr_departure_cap_minutes")
          .eq("user_id", ownerId)
          .maybeSingle();
        if (!alive) return;
        setState({
          enabled: !!(data as any)?.hr_departure_cap_enabled,
          cap: Number((data as any)?.hr_departure_cap_minutes) > 0
            ? Number((data as any).hr_departure_cap_minutes)
            : DEPARTURE_CAP_MIN,
          loading: false,
        });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { alive = false; };
  }, []);

  return state;
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Company-level switch for the HR <-> employee chat
 * (`company_settings.hr_employee_chat_enabled`, default ON).
 *
 * Resolved through `get_team_owner_id` so both the employee app and the HR
 * screens read the same tenant row. Server-side the `hr_chat_send_message`
 * RPC rejects new messages when the switch is off, so the UI gate is not the
 * only line of defence.
 */
export function useHREmployeeChatEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: ownerId } = await supabase.rpc("get_team_owner_id");
        if (!ownerId) {
          if (!cancelled) setEnabled(true);
          return;
        }
        const { data } = await supabase
          .from("company_settings")
          .select("hr_employee_chat_enabled")
          .eq("user_id", ownerId as string)
          .maybeSingle();
        if (!cancelled) setEnabled((data as any)?.hr_employee_chat_enabled !== false);
      } catch {
        // Fail open: a settings read failure must not silently kill messaging.
        if (!cancelled) setEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled: enabled === true, loading: enabled === null };
}

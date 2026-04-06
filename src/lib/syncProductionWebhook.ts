import { supabase } from "@/integrations/supabase/client";

interface SyncPayload {
  user_id: string;
  order_id: string;
  order_reference?: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  sub_stage?: string;
  changed_by_name?: string;
  changed_by_role?: string;
  metadata?: Record<string, any>;
}

/**
 * Fire-and-forget sync call to log status changes via edge function.
 * Does not block the UI — errors are logged silently.
 */
export function syncProductionToWebhook(payload: SyncPayload) {
  supabase.functions.invoke("sync-production-amwali", {
    body: payload,
  }).then(({ error }) => {
    if (error) console.warn("[sync-production] webhook log failed:", error.message);
  }).catch((err) => {
    console.warn("[sync-production] webhook call failed:", err);
  });
}

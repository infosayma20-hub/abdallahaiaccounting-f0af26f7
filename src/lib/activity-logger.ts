import { supabase } from "@/integrations/supabase/client";

interface LogActivityParams {
  userId: string; // data owner (team owner)
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  details?: Record<string, any>;
}

export async function logActivity({
  userId,
  actorId,
  actorName,
  action,
  entityType,
  entityId,
  entityLabel,
  details,
}: LogActivityParams) {
  try {
    await (supabase as any).from("activity_log").insert({
      user_id: userId,
      actor_id: actorId,
      actor_name: actorName,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      entity_label: entityLabel || null,
      details: details || null,
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

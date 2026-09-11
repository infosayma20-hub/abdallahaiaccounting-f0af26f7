/**
 * Command Context V1 (client side).
 *
 * The client can only provide *hints* (source, device, company/branch the UI
 * is currently working in). The authenticated actor and the effective data
 * owner are always resolved and validated server-side by
 * `public.resolve_command_context_v1`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CommandSource } from "./command-envelope-v1";

export interface CommandContextHints {
  source: CommandSource;
  deviceId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  correlationId?: string | null;
}

export interface ResolvedCommandContextV1 {
  version: 1;
  actor_id: string;
  owner_id: string;
  company_id: string | null;
  branch_id: string | null;
  source: CommandSource;
  device_id: string | null;
}

/** Server-side context resolution (read-only, no financial effect). */
export async function resolveCommandContextV1(
  hints: CommandContextHints,
): Promise<ResolvedCommandContextV1> {
  const { data, error } = await supabase.rpc("resolve_command_context_v1" as any, {
    p_source: hints.source,
    p_company_id: hints.companyId ?? null,
    p_branch_id: hints.branchId ?? null,
    p_device_id: hints.deviceId ?? null,
  } as any);
  if (error) throw error;
  return data as unknown as ResolvedCommandContextV1;
}

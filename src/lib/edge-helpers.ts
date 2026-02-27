import { supabase } from "@/integrations/supabase/client";

/**
 * Get the authorization headers for edge function calls.
 * Uses the user's access_token (not the anon key).
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("User not authenticated");
  return { Authorization: `Bearer ${token}` };
}

/**
 * Get auth headers with content-type for POST/PATCH/DELETE requests.
 */
export async function getAuthHeadersJson(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders();
  return { ...headers, "Content-Type": "application/json" };
}

/**
 * Build the full edge function URL.
 */
export function edgeUrl(functionName: string, params?: Record<string, string>): string {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
  if (!params) return base;
  const qs = new URLSearchParams(params).toString();
  return `${base}?${qs}`;
}

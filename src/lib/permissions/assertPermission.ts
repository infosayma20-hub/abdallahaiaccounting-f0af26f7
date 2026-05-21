import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkFeaturePermission } from "@/hooks/usePermission";

interface AssertOptions {
  /** Suppress the toast on deny (caller will handle UX). */
  silent?: boolean;
  /** Override the deny message. */
  message?: string;
}

/**
 * Server-trusted permission check for sensitive event handlers.
 * Use INSIDE handlers — UI hiding via <Can> alone is not enough since a user
 * can call handlers from devtools.
 *
 *   await assertPermission("sales", "invoices", "create");
 *   // throws on deny, shows toast unless { silent: true }
 */
export async function assertPermission(
  app: string,
  feature: string,
  perm: string,
  opts: AssertOptions = {}
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (!opts.silent) toast.error("يجب تسجيل الدخول");
    throw new Error("not_authenticated");
  }
  const ok = await checkFeaturePermission(user.id, app, feature, perm);
  if (!ok) {
    if (!opts.silent) toast.error(opts.message ?? "لا تملك صلاحية تنفيذ هذه العملية");
    throw new Error(`permission_denied:${app}.${feature}.${perm}`);
  }
}

/** Boolean variant — does not throw or toast. */
export async function hasPermission(
  app: string, feature: string, perm: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  return checkFeaturePermission(user.id, app, feature, perm);
}
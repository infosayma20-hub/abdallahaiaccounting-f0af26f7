/**
 * Captures ?ref=CODE from URL into localStorage at signup landing,
 * and calls apply_referral_signup RPC once user is authenticated.
 */
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "amwali_ref_code";

export const captureRefFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref && ref.length >= 4 && ref.length <= 12) {
    localStorage.setItem(REF_KEY, ref.toUpperCase());
  }
};

export const consumeReferralIfAny = async () => {
  const code = localStorage.getItem(REF_KEY);
  if (!code) return;
  try {
    await supabase.rpc("apply_referral_signup", { p_code: code });
    localStorage.removeItem(REF_KEY);
  } catch {
    // ignore - retry next session
  }
};
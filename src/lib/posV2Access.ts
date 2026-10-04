// POS v2 is a visual experiment. Besides demo tenants it is enabled only for
// these specific users (by login email). It shares all sales/print logic with
// /pos, so this list controls presentation only — never permissions.
const POS_V2_USER_EMAILS = new Set<string>(["adhamyaseen@malaky.com"]);

export function isPosV2User(email?: string | null): boolean {
  return !!email && POS_V2_USER_EMAILS.has(email.trim().toLowerCase());
}

const OPT_OUT_KEY = "pos_v2_opt_out";
export const posV2OptOut = {
  get: () => { try { return sessionStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; } },
  set: (v: boolean) => { try { v ? sessionStorage.setItem(OPT_OUT_KEY, "1") : sessionStorage.removeItem(OPT_OUT_KEY); } catch { /* ignore */ } },
};

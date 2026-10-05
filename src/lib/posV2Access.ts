// POS v2 is the default presentation. This session flag keeps the legacy
// screen available without changing permissions, sales, or print behavior.
const OPT_OUT_KEY = "pos_v2_opt_out";
export const posV2OptOut = {
  get: () => { try { return sessionStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; } },
  set: (v: boolean) => { try { v ? sessionStorage.setItem(OPT_OUT_KEY, "1") : sessionStorage.removeItem(OPT_OUT_KEY); } catch { /* ignore */ } },
};

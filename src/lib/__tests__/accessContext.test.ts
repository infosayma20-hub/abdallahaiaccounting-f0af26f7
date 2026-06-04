import { describe, it, expect } from "vitest";
import { defaultRouteFor } from "../accessContext";

describe("defaultRouteFor", () => {
  it("owner + setup incomplete → /setup", () => {
    expect(defaultRouteFor("company_owner", [], false, true).route).toBe("/setup");
  });
  it("owner + setup complete → /apps", () => {
    expect(defaultRouteFor("company_owner", [], true, true).route).toBe("/apps");
  });
  it("employee + company ready → /employee", () => {
    expect(defaultRouteFor("employee", [], true, false).route).toBe("/employee");
  });
  it("employee + company not ready → blocked", () => {
    const r = defaultRouteFor("employee", [], false, false);
    expect(r.route).toBe("/blocked/company-not-ready");
    expect(r.blockingReason).toBe("company_setup_incomplete");
  });
  it("sales_rep never sees /setup", () => {
    expect(defaultRouteFor("sales_rep", [], false, false).route).toBe("/rep/home");
  });
  it("cashier never sees /setup", () => {
    expect(defaultRouteFor("cashier", [], false, false).route).toBe("/choose-workspace");
  });
  it("call_center never sees /setup", () => {
    expect(defaultRouteFor("call_center", [], false, false).route).toBe("/pos");
  });
  it("portal_user never sees /setup", () => {
    expect(defaultRouteFor("portal_user", [], false, false).route).toBe("/portal/dashboard");
  });
  it("company_admin (invited) + ready → /apps, not /setup", () => {
    expect(defaultRouteFor("company_admin", [], true, false).route).toBe("/apps");
  });
  it("unlinked with permission → /setup; without → blocked", () => {
    expect(defaultRouteFor("unlinked", [], false, true).route).toBe("/setup");
    const blocked = defaultRouteFor("unlinked", [], false, false);
    expect(blocked.route).toBe("/blocked/unlinked");
    expect(blocked.blockingReason).toBe("unlinked_account");
  });
  it("super_admin → super admin dashboard", () => {
    expect(defaultRouteFor("super_admin", [], false, false).route).toBe("/super-admin/dashboard");
  });
  it("company_owner without canSetup is BLOCKED, never sent to /setup", () => {
    const r = defaultRouteFor("company_owner", [], false, false);
    expect(r.route).toBe("/blocked/no-setup-permission");
    expect(r.blockingReason).toBe("not_allowed_setup");
  });
  it("unknown account type falls through to /blocked, NEVER /setup", () => {
    // @ts-expect-error — intentionally invalid to test the safety net
    const r = defaultRouteFor("garbage", [], false, true);
    expect(r.route).toBe("/blocked/unlinked");
    expect(r.blockingReason).toBe("unknown_state");
  });
});
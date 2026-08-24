import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Briefcase, Truck, LogOut, ShoppingCart, Headphones, Lock, RefreshCw, PhoneCall, MessageSquareWarning, HandCoins } from "lucide-react";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { clearRoleRedirectCache } from "@/hooks/useRoleRedirect";
import { useBridgeAuthorized } from "@/hooks/useBridgeAuthorized";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";
import { usePermission } from "@/hooks/usePermission";
import { useAccountantPOSAudit } from "@/hooks/useAccountantPOSAudit";

export default function ChooseWorkspacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles: sharedRoles } = useUserRoles();
  const [hasRep, setHasRep] = useState(false);
  const [hasCashier, setHasCashier] = useState(false);
  const [isCallCenter, setIsCallCenter] = useState(false);
  // Shared outsourced call-center company accounts (شركة دايال) — POS/call-center screen only.
  const [sharedCallCenterOnly, setSharedCallCenterOnly] = useState(false);
  const [hasEmployee, setHasEmployee] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const { authorized: bridgeAuthorized, checking: bridgeChecking, recheck } = useBridgeAuthorized();
  const { isDeviceAdmin } = useIsDeviceAdmin();
  const feedbackPerms = usePermission("call_center_feedback");
  const canFeedback = !feedbackPerms.loading && feedbackPerms.can("customers", "view") && !sharedCallCenterOnly;
  // Read-only complaints workspace (granted per employee from the employees screen)
  const canComplaintsView = !feedbackPerms.loading && feedbackPerms.can("complaints", "view") && !sharedCallCenterOnly;
  // Read-only compensations workspace (granted per employee from the employees screen)
  const canCompensationsView = !feedbackPerms.loading && feedbackPerms.can("compensations", "view") && !sharedCallCenterOnly;
  const posAudit = useAccountantPOSAudit();
  const canPosAudit = !posAudit.loading && posAudit.isAccountant && posAudit.enabled;

  // Cashier may enter /pos only when Bridge is reachable.
  // Admins are allowed in (read-only mode is enforced inside POS).
  // Call Center does NOT print — it only forwards orders to cashier terminals,
  // so the Print Bridge is irrelevant for it.
  const posBlocked =
    !bridgeChecking && !bridgeAuthorized && !isDeviceAdmin && !isCallCenter;

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const [{ data: posUser }, { data: empRow }] = await Promise.all([
          supabase.from("pos_users").select("is_call_center, hide_employee_workspace").eq("auth_user_id", user.id).maybeSingle(),
          supabase
            .from("employees")
            .select("id, is_active, is_terminated")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
        ]);
        // Roles come from the shared React Query cache — see useUserRoles.
        const roles = sharedRoles;
        const linkedPosUser = posUser as { is_call_center?: boolean | null; hide_employee_workspace?: boolean | null } | null;
        const linkedEmployee = empRow as { is_active?: boolean | null; is_terminated?: boolean | null } | null;
        setHasRep(roles.includes("sales_rep"));
        setHasCashier(roles.includes("cashier") || !!posUser);
        setIsCallCenter(!!linkedPosUser && !!linkedPosUser.is_call_center);
        // Shared call-center company accounts (e.g. dial1@malaky.com) opt out
        // of the Employee workspace via `pos_users.hide_employee_workspace`.
        // Individual employees who happen to also have call-center permission
        // are unaffected — this flag is set per pos_users row, not per role.
        const hideEmployee = !!linkedPosUser && !!linkedPosUser.hide_employee_workspace;
        setSharedCallCenterOnly(hideEmployee && !!linkedPosUser?.is_call_center);
        setHasEmployee(
          !hideEmployee &&
          !!linkedEmployee &&
          !!linkedEmployee.is_active &&
          !linkedEmployee.is_terminated,
        );
      } catch (err) {
        // Never leave the chooser blank — render the page so the user can
        // at least sign out or pick a workspace manually.
        console.warn("[ChooseWorkspace] roles/employee fetch failed:", err);
      } finally {
        setRolesLoaded(true);
      }
    })();
  }, [user?.id, sharedRoles]);

  const choose = (path: "/employee" | "/rep" | "/pos" | "/feedback" | "/pos-reports" | "/customer-complaints" | "/complaints-view" | "/compensations" | "/compensations-view") => {
    try {
      if (user?.id) {
        sessionStorage.setItem(`workspace-choice:${user.id}`, path);
        clearRoleRedirectCache(user.id);
      }
    } catch {
      // Session storage can be unavailable in restricted browser modes.
    }
    window.dispatchEvent(new Event("workspace-choice-changed"));
    navigate(path, { replace: true });
  };

  // Auto-redirect if exactly one workspace is available (e.g. feedback-only).
  useEffect(() => {
    if (!rolesLoaded || feedbackPerms.loading) return;
    if (canFeedback && !hasRep && !hasCashier && !hasEmployee && !canPosAudit && !canComplaintsView) {
      choose("/feedback");
    }
    if (canComplaintsView && !hasRep && !hasCashier && !hasEmployee && !canPosAudit && !canFeedback) {
      choose("/complaints-view");
    }
    if (canPosAudit && !hasRep && !hasCashier && !hasEmployee && !canFeedback && !canComplaintsView) {
      choose("/pos-reports");
    }
    // Cashier-only accounts (no other workspaces) skip the chooser.
    // Call-center accounts always see the chooser: they also get the
    // "شكاوى الزبائن" workspace card.
    if (hasCashier && !isCallCenter && !hasRep && !hasEmployee && !canFeedback && !canPosAudit && !canComplaintsView && !posBlocked) {
      choose("/pos");
    }
    // Shared call-center company accounts have a single workspace — skip the chooser.
    if (sharedCallCenterOnly && hasCashier && !hasRep && !hasEmployee && !canPosAudit && !posBlocked) {
      choose("/pos");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoaded, feedbackPerms.loading, hasRep, hasCashier, hasEmployee, canFeedback, canComplaintsView, canPosAudit, posBlocked, isCallCenter, sharedCallCenterOnly]);

  const signOut = async () => {
    try {
      if (user?.id) sessionStorage.removeItem(`workspace-choice:${user.id}`);
    } catch {
      // Session storage cleanup is best-effort.
    }
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-2xl space-y-5 sm:space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">اختر مساحة العمل</h1>
          <p className="text-muted-foreground text-sm">عندك صلاحية تدخل على أكثر من واجهة. اختار الواجهة اللي بدك تشتغل عليها هلا.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {hasRep && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/rep")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/rep")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Truck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">شاشة المندوب</h2>
            <p className="text-sm text-muted-foreground">طلبيات، تحصيلات، مصاريف اليوم</p>
            <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/rep"); }}>
              دخول كمندوب
            </Button>
          </Card>
          )}

          {hasCashier && (
          <Card
            role="button"
            tabIndex={posBlocked ? -1 : 0}
            onClick={() => { if (!posBlocked) choose("/pos"); }}
            onKeyDown={(e) => { if (!posBlocked && (e.key === "Enter" || e.key === " ")) choose("/pos"); }}
            aria-disabled={posBlocked}
            className={
              "p-6 transition-all flex flex-col items-center text-center gap-3 " +
              (posBlocked
                ? "opacity-60 cursor-not-allowed border-dashed"
                : "cursor-pointer hover:border-primary hover:shadow-lg")
            }
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              {posBlocked ? <Lock className="w-8 h-8 text-muted-foreground" /> :
                isCallCenter ? <Headphones className="w-8 h-8 text-primary" /> : <ShoppingCart className="w-8 h-8 text-primary" />}
            </div>
            <h2 className="text-lg font-semibold">{isCallCenter ? "شاشة الكول سنتر" : "شاشة نقطة البيع"}</h2>
            {posBlocked ? (
              <>
                <p className="text-xs text-red-600 font-medium leading-relaxed">
                  هذا الجهاز غير مصرح لاستخدام نقطة البيع
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  نقطة البيع تعمل فقط على أجهزة الفرع المثبت عليها برنامج الطباعة.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 gap-1"
                  onClick={(e) => { e.stopPropagation(); void recheck(); }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> إعادة الفحص
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{isCallCenter ? "استقبال الطلبات وتحويلها للفرع" : "بيع، فواتير، إغلاق وردية"}</p>
                <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/pos"); }}>
                  {isCallCenter ? "دخول كول سنتر" : "دخول كاشير"}
                </Button>
              </>
            )}
          </Card>
          )}

          {isCallCenter && !sharedCallCenterOnly && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/customer-complaints")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/customer-complaints")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <MessageSquareWarning className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold">شكاوى الزبائن</h2>
            <p className="text-sm text-muted-foreground">تسجيل ومتابعة شكاوى الزبائن والتعويضات</p>
            <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/customer-complaints"); }}>
              دخول الشكاوى
            </Button>
          </Card>
          )}

          {canComplaintsView && !isCallCenter && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/complaints-view")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/complaints-view")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <MessageSquareWarning className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold">شكاوى الزبائن</h2>
            <p className="text-sm text-muted-foreground">الاطلاع على سجل الشكاوى وحالات المتابعة</p>
            <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/complaints-view"); }}>
              دخول الشكاوى
            </Button>
          </Card>
          )}



          {hasEmployee && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/employee")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/employee")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-accent-foreground" />
            </div>
            <h2 className="text-lg font-semibold">شاشة الموظف</h2>
            <p className="text-sm text-muted-foreground">دوام، إجازات، قسائم راتب</p>
            <Button variant="secondary" className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/employee"); }}>
              دخول كموظف
            </Button>
          </Card>
          )}

          {canFeedback && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/feedback")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/feedback")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <PhoneCall className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold">متابعة الزبائن</h2>
            <p className="text-sm text-muted-foreground">بحث الزبائن، عرض الطلبات، تسجيل المكالمات</p>
            <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/feedback"); }}>
              دخول متابعة الزبائن
            </Button>
          </Card>
          )}

          {canPosAudit && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/pos-reports")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/pos-reports")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">تدقيق ورديات نقطة البيع</h2>
            <p className="text-sm text-muted-foreground">عرض الورديات والمبيعات للفروع المسموحة (للقراءة فقط)</p>
            <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/pos-reports"); }}>
              دخول التدقيق
            </Button>
          </Card>
          )}
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            تسجيل خروج
          </Button>
        </div>
      </div>
    </div>
  );
}

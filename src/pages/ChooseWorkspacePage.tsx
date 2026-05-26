import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Briefcase, Truck, LogOut, ShoppingCart, Headphones, Lock, RefreshCw, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearRoleRedirectCache } from "@/hooks/useRoleRedirect";
import { useBridgeAuthorized } from "@/hooks/useBridgeAuthorized";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";
import { usePermission } from "@/hooks/usePermission";

export default function ChooseWorkspacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hasRep, setHasRep] = useState(false);
  const [hasCashier, setHasCashier] = useState(false);
  const [isCallCenter, setIsCallCenter] = useState(false);
  const [hasEmployee, setHasEmployee] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const { authorized: bridgeAuthorized, checking: bridgeChecking, recheck } = useBridgeAuthorized();
  const { isDeviceAdmin } = useIsDeviceAdmin();
  const feedbackPerms = usePermission("call_center_feedback");
  const canFeedback = !feedbackPerms.loading && feedbackPerms.can("customers", "view");

  // Cashier may enter /pos only when Bridge is reachable.
  // Admins are allowed in (read-only mode is enforced inside POS).
  const posBlocked = !bridgeChecking && !bridgeAuthorized && !isDeviceAdmin;

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: rolesData }, { data: posUser }, { data: empRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("pos_users").select("is_call_center").eq("auth_user_id", user.id).maybeSingle(),
        supabase
          .from("employees")
          .select("id, is_active, is_terminated")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
      ]);
      const roles = (rolesData || []).map((r: any) => r.role);
      setHasRep(roles.includes("sales_rep"));
      setHasCashier(roles.includes("cashier"));
      setIsCallCenter(!!(posUser as any)?.is_call_center);
      setHasEmployee(!!empRow && (empRow as any).is_active && !(empRow as any).is_terminated);
      setRolesLoaded(true);
    })();
  }, [user?.id]);

  // Auto-redirect if exactly one workspace is available (e.g. feedback-only).
  useEffect(() => {
    if (!rolesLoaded || feedbackPerms.loading) return;
    const cards = [hasRep, hasCashier, hasEmployee, canFeedback].filter(Boolean).length;
    if (cards === 1 && canFeedback && !hasRep && !hasCashier && !hasEmployee) {
      choose("/feedback");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoaded, feedbackPerms.loading, hasRep, hasCashier, hasEmployee, canFeedback]);

  const choose = (path: "/employee" | "/rep" | "/pos" | "/feedback") => {
    try {
      if (user?.id) {
        sessionStorage.setItem(`workspace-choice:${user.id}`, path);
        clearRoleRedirectCache(user.id);
      }
    } catch {}
    window.dispatchEvent(new Event("workspace-choice-changed"));
    navigate(path, { replace: true });
  };

  const signOut = async () => {
    try {
      if (user?.id) sessionStorage.removeItem(`workspace-choice:${user.id}`);
    } catch {}
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">اختر مساحة العمل</h1>
          <p className="text-muted-foreground text-sm">عندك صلاحية الدخول لأكثر من واجهة. اختر اللي تبغى تشتغل عليها الحين.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
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

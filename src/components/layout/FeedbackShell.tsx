import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Standalone shell for /feedback.
 *
 * Intentionally avoids:
 *   - AppSidebar / WebLayout
 *   - TopBar / TabBar / global search
 *   - App launcher / module navigation
 *
 * Renders only: company name, page title, current user, sign-out, and children.
 */
export default function FeedbackShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string>("");

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Tenant/team owner profile → company name (so team members see the
      // parent company, not their own profile's company_name).
      const { data: ownerId } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const tenantId = (ownerId as string | null) || user.id;
      const { data: owner } = await supabase
        .from("profiles")
        .select("company_name")
        .eq("user_id", tenantId)
        .maybeSingle();
      setCompanyName(((owner as any)?.company_name) || "");
    })();
  }, [user?.id, user?.email]);

  const goToWorkspaceChooser = () => {
    try {
      if (user?.id) sessionStorage.removeItem(`workspace-choice:${user.id}`);
    } catch {}
    navigate("/choose-workspace", { replace: true });
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background flex flex-col w-full">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="w-full max-w-none px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="الرجوع إلى اختيار مساحة العمل"
                className="shrink-0 -mr-2"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">الرجوع إلى اختيار مساحة العمل</AlertDialogTitle>
                <AlertDialogDescription className="text-right">
                  هل تريد الرجوع إلى اختيار مساحة العمل؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
                <AlertDialogAction onClick={goToWorkspaceChooser}>
                  نعم، رجوع
                </AlertDialogAction>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
            <div className="min-w-0 text-right">
              <h1 className="text-sm sm:text-base font-bold text-foreground leading-tight truncate">
                متابعة الزبائن
              </h1>
              {companyName && (
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {companyName}
                </p>
              )}
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <PhoneCall className="w-[18px] h-[18px] text-emerald-600" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-none px-3 sm:px-6 lg:px-8 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
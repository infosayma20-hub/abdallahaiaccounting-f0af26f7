import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("company_name, display_name, full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setCompanyName((data as any).company_name || "");
        setDisplayName((data as any).display_name || (data as any).full_name || user.email || "");
      } else {
        setDisplayName(user.email || "");
      }
    })();
  }, [user?.id, user?.email]);

  const signOut = async () => {
    try {
      if (user?.id) sessionStorage.removeItem(`workspace-choice:${user.id}`);
    } catch {}
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <PhoneCall className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground leading-tight truncate">متابعة الزبائن</h1>
              {companyName && (
                <p className="text-xs text-muted-foreground truncate">{companyName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {displayName && (
              <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[160px]">
                {displayName}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">تسجيل خروج</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-4">
        {children}
      </main>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useHasMultipleWorkspaces } from "@/hooks/useHasMultipleWorkspaces";
import PortalComplaintsTab from "@/pages/portal/PortalComplaintsTab";

/**
 * Read-only customer complaints workspace for staff who were granted the
 * "شكاوى الزبائن" permission. Renders the exact same view used in the owner
 * portal (PortalComplaintsTab) so both audiences see an identical screen.
 */
export default function ComplaintsViewPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth() as any;
  const { dataOwnerId } = useDataOwnerId();
  const { hasMultiple } = useHasMultipleWorkspaces() as any;
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-4 py-3">
        <div className="text-sm font-bold">شكاوى الزبائن</div>
        <div className="flex items-center gap-2">
          {hasMultiple && (
            <button
              onClick={() => navigate("/choose-workspace")}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" /> مساحات العمل
            </button>
          )}
          <button
            onClick={() => signOut?.()}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> خروج
          </button>
        </div>
      </header>

      {!dataOwnerId ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PortalComplaintsTab theme={theme} ownerId={dataOwnerId} />
      )}
    </div>
  );
}

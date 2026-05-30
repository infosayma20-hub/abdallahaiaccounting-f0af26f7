import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Guards /pos-reports against POS cashier users.
 * Allows only:
 *  - account owner (auth user === dataOwnerId), OR
 *  - pos_users.is_admin === true (legacy), OR
 *  - pos_user_permissions.view_pos_reports === true.
 * Otherwise redirects to /pos with toast + audit log entry.
 */
export default function POSReportsGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) {
          if (!cancelled) setStatus("denied");
          return;
        }

        // Resolve data owner (team owner if invited)
        const { data: owner } = await (supabase.rpc as any)("resolve_effective_owner_id", {
          _auth_uid: uid,
        });
        const dataOwnerId = (owner as string) || uid;

        // Account owner → always allowed
        if (dataOwnerId === uid) {
          if (!cancelled) setStatus("allowed");
          return;
        }

        // Lookup pos_users record + permissions
        const { data: posUserRaw } = await supabase
          .from("pos_users")
          .select("*")
          .eq("auth_user_id", uid)
          .eq("user_id", dataOwnerId)
          .eq("is_active", true)
          .maybeSingle();
        const posUser = posUserRaw as any;

        if (posUser?.is_admin) {
          if (!cancelled) setStatus("allowed");
          return;
        }

        if (posUser?.id) {
          const { data: perms } = await supabase
            .from("pos_user_permissions")
            .select("view_pos_reports")
            .eq("pos_user_id", posUser.id)
            .maybeSingle();
          if ((perms as any)?.view_pos_reports === true) {
            if (!cancelled) setStatus("allowed");
            return;
          }
        }

        // Denied → log + toast
        try {
          await (supabase.from("pos_sensitive_actions_log" as any) as any).insert({
            company_id: dataOwnerId,
            action: "unauthorized_reports_access",
            pos_user_id: posUser?.id || null,
            notes: "محاولة دخول /pos-reports من مستخدم بدون صلاحية",
          });
        } catch {
          /* ignore */
        }
        toast.error("لا تملك صلاحية الوصول لتقارير نقطة البيع");
        if (!cancelled) setStatus("denied");
      } catch {
        if (!cancelled) setStatus("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (status === "denied") return <Navigate to="/pos" replace />;
  return <>{children}</>;
}
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SPARTA_HOLDING_ID = "0a0655c6-b2b1-4607-a949-311cb8fb9f77";

/**
 * Restricts /sparta/* to users who are members of the Sparta holding.
 * Any other authenticated user is redirected to /apps with a denial flag.
 */
export default function SpartaTenantGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setChecking(false); setAllowed(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("holding_members")
        .select("id")
        .eq("holding_id", SPARTA_HOLDING_ID)
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setAllowed(!error && !!data);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/g/sparta" replace />;
  if (!allowed) return <Navigate to="/apps" replace />;
  return <>{children}</>;
}
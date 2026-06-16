import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** True if the current authenticated user has any branch_manager_assignments row. */
export function useIsBranchManager() {
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { if (alive) { setIsManager(false); setLoading(false); } return; }
        const { count } = await supabase
          .from("branch_manager_assignments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);
        if (alive) setIsManager((count || 0) > 0);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  return { isManager, loading };
}

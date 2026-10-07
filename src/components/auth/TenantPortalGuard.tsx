import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPortalSlug } from "@/lib/tenantPortal";

/** On a tenant portal domain, signs out any session that does not belong to that tenant (checked server-side). */
export default function TenantPortalGuard() {
  useEffect(() => {
    const slug = getPortalSlug();
    if (!slug) return;
    let checkedFor: string | null = null;
    const verify = async (userId: string | undefined) => {
      if (!userId || checkedFor === userId) return;
      checkedFor = userId;
      const { data, error } = await supabase.rpc("check_tenant_portal_access", { p_slug: slug });
      if (error) { checkedFor = null; return; } // transient: retry on next auth event
      if (data !== true) {
        await supabase.auth.signOut();
        toast.error("هذا الحساب غير تابع لهذه الشركة");
        if (!window.location.pathname.startsWith("/auth")) window.location.replace("/auth");
      }
    };
    supabase.auth.getSession().then(({ data }) => verify(data.session?.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { checkedFor = null; return; }
      setTimeout(() => verify(session.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}

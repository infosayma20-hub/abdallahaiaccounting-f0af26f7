import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function QRMenuTopBarButton({ onClick }: { onClick: () => void }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("company_settings")
        .select("qr_menu_enabled").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setEnabled(!!(data as any)?.qr_menu_enabled);
    })();
    const loadPending = async () => {
      const { count } = await supabase.from("qr_menu_orders")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", "pending");
      if (!cancelled) setPending(count || 0);
    };
    loadPending();
    const ch = supabase.channel("qr_topbar_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "qr_menu_orders", filter: `user_id=eq.${user.id}` }, loadPending)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user]);

  if (!enabled) return null;

  return (
    <button onClick={onClick}
      className="relative hidden xl:flex h-9 w-9 rounded-lg items-center justify-center hover:bg-white/[0.08] transition-all shrink-0"
      title="منيو QR">
      <QrCode className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
      {pending > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-bold">
          {pending}
        </span>
      )}
    </button>
  );
}
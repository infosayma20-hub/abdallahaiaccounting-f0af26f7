/**
 * Short link for display devices — /d/:code
 *
 * Resolves the device's *permanent* short code into its *current* token and
 * forwards to the matching display screen. Rotating a device token therefore
 * never breaks the printed/bookmarked short link.
 */
import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Resolved = { token: string; device_type: string; name?: string } | null;

export default function DisplayShortLinkPage() {
  const { code } = useParams<{ code: string }>();
  const [resolved, setResolved] = useState<Resolved>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) { setError("رمز غير صالح"); return; }
      const { data, error: err } = await supabase.rpc("kds_resolve_display_code_v2" as any, { _code: code });
      if (cancelled) return;
      if (err || !data || !(data as any).token) {
        setError("الرابط غير صالح أو الجهاز غير مفعّل");
        return;
      }
      setResolved(data as any);
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-destructive">{error}</p>
          <p className="text-sm text-muted-foreground">تواصل مع الإدارة لإعادة إصدار رابط الشاشة.</p>
        </div>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">جارٍ فتح الشاشة…</p>
      </div>
    );
  }

  const path =
    resolved.device_type === "heater_screen" ? "/pos/heater-screen"
    : resolved.device_type === "kitchen_screen" ? "/pos/kitchen-display"
    : "/pos/order-display";

  return <Navigate to={`${path}?token=${encodeURIComponent(resolved.token)}`} replace />;
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LogPayload {
  user_id: string;
  user_email?: string;
  user_name?: string;
  event_type: string;
  auth_method?: string;
  metadata?: Record<string, unknown>;
}

function parseUA(ua: string) {
  const lower = ua.toLowerCase();
  let device_type = "desktop";
  if (/mobile|android|iphone/.test(lower)) device_type = "mobile";
  else if (/ipad|tablet/.test(lower)) device_type = "tablet";

  let browser = "Unknown";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("chrome/")) browser = "Chrome";
  else if (lower.includes("firefox/")) browser = "Firefox";
  else if (lower.includes("safari/") && !lower.includes("chrome")) browser = "Safari";

  let os = "Unknown";
  if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("mac os")) os = "macOS";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("linux")) os = "Linux";

  return { device_type, browser, os };
}

async function getGeoFromIP(ip: string): Promise<{ country?: string; city?: string }> {
  try {
    if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("192.168.")) {
      return { country: "Local", city: "Local" };
    }
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return {};
    const data = await res.json();
    return { country: data.country_name || data.country, city: data.city };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: LogPayload = await req.json();
    if (!payload.user_id || !payload.event_type) {
      return new Response(JSON.stringify({ error: "user_id and event_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ua = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const { device_type, browser, os } = parseUA(ua);
    const geo = await getGeoFromIP(ip);

    // كشف جهاز جديد: نقارن بآخر سجل ناجح للمستخدم
    let is_new_device = false;
    let is_suspicious = false;
    let risk_score = 0;

    if (payload.event_type === "login_success" || payload.event_type === "signup") {
      const { data: lastLogins } = await supabase
        .from("user_security_audit")
        .select("ip_address, browser, os, country")
        .eq("user_id", payload.user_id)
        .eq("event_type", "login_success")
        .order("created_at", { ascending: false })
        .limit(20);

      if (lastLogins && lastLogins.length > 0) {
        const seenIPs = new Set(lastLogins.map((l) => l.ip_address));
        const seenCountries = new Set(lastLogins.map((l) => l.country).filter(Boolean));

        if (!seenIPs.has(ip)) {
          is_new_device = true;
          risk_score += 20;
        }
        if (geo.country && seenCountries.size > 0 && !seenCountries.has(geo.country)) {
          is_suspicious = true;
          risk_score += 50;
        }
      }

      // كشف محاولات الدخول الفاشلة المتكررة
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: failedCount } = await supabase
        .from("user_security_audit")
        .select("*", { count: "exact", head: true })
        .eq("user_id", payload.user_id)
        .eq("event_type", "login_failed")
        .gte("created_at", since);

      if ((failedCount || 0) >= 3) {
        is_suspicious = true;
        risk_score += 30;
      }
    }

    const { error } = await supabase.from("user_security_audit").insert({
      user_id: payload.user_id,
      user_email: payload.user_email,
      user_name: payload.user_name,
      event_type: payload.event_type,
      auth_method: payload.auth_method,
      ip_address: ip,
      user_agent: ua,
      device_type,
      browser,
      os,
      country: geo.country,
      city: geo.city,
      is_new_device,
      is_suspicious,
      risk_score: Math.min(risk_score, 100),
      metadata: payload.metadata || {},
    });

    if (error) {
      console.error("Insert failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, is_new_device, is_suspicious, risk_score }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

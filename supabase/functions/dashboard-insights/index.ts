import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * dashboard-insights — يولّد ملاحظات ذكية مختصرة (3-5 نقاط) من ملخص بيانات اللوحة.
 * Body: { context: string, language?: "ar" | "en" }
 * يستخدم Lovable AI (google/gemini-2.5-flash) — لا يحتاج API key من المستخدم.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { context, language = "ar" } = await req.json();
    if (!context || typeof context !== "string") throw new Error("context is required");
    if (context.length > 6000) throw new Error("context too long");

    const sys = language === "ar"
      ? "أنت محلل مالي خبير. اقرأ ملخص بيانات اللوحة وقدم 3 إلى 5 ملاحظات مختصرة وعملية بصيغة نقاط، كل نقطة سطر واحد فقط، ابدأ بإيموجي مناسب. لا تكرر الأرقام، ركّز على الاتجاهات والتنبيهات والفرص. لا مقدمات."
      : "You are a senior financial analyst. From the dashboard summary, output 3 to 5 short, actionable bullets — one line each, starting with a relevant emoji. Focus on trends, alerts, opportunities. No preamble.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: context },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited", message: "تجاوزت حد الطلبات، حاول لاحقاً" }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted", message: "نفذ رصيد الذكاء الاصطناعي" }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const insights = data?.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error("dashboard-insights error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

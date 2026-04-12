import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `أنت سامي، مستشار مبيعات محترف لبرنامج أموالي (AMWALI).

قواعد:
- لهجة فلسطينية/شامية دارجة، محترمة ومهنية
- ردود قصيرة — جملتين إلى ثلاث كحد أقصى
- لا إطالة، لا "بكل سرور"، لا "سؤال ممتاز"
- ركز على القيمة، اطرح سؤال واحد في نهاية كل رد

معلومات أموالي:
- نظام ERP سحابي عربي 100% للسوق الفلسطيني والأردني
- الدومين: amwali.app — تجربة مجانية 14 يوم
- Starter ₪99/شهر، Professional ₪199/شهر، Enterprise حسب الطلب

الميزات:
1. المحاسب الذكي AI — تكتب بالعربي الدارج وبيسجل القيد تلقائياً
2. محاسبة كاملة: قيود، فواتير، ميزان مراجعة، كشوفات حساب
3. نقطة بيع POS مع طباعة حرارية مباشرة
4. موارد بشرية: رواتب، حضور بصمة، إجازات، خصومات
5. مخزون، شيكات، ورشات، مقاولات، سياحة وسفر
6. ضريبة القيمة المضافة 16% وفق القانون الفلسطيني
7. متعدد الفروع والمستخدمين

لما يسأل عن السعر: ذكّر بالتجربة المجانية 14 يوم.
لما يريد يسجل: "ابدأ تجربتك على amwali.app — مجاناً 14 يوم".
لما يطلب تواصل: اجمع اسمه ورقمه ونوع عمله.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.slice(-10),
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("sami-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

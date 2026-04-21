// Enhance template text using Lovable AI Gateway
// Modes: formal (رسمي), expand (توسيع), improve (تحسين), shorten (مختصر), legal (قانوني)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS: Record<string, string> = {
  formal: "أعد صياغة النص التالي بأسلوب رسمي مهني عربي فصيح يصلح للمراسلات التجارية الرسمية في الشركات الفلسطينية. حافظ على نفس المعنى وأي أرقام/أسماء/تواريخ مذكورة. لا تضف معلومات جديدة. أعد فقط النص المُحسَّن بدون أي تعليقات أو علامات اقتباس.",
  expand: "وسّع النص التالي ليصبح أكثر تفصيلاً ووضوحاً بأسلوب عربي رسمي يصلح لمستند تجاري. أضف صياغة مهنية لطيفة مع الحفاظ على نفس المعنى الأساسي وأي أرقام/أسماء/تواريخ. أعد فقط النص الموسَّع بدون أي تعليقات أو علامات اقتباس.",
  improve: "حسّن صياغة النص التالي ليكون أكثر احترافية ووضوحاً بالعربية الفصحى مع الحفاظ على المعنى وأي أرقام/أسماء/تواريخ. صحّح أي أخطاء إملائية أو نحوية. أعد فقط النص المُحسَّن بدون تعليقات أو علامات اقتباس.",
  shorten: "اختصر النص التالي مع الحفاظ على المعنى الأساسي وأي أرقام/أسماء/تواريخ مهمة. اجعله موجزاً ومباشراً بأسلوب عربي رسمي. أعد فقط النص المختصر بدون تعليقات أو علامات اقتباس.",
  legal: "أعد صياغة النص التالي بأسلوب قانوني رسمي يصلح للعقود والاتفاقيات في فلسطين. استخدم مصطلحات قانونية واضحة مع الحفاظ على المعنى وأي أرقام/أسماء/تواريخ. أعد فقط النص بدون تعليقات أو علامات اقتباس.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, mode, context } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "النص مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text.length > 4000) {
      return new Response(JSON.stringify({ error: "النص طويل جداً (الحد الأقصى 4000 حرف)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promptInstruction = PROMPTS[mode] || PROMPTS.improve;
    const contextHint = context ? `\n\nسياق المستند: ${context}` : "";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY غير مُعرَّف" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد تحرير نصوص عربية متخصص في المستندات التجارية والقانونية في فلسطين. تعيد فقط النص المطلوب بدون أي شرح أو تعليق إضافي.",
          },
          {
            role: "user",
            content: `${promptInstruction}${contextHint}\n\nالنص:\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "تم تجاوز الحد المسموح من الطلبات. حاول لاحقاً." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "رصيد Lovable AI مستنفد. أضف رصيداً من إعدادات الـ Workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "خطأ في خدمة الذكاء الاصطناعي" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const enhanced = (data.choices?.[0]?.message?.content || "").trim();

    if (!enhanced) {
      return new Response(JSON.stringify({ error: "لم يتم إرجاع نص محسَّن" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip leading/trailing quote characters that the model may add
    const cleaned = enhanced.replace(/^["'«»“”\s]+|["'«»“”\s]+$/g, "");

    return new Response(JSON.stringify({ text: cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("enhance-template-text error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "خطأ غير معروف" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
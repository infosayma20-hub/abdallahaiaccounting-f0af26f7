import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth gate: prevents anonymous abuse of the AI quota.
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const { fileData, fileName, fileType, image, task, prompt } = body;
    // The data scope is ALWAYS the authenticated caller — never a client-supplied id.
    const userId = authResult.userId;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Invoice number extraction mode
    if (task === "extract_invoice_number" && image) {
      const extractMessages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || "Extract the invoice number from this document. Return ONLY the invoice number as plain text. If not found, return NOT_FOUND." },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ];

      const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: extractMessages }),
      });

      if (!extractResponse.ok) {
        const t = await extractResponse.text();
        console.error("AI extraction error:", extractResponse.status, t);
        return new Response(JSON.stringify({ invoice_number: null, text: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const extractData = await extractResponse.json();
      const extractedText = extractData.choices?.[0]?.message?.content?.trim() || "";
      
      const invoiceNumber = extractedText === "NOT_FOUND" ? null : extractedText;
      return new Response(JSON.stringify({ invoice_number: invoiceNumber, text: extractedText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Original document analysis mode
    const isImage = fileType?.startsWith("image/");

    const messages: any[] = [
      {
        role: "system",
        content: `أنت محلل وثائق مالي ذكي. حلل الوثيقة المالية المرفقة (فاتورة، كشف بنك، إيصال، إلخ) واستخرج:
1. نوع الوثيقة
2. ملخص المحتوى
3. البنود والمبالغ
4. الإجمالي
5. اسم الجهة/الشركة
6. اقتراحات لتسجيلها محاسبياً

أجب بصيغة JSON فقط بالهيكل التالي:
{
  "type": "فاتورة|كشف بنك|إيصال|عقد|أخرى",
  "summary": "ملخص مختصر",
  "vendor": "اسم الجهة",
  "items": [{"description": "وصف البند", "amount": 100, "date": "2024-01-01"}],
  "totalAmount": 500,
  "suggestions": ["اقتراح 1", "اقتراح 2"]
}`,
      },
    ];

    if (isImage) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `حلل هذه الوثيقة المالية: ${fileName}` },
          { type: "image_url", image_url: { url: `data:${fileType};base64,${fileData}` } },
        ],
      });
    } else {
      let textContent = "";
      try {
        textContent = atob(fileData);
      } catch {
        textContent = `[ملف بصيغة ${fileType} - الاسم: ${fileName}]`;
      }
      messages.push({
        role: "user",
        content: `حلل هذه الوثيقة المالية:\nاسم الملف: ${fileName}\nالنوع: ${fileType}\n\nالمحتوى:\n${textContent.slice(0, 8000)}`,
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
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات. حاول مرة أخرى بعد قليل." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى شحن الرصيد لاستخدام ميزة تحليل الوثائق." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("فشل في تحليل الوثيقة");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { type: "أخرى", summary: content, suggestions: [] };
    } catch {
      parsed = { type: "أخرى", summary: content, suggestions: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ غير معروف" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

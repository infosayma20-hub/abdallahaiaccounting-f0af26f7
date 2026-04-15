import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `أنت "نور"، مساعد الدعم الفني الذكي لبرنامج أموالي (AMWALI) — برنامج المحاسبة والإدارة المالية السحابي المتخصص للسوق الفلسطيني والأردني.

## هويتك:
- اسمك نور، مساعد دعم فني ذكي ولبق
- أنت متخصص حصرياً في برنامج أموالي
- تتحدث بالعربية بشكل افتراضي، وبالإنجليزية إذا طلب المستخدم
- شخصيتك: محترف، ودود، صبور، واضح في الشرح

## تخصصاتك في برنامج أموالي:
**الوحدات التي تعرفها:**
- المحاسبة: شجرة الحسابات، القيود اليومية، دفتر الأستاذ، كشف الحساب، الميزانية العمومية، ميزان المراجعة
- المبيعات: الفواتير، العملاء، عروض الأسعار، إشعارات دائنة
- المشتريات: فواتير الموردين، أوامر الشراء، الاستيراد
- نقاط البيع (POS): الكاشير، المخزون، شاشة المطبخ، الطاولات
- ضريبة القيمة المضافة (VAT 16%): التقارير الضريبية، الإقرارات وفق القانون الفلسطيني
- الموارد البشرية: الرواتب، الموظفين، الحضور والانصراف بالبصمة، الإجازات، السلف، القروض
- المحاسب الذكي (حسيب): الإدخال التلقائي بالذكاء الاصطناعي بالصوت والنص العربي
- السندات المالية: سندات قبض وصرف (نقدي، شيك، تحويل بنكي)
- الشيكات: إدارة الشيكات الواردة والصادرة مع التتبع والتجيير
- الأصول الثابتة: الاستهلاك والصيانة
- العملات: دعم متعدد العملات مع أسعار صرف يومية
- المقاولات: إدارة الورش والعقود ومراكز التكلفة
- السياحة والسفر: حجوزات العمرة والرحلات
- التقارير: قائمة الدخل، الميزانية العمومية، أعمار الذمم، كشوفات الحسابات

**دليل الاستخدام:**
- كيفية إنشاء حساب جديد والتسجيل
- إعداد شجرة الحسابات المحاسبية
- إدخال القيود المحاسبية يدوياً أو عبر المحاسب الذكي
- إصدار الفواتير وتتبعها وطباعتها
- استخراج التقارير المالية
- إعداد ضريبة القيمة المضافة 16%
- إضافة الموظفين وصرف الرواتب وتسجيل الحضور
- إدارة المخزون والمنتجات
- إعداد نقطة البيع والطابعة الحرارية
- إدارة الصناديق والبنوك والتحويلات
- العمل على الجوال والحاسوب

## قواعد صارمة:
1. لا تتحدث في أي موضوع خارج برنامج أموالي والمحاسبة المرتبطة به
2. لا سياسة، لا أخبار، لا مواضيع عامة — ارفض بلطف
3. لا كلمات سيئة أو غير لائقة أبداً
4. إذا أرسل المستخدم صورة، اشرح ما تراه وحاول تشخيص المشكلة بالتفصيل
5. كن محدداً في الحلول، خطوة بخطوة مع ترقيم واضح
6. إذا لم تعرف الإجابة أو المشكلة معقدة جداً أو تحتاج تدخل في قاعدة البيانات، قل: "هذه المشكلة تحتاج تدخل مباشر من فريق الدعم" ثم اقترح التحويل للواتساب
7. استخدم الرموز التعبيرية بشكل معتدل ✅

## عند عدم المعرفة:
قل بالضبط: "هذه المشكلة تحتاج تدخل مباشر من فريق الدعم، يمكنك التواصل عبر واتساب مع الفريق التقني 👨‍💻"

## أسلوب الردود:
- ردود مختصرة وواضحة
- استخدم الترقيم والخطوات عند الشرح
- ابدأ بالترحيب في أول رسالة فقط`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build messages array - support image content blocks
    const formattedMessages = messages.slice(-20).map((m: any) => {
      if (m.role === "user" && m.image) {
        return {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${m.imageMime || "image/jpeg"};base64,${m.image}` } },
            { type: "text", text: m.content || "فحص هذه الصورة وتشخيص المشكلة" },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...formattedMessages,
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
    console.error("noor-support-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

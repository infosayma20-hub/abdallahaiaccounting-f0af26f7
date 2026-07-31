import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { orderId, contactType, contactValue, customerName, companyName, surveyToken } = await req.json();

    if (!orderId || !contactType || !contactValue) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("SUPABASE_URL")?.replace("supabase.co", "lovable.app")
      || "https://abdallahaiaccounting.lovable.app";
    
    // Use the published app URL for receipt/survey links
    const baseUrl = appUrl || "https://abdallahaiaccounting.lovable.app";
    const receiptUrl = `${baseUrl}/receipt/${orderId}`;
    const surveyUrl = surveyToken ? `${baseUrl}/survey/${surveyToken}` : null;

    if (contactType === "whatsapp") {
      // Build WhatsApp message with deep link
      const cleanPhone = contactValue.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
      const message = encodeURIComponent(
        `مرحباً ${customerName || ""} 👋\n\n` +
        `شكراً لزيارتك *${companyName}* 🛍️\n\n` +
        `*فاتورتك الرقمية:*\n${receiptUrl}\n\n` +
        (surveyUrl ? `نودّ معرفة رأيك في تجربتك معنا:\n${surveyUrl}\n\n` : "") +
        `شكراً لثقتك بنا! 💚`
      );

      // We return the WhatsApp URL for the frontend to open
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;

      return new Response(JSON.stringify({
        success: true,
        method: "whatsapp",
        whatsappUrl,
        receiptUrl,
        surveyUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (contactType === "email") {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        // Fallback: return URLs without sending email
        return new Response(JSON.stringify({
          success: true,
          method: "email_fallback",
          receiptUrl,
          surveyUrl,
          note: "لم يتم إعداد خدمة البريد - تم إنشاء الروابط فقط",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#1a1a2e;color:#fff;padding:24px;text-align:center;">
      <div style="font-size:22px;font-weight:bold;">${companyName}</div>
    </td></tr>
    <tr><td style="padding:24px;text-align:center;">
      <p style="font-size:16px;font-weight:bold;margin-bottom:12px;">شكراً لزيارتك! 🛍️</p>
      <p style="font-size:14px;color:#666;margin-bottom:20px;">اضغط على الرابط لعرض فاتورتك الرقمية</p>
      <a href="${receiptUrl}" style="display:inline-block;background:#16A34A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">عرض الفاتورة</a>
      ${surveyUrl ? `
      <p style="font-size:14px;color:#666;margin-top:24px;margin-bottom:12px;">نودّ معرفة رأيك 📋</p>
      <a href="${surveyUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">تقييم تجربتك</a>
      ` : ""}
    </td></tr>
    <tr><td style="padding:16px;text-align:center;background:#fafafa;border-top:1px solid #eee;">
      <div style="font-size:12px;color:#999;">شكراً لتعاملكم معنا ❤️</div>
    </td></tr>
  </table>
</body>
</html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${companyName} <onboarding@resend.dev>`,
          to: [contactValue],
          subject: `فاتورتك من ${companyName}`,
          html,
        }),
      });

      if (!res.ok) {
        console.error("Resend error:", await res.text());
      }

      return new Response(JSON.stringify({
        success: true,
        method: "email",
        receiptUrl,
        surveyUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "نوع إرسال غير مدعوم" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-customer-receipt error:", err);
    return new Response(JSON.stringify({ error: "خطأ في الخادم" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

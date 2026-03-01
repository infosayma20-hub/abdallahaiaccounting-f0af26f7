import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReceiptItem {
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  total: number;
  note: string;
}

interface ReceiptData {
  orderNumber: string;
  date: string;
  cashierName: string;
  companyName: string;
  terminalName: string;
  customerName: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  tenderedAmount: number;
  change: number;
  orderNote: string;
}

const paymentMethodLabel: Record<string, string> = {
  cash: "نقد",
  card: "شبكة",
  credit: "آجل",
};

function buildReceiptHtml(data: ReceiptData): string {
  const now = new Date(data.date);
  const dateStr = now.toLocaleDateString("ar-PS", { year: "numeric", month: "2-digit", day: "2-digit" });
  const timeStr = now.toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 8px;text-align:right;font-weight:bold;">${item.name}</td>
        <td style="padding:6px 8px;text-align:center;">${item.qty}</td>
        <td style="padding:6px 8px;text-align:center;">₪${item.unit_price.toFixed(2)}</td>
        <td style="padding:6px 8px;text-align:left;font-weight:bold;">₪${item.total.toFixed(2)}</td>
      </tr>
      ${item.discount_pct > 0 ? `<tr><td colspan="4" style="padding:0 16px 4px;font-size:11px;color:#888;">خصم: ${item.discount_pct}%</td></tr>` : ""}
      ${item.note ? `<tr><td colspan="4" style="padding:0 16px 4px;font-size:11px;color:#888;font-style:italic;">📝 ${item.note}</td></tr>` : ""}`
    )
    .join("");

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <!-- Header -->
    <tr>
      <td style="background:#1a1a2e;color:#fff;padding:24px;text-align:center;">
        <div style="font-size:22px;font-weight:bold;margin-bottom:4px;">${data.companyName}</div>
        <div style="font-size:13px;opacity:0.8;">${data.terminalName}</div>
      </td>
    </tr>
    
    <!-- Order Info -->
    <tr>
      <td style="padding:16px 24px;background:#f8f8ff;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#666;">رقم الطلب</td>
            <td style="font-size:15px;font-weight:bold;text-align:left;">${data.orderNumber}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#666;padding-top:4px;">التاريخ</td>
            <td style="font-size:13px;text-align:left;padding-top:4px;">${dateStr} - ${timeStr}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#666;padding-top:4px;">الكاشير</td>
            <td style="font-size:13px;text-align:left;padding-top:4px;">${data.cashierName}</td>
          </tr>
          ${data.customerName ? `<tr><td style="font-size:13px;color:#666;padding-top:4px;">العميل</td><td style="font-size:13px;text-align:left;padding-top:4px;">${data.customerName}</td></tr>` : ""}
        </table>
      </td>
    </tr>

    <!-- Items -->
    <tr>
      <td style="padding:0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid #eee;">
              <th style="padding:10px 8px;text-align:right;font-size:12px;color:#888;font-weight:600;">الصنف</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#888;font-weight:600;">الكمية</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#888;font-weight:600;">السعر</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888;font-weight:600;">المجموع</th>
            </tr>
          </thead>
          <tbody style="border-bottom:1px solid #eee;">
            ${itemsHtml}
          </tbody>
        </table>
      </td>
    </tr>

    <!-- Totals -->
    <tr>
      <td style="padding:16px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#666;padding:3px 0;">المجموع الفرعي</td>
            <td style="font-size:13px;text-align:left;padding:3px 0;">₪${data.subtotal.toFixed(2)}</td>
          </tr>
          ${data.tax > 0 ? `<tr><td style="font-size:13px;color:#666;padding:3px 0;">الضريبة</td><td style="font-size:13px;text-align:left;padding:3px 0;">₪${data.tax.toFixed(2)}</td></tr>` : ""}
          ${data.discount > 0 ? `<tr><td style="font-size:13px;color:#c00;padding:3px 0;">الخصم</td><td style="font-size:13px;text-align:left;color:#c00;padding:3px 0;">-₪${data.discount.toFixed(2)}</td></tr>` : ""}
          <tr>
            <td colspan="2" style="padding-top:8px;"><div style="border-top:2px solid #1a1a2e;"></div></td>
          </tr>
          <tr>
            <td style="font-size:20px;font-weight:bold;padding-top:8px;">الإجمالي</td>
            <td style="font-size:20px;font-weight:bold;text-align:left;padding-top:8px;color:#16A34A;">₪${data.total.toFixed(2)}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Payment -->
    <tr>
      <td style="padding:12px 24px;background:#f0fdf4;border-top:1px solid #eee;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#666;">طريقة الدفع</td>
            <td style="font-size:13px;text-align:left;font-weight:bold;">${paymentMethodLabel[data.paymentMethod] || data.paymentMethod}</td>
          </tr>
          ${data.paymentMethod === "cash" ? `
          <tr>
            <td style="font-size:13px;color:#666;padding-top:4px;">المبلغ المستلم</td>
            <td style="font-size:13px;text-align:left;padding-top:4px;">₪${data.tenderedAmount.toFixed(2)}</td>
          </tr>
          ${data.change > 0 ? `<tr><td style="font-size:13px;color:#666;padding-top:4px;">الباقي</td><td style="font-size:13px;text-align:left;padding-top:4px;font-weight:bold;">₪${data.change.toFixed(2)}</td></tr>` : ""}
          ` : ""}
        </table>
      </td>
    </tr>

    ${data.orderNote ? `
    <tr>
      <td style="padding:12px 24px;font-size:12px;color:#888;border-top:1px solid #eee;">
        <strong>ملاحظة:</strong> ${data.orderNote}
      </td>
    </tr>
    ` : ""}

    <!-- Footer -->
    <tr>
      <td style="padding:20px;text-align:center;background:#fafafa;border-top:1px solid #eee;">
        <div style="font-size:14px;font-weight:bold;color:#333;">شكراً لتعاملكم معنا ❤️</div>
        <div style="font-size:11px;color:#999;margin-top:4px;">Thank you for your purchase</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

    // Verify user
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

    const { to, subject, receiptData } = await req.json();

    if (!to || !receiptData) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "لم يتم إعداد مفتاح خدمة البريد الإلكتروني بعد" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = buildReceiptHtml(receiptData);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${receiptData.companyName} <onboarding@resend.dev>`,
        to: [to],
        subject: subject || `إيصال بيع - ${receiptData.companyName}`,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.text();
      console.error("Resend error:", err);
      return new Response(
        JSON.stringify({ error: "فشل في إرسال البريد" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-pos-receipt error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

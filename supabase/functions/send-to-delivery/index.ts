import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = claimsData.claims.sub;

    // Parse body
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch order
    const { data: order, error: orderErr } = await supabase
      .from("pos_orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", userId)
      .single();

    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ error: "الطلب غير موجود" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!order.is_delivery) {
      return new Response(
        JSON.stringify({ error: "هذا الطلب ليس للتوصيل" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch order lines
    const { data: lines } = await supabase
      .from("pos_order_lines")
      .select("product_name, qty, unit_price, total, notes")
      .eq("order_id", order_id);

    // Fetch branch name
    let branchName = "";
    if (order.branch_id) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", order.branch_id)
        .single();
      branchName = branch?.name || "";
    }

    // Get secrets
    const webhookUrl = Deno.env.get("DELIVERY_WEBHOOK_URL");
    const companyId = Deno.env.get("DELIVERY_COMPANY_ID");
    const webhookSecret = Deno.env.get("DELIVERY_WEBHOOK_SECRET");

    if (!webhookUrl || !companyId || !webhookSecret) {
      return new Response(
        JSON.stringify({ error: "إعدادات التوصيل غير مكتملة — تأكد من إضافة المتغيرات" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to dispatching
    await supabase
      .from("pos_orders")
      .update({
        delivery_status: "dispatching",
        delivery_requested_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    // Build webhook payload
    const payload = {
      event: "order.delivery_requested",
      company_id: companyId,
      order: {
        id: order.id,
        order_number: order.order_number || "",
        branch_id: order.branch_id || "",
        branch_name: branchName,
        customer_name: order.customer_name || "",
        customer_phone: order.customer_phone || "",
        customer_address: order.customer_address || "",
        customer_lat: null,
        customer_lng: null,
        zone_code: order.zone_code || "",
        area_name: order.area_name || "",
        items: (lines || []).map((l: any) => ({
          name: l.product_name,
          qty: l.qty,
          price: l.unit_price,
          total: l.total,
          notes: l.notes || "",
        })),
        order_total: order.total || 0,
        payment_method: order.payment_method || "cash",
      },
    };

    // Send to delivery system
    const webhookResp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-amwali-signature": webhookSecret,
      },
      body: JSON.stringify(payload),
    });

    const result = await webhookResp.json().catch(() => ({}));

    if (webhookResp.ok && result.success) {
      // If captain was immediately assigned
      if (result.captain_name) {
        await supabase
          .from("pos_orders")
          .update({
            delivery_status: "accepted",
            assigned_captain_name: result.captain_name,
            assigned_captain_phone: result.captain_phone || "",
            assigned_captain_vehicle: result.vehicle_type || "",
            delivery_accepted_at: new Date().toISOString(),
          })
          .eq("id", order_id);

        return new Response(
          JSON.stringify({
            success: true,
            status: "accepted",
            captain_name: result.captain_name,
            captain_phone: result.captain_phone || "",
            vehicle_type: result.vehicle_type || "",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Dispatching — waiting for captain
      return new Response(
        JSON.stringify({ success: true, status: "dispatching" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Failed
    await supabase
      .from("pos_orders")
      .update({ delivery_status: "failed" })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        success: false,
        status: "failed",
        error: result.error || "لا يوجد كابتن متاح",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-to-delivery error:", err);
    return new Response(
      JSON.stringify({ error: "خطأ داخلي في الخادم" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

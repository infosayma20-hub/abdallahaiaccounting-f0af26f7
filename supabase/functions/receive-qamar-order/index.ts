import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();

    // 1. Validate shared secret
    const SHARED_SECRET = Deno.env.get("QAMAR_SHARED_SECRET");
    if (!SHARED_SECRET || body.secret !== SHARED_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const order = body.order;
    if (!order) {
      return json({ error: "Missing order data" }, 400);
    }

    // 2. Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Map source from English to Arabic
    const sourceMap: Record<string, string> = {
      facebook: "أخرى",
      instagram: "أخرى",
      website: "متجر إلكتروني",
      whatsapp: "واتساب",
      phone: "هاتف",
      manual: "يدوي",
    };
    const mappedSource = sourceMap[order.source?.toLowerCase()] || "أخرى";

    // Map status from English to Arabic
    const statusMap: Record<string, string> = {
      new: "جديد",
      processing: "قيد التجهيز",
      ready: "جاهز للشحن",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      returned: "مرتجع",
      cancelled: "ملغي",
    };
    const mappedStatus = statusMap[order.status?.toLowerCase()] || "جديد";

    // Default owner for Qamar orders
    const DEFAULT_OWNER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";

    // Build notes with extra metadata
    const noteParts: string[] = [];
    if (order.priority && order.priority !== "normal")
      noteParts.push(`أولوية: ${order.priority}`);
    if (order.source) noteParts.push(`مصدر أصلي: ${order.source}`);
    if (order.customer_city) noteParts.push(`مدينة: ${order.customer_city}`);
    if (order.production_cost)
      noteParts.push(`تكلفة إنتاج: ${order.production_cost}`);
    if (order.cost_breakdown?.length)
      noteParts.push(`تفاصيل التكلفة: ${JSON.stringify(order.cost_breakdown)}`);
    if (order.type) noteParts.push(`نوع: ${order.type}`);
    const notes = noteParts.length > 0 ? noteParts.join(" | ") : null;

    // Calculate subtotal from items if available
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal =
      order.subtotal ??
      items.reduce(
        (sum: number, item: any) =>
          sum + (item.quantity || 1) * (item.unit_price || item.price || 0),
        0
      );

    // 3. Insert the order
    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: DEFAULT_OWNER_ID,
        order_number: order.reference_number || null,
        customer_name: order.customer_name || "عميل قمر",
        customer_phone: order.customer_phone || null,
        customer_address: order.customer_city || null,
        status: mappedStatus,
        source: mappedSource,
        subtotal: subtotal,
        total: order.total ?? subtotal,
        discount: order.discount ?? 0,
        shipping_cost: order.shipping_cost ?? 0,
        notes,
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("Order insert error:", orderError);
      return json({ error: orderError.message }, 500);
    }

    // 4. Insert order items
    if (items.length > 0) {
      const orderItems = items.map((item: any) => ({
        order_id: newOrder.id,
        product_name: item.product_name || item.name || "منتج",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || item.price || 0,
        total_price:
          (item.quantity || 1) * (item.unit_price || item.price || 0),
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Order items insert error:", itemsError);
        // Order was created, just log the items error
      }
    }

    console.log(
      "Qamar order created:",
      newOrder.id,
      "Ref:",
      order.reference_number
    );

    return json({
      success: true,
      amwali_order_id: newOrder.id,
    });
  } catch (err) {
    console.error("receive-qamar-order error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});

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

    // Default owner for Qamar orders
    const DEFAULT_OWNER_ID = "ccdbcaa5-a585-4d84-a559-a4fc94a6075b";

    // Build full address
    const addressParts: string[] = [];
    if (order.customer_city) addressParts.push(order.customer_city);
    if (order.customer_address) addressParts.push(order.customer_address);
    const fullAddress = addressParts.join("، ") || null;

    // Calculate subtotal from items if not provided
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal =
      order.subtotal ??
      items.reduce(
        (sum: number, item: any) =>
          sum + (item.quantity || 1) * (item.price || 0),
        0
      );

    // 3. Insert into qamar_orders
    const { data: newOrder, error: orderError } = await supabase
      .from("qamar_orders")
      .insert({
        user_id: DEFAULT_OWNER_ID,
        reference_number: order.reference_number || null,
        customer_name: order.customer_name || "عميل قمر",
        customer_phone: order.customer_phone || null,
        customer_city: order.customer_city || null,
        customer_address: fullAddress,
        subtotal: subtotal,
        discount: order.discount ?? 0,
        shipping_cost: order.shipping_cost ?? order.shipping ?? 0,
        total: order.total ?? subtotal,
        source: order.source || null,
        source_key: order.source_key || null,
        payment_method: order.payment_method || null,
        payment_status: order.payment_status || "pending",
        amount_paid: order.amount_paid ?? 0,
        customer_notes: order.customer_notes || null,
        production_notes: order.production_notes || null,
        all_notes: order.all_notes || null,
        agent_name: order.agent_name || null,
        agent_id: order.agent_id || null,
        priority: order.priority || "normal",
        status: order.status || "new",
        type: order.type || "sales_order",
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("Qamar order insert error:", orderError);
      return json({ error: orderError.message }, 500);
    }

    // 4. Insert order items
    if (items.length > 0) {
      const orderItems = items.map((item: any) => ({
        order_id: newOrder.id,
        product_name: item.product_name || item.name || "منتج",
        product_id: item.product_id || null,
        price: item.price || item.unit_price || 0,
        quantity: item.quantity || 1,
        line_total: item.line_total || (item.quantity || 1) * (item.price || item.unit_price || 0),
        note: item.note || item.notes || null,
        product_image: item.product_image || null,
      }));

      const { error: itemsError } = await supabase
        .from("qamar_order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Qamar order items insert error:", itemsError);
      }
    }

    // 5. Also insert into legacy orders table for backward compatibility
    const sourceMap: Record<string, string> = {
      whatsapp: "واتساب",
      website: "متجر إلكتروني",
      phone: "هاتف",
      manual: "يدوي",
      facebook: "أخرى",
      instagram: "أخرى",
    };
    const mappedSource = order.source || sourceMap[order.source_key?.toLowerCase()] || "أخرى";

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

    const noteParts: string[] = [];
    if (order.all_notes) noteParts.push(order.all_notes);
    else {
      if (order.customer_notes) noteParts.push(`ملاحظات الزبون: ${order.customer_notes}`);
      if (order.production_notes) noteParts.push(`ملاحظات الإنتاج: ${order.production_notes}`);
    }
    if (order.agent_name) noteParts.push(`الموظف: ${order.agent_name}`);
    const notes = noteParts.length > 0 ? noteParts.join(" | ") : null;

    await supabase.from("orders").insert({
      user_id: DEFAULT_OWNER_ID,
      order_number: order.reference_number || null,
      customer_name: order.customer_name || "عميل قمر",
      customer_phone: order.customer_phone || null,
      customer_address: fullAddress,
      status: mappedStatus,
      source: mappedSource,
      subtotal: subtotal,
      total: order.total ?? subtotal,
      discount: order.discount ?? 0,
      shipping_cost: order.shipping_cost ?? order.shipping ?? 0,
      notes,
    });

    console.log("Qamar order created:", newOrder.id, "Ref:", order.reference_number);

    // 6. Insert initial status log entry
    await supabase.from("order_status_log").insert({
      user_id: DEFAULT_OWNER_ID,
      order_id: newOrder.id,
      order_table: "qamar_orders",
      from_status: null,
      to_status: "جديد",
      changed_by: DEFAULT_OWNER_ID,
      changed_by_name: "النظام (تلقائي)",
      changed_by_role: "system",
      notes: null,
      metadata: {
        source: mappedSource,
        agent_name: order.agent_name || null,
        reference_number: order.reference_number || null,
      },
    });

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

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
    const body = await req.json();
    console.log("PBX webhook received:", JSON.stringify(body));

    // Yeastar P-Series sends event type 30016 for inbound calls
    // Format: { type: 30016, sn: "...", msg: { call_id, members: [{ inbound: { from, to, trunk_name } }] } }
    let callerNumber: string | null = null;
    let calledNumber: string | null = null;
    let callId: string | null = null;
    let trunkName: string | null = null;

    // Parse Yeastar format
    const msg = typeof body.msg === "string" ? JSON.parse(body.msg) : body.msg;

    if (msg?.members?.[0]?.inbound) {
      const inbound = msg.members[0].inbound;
      callerNumber = inbound.from;
      calledNumber = inbound.to;
      callId = msg.call_id;
      trunkName = inbound.trunk_name;
    } else if (body.caller_number || body.from) {
      // Fallback: generic webhook format
      callerNumber = body.caller_number || body.from;
      calledNumber = body.called_number || body.to;
      callId = body.call_id;
    }

    if (!callerNumber) {
      return new Response(
        JSON.stringify({ error: "No caller number found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number: remove leading +, 00, country codes
    const normalizedNumber = callerNumber
      .replace(/[\s\-()]/g, "")
      .replace(/^(\+|00)(972|970)/, "0");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Search for customer by phone number across all users
    // Try multiple phone formats
    const phoneVariants = [
      normalizedNumber,
      normalizedNumber.replace(/^0/, ""),
      `+972${normalizedNumber.replace(/^0/, "")}`,
      `+970${normalizedNumber.replace(/^0/, "")}`,
      callerNumber,
    ];

    const { data: customers } = await supabase
      .from("pos_customers")
      .select("id, name, phone, address, user_id")
      .or(phoneVariants.map((p) => `phone.eq.${p}`).join(","))
      .limit(1);

    const customer = customers?.[0] || null;

    // If no customer found, we still record the call but without customer data
    // We need a user_id — use the customer's user_id if found, otherwise
    // use a lookup from the called extension or a default
    let userId = customer?.user_id;

    if (!userId) {
      // Try to find user_id from pos_users by extension number
      if (calledNumber) {
        const { data: posUser } = await supabase
          .from("pos_users")
          .select("user_id")
          .eq("extension_number", calledNumber)
          .limit(1);
        userId = posUser?.[0]?.user_id;
      }

      // Fallback: get from company_settings or first active user
      if (!userId) {
        const { data: firstUser } = await supabase
          .from("pos_customers")
          .select("user_id")
          .limit(1);
        userId = firstUser?.[0]?.user_id;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Cannot determine user context" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert call event — Realtime will push to POS frontend
    const { data: callEvent, error } = await supabase
      .from("pbx_call_events")
      .insert({
        user_id: userId,
        caller_number: callerNumber,
        called_number: calledNumber,
        call_id: callId,
        trunk_name: trunkName,
        customer_id: customer?.id || null,
        customer_name: customer?.name || null,
        customer_phone: customer?.phone || callerNumber,
        customer_address: customer?.address || null,
        status: "ringing",
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Call event created:", callEvent.id, "Customer:", customer?.name || "unknown");

    return new Response(
      JSON.stringify({
        success: true,
        call_id: callEvent.id,
        customer_found: !!customer,
        customer_name: customer?.name || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("PBX webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

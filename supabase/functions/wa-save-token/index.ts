// Saves (encrypted) a WhatsApp channel token. Caller must be a team member of the channel owner.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encryptToken } from "../_shared/wa-crypto.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const channelId = typeof body.channel_id === "string" ? body.channel_id : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(channelId) || token.length < 20 || token.length > 2000) {
      return json({ error: "invalid input" }, 400);
    }
    // RLS on wa_channels guarantees the caller belongs to the owner's team.
    const { data: ch } = await userClient.from("wa_channels").select("id, owner_id").eq("id", channelId).maybeSingle();
    if (!ch) return json({ error: "channel not found" }, 404);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { ciphertext, iv } = await encryptToken(token);
    const { data: row, error } = await admin.from("wa_channel_tokens")
      .upsert({ channel_id: ch.id, owner_id: ch.owner_id, ciphertext, iv, updated_at: new Date().toISOString() }, { onConflict: "channel_id" })
      .select("id").single();
    if (error) throw error;
    await admin.from("wa_channels").update({ token_secret_id: row.id }).eq("id", ch.id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

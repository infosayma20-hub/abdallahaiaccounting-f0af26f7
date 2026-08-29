// Temporary admin utility: compare a weekly backup snapshot of `products`
// against the current table for one tenant, to find hard-deleted rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { snapshot, ownerId, restore = false, ids = [] } = await req.json();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) load snapshot pages
    const { data: files, error: listErr } = await admin.storage
      .from("backups")
      .list(`weekly/${snapshot}`, { limit: 1000 });
    if (listErr) throw listErr;

    const productFiles = (files || [])
      .map((f) => f.name)
      .filter((n) => n.startsWith("products-"))
      .sort();

    const snapRows: any[] = [];
    for (const f of productFiles) {
      const { data, error } = await admin.storage
        .from("backups")
        .download(`weekly/${snapshot}/${f}`);
      if (error) throw error;
      const json = JSON.parse(await data.text());
      const rows = Array.isArray(json) ? json : json.rows || json.data || [];
      snapRows.push(...rows);
    }

    const mine = snapRows.filter((r) => r.user_id === ownerId);

    // 2) current ids
    const current = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("products")
        .select("id")
        .eq("user_id", ownerId)
        .range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((r: any) => current.add(r.id));
      if (!data || data.length < 1000) break;
    }

    const missing = mine.filter((r) => !current.has(r.id));

    if (!restore) {
      return json200({
        snapshotProducts: mine.length,
        currentProducts: current.size,
        missingCount: missing.length,
        missing: missing.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          quantity: r.quantity,
          sell_price: r.sell_price,
          buy_price: r.buy_price,
          category: r.category,
          created_at: r.created_at,
        })),
      });
    }

    // 3) restore selected ids (or all missing)
    const toRestore = ids.length
      ? missing.filter((r) => ids.includes(r.id))
      : missing;
    const inserted: string[] = [];
    for (let i = 0; i < toRestore.length; i += 100) {
      const chunk = toRestore.slice(i, i + 100);
      const { error } = await admin.from("products").insert(chunk);
      if (error) throw error;
      chunk.forEach((r) => inserted.push(r.id));
    }
    return json200({ restored: inserted.length, ids: inserted });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json200(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

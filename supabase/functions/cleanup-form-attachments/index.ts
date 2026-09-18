// تنظيف مرفقات نماذج التشييك المؤقتة (مجلد t90) بعد 3 شهور.
// يُستدعى دورياً (pg_cron) ولا يمس أي مرفق خارج مجلد t90.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUCKET = "employee-forms";
const RETENTION_DAYS = 90;
const BATCH = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString();

  try {
    const { data, error } = await supabase.rpc("list_expired_form_attachments", {
      p_days: RETENTION_DAYS,
      p_limit: BATCH,
    });

    if (error) throw error;

    const paths = (data || []).map((r: { object_name: string }) => r.object_name);
    let removed = 0;
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rmErr) throw rmErr;
      removed = paths.length;
    }

    return new Response(
      JSON.stringify({ ok: true, removed, cutoff, more: paths.length === BATCH }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

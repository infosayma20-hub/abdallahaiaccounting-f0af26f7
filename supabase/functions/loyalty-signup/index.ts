import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * يضمن وجود ملف زبون ومحفظة مرتبطين بعضو الولاء،
 * حتى تعمل بطاقة الزبون الرقمية (نقاط + رصيد محفظة) من أول تسجيل.
 */
// deno-lint-ignore no-explicit-any
async function ensureWallet(
  admin: any,
  ownerId: string,
  memberId: string,
  contactId: string | null,
  fullName: string,
  phoneE164: string,
) {
  try {
    let cid = contactId;

    if (!cid) {
      const { data: found } = await admin
        .from("contacts")
        .select("id")
        .eq("user_id", ownerId)
        .eq("phone", phoneE164)
        .maybeSingle();
      cid = found?.id ?? null;
    }

    if (!cid) {
      const { data: created } = await admin
        .from("contacts")
        .insert({
          user_id: ownerId,
          contact_name: fullName,
          phone: phoneE164,
          contact_type: "customer",
        })
        .select("id")
        .single();
      cid = created?.id ?? null;
    }

    if (!cid) return;

    await admin.from("loyalty_members").update({ contact_id: cid }).eq("id", memberId);

    const { data: wallet } = await admin
      .from("customer_wallets")
      .select("id")
      .eq("user_id", ownerId)
      .eq("contact_id", cid)
      .maybeSingle();

    if (!wallet) {
      await admin.from("customer_wallets").insert({ user_id: ownerId, contact_id: cid });
    }
  } catch (err) {
    console.error("ensureWallet failed:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    const slug = clean(body.slug, 64);
    const firstName = clean(body.first_name, 60);
    const lastName = clean(body.last_name, 60);
    const phoneCode = clean(body.phone_code, 6) || "+970";
    const phoneRaw = clean(body.phone, 20).replace(/\D/g, "");
    const country = clean(body.country, 60);

    const toNum = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    };
    const birthDay = toNum(body.birth_day);
    const birthMonth = toNum(body.birth_month);
    const birthYear = toNum(body.birth_year);

    if (!slug) return json({ error: "invalid_program" }, 400);
    if (firstName.length < 2) return json({ error: "invalid_first_name" }, 400);
    if (phoneRaw.length < 6 || phoneRaw.length > 15) return json({ error: "invalid_phone" }, 400);
    if (birthDay !== null && (birthDay < 1 || birthDay > 31)) return json({ error: "invalid_birthdate" }, 400);
    if (birthMonth !== null && (birthMonth < 1 || birthMonth > 12)) return json({ error: "invalid_birthdate" }, 400);
    if (birthYear !== null && (birthYear < 1900 || birthYear > new Date().getFullYear())) {
      return json({ error: "invalid_birthdate" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: program, error: progErr } = await admin
      .from("loyalty_programs")
      .select("id, user_id, is_active")
      .eq("slug", slug)
      .maybeSingle();

    if (progErr) throw progErr;
    if (!program || !program.is_active) return json({ error: "program_not_found" }, 404);

    const phoneE164 = `${phoneCode}${phoneRaw.replace(/^0+/, "")}`;
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;

    const { data: existing } = await admin
      .from("loyalty_members")
      .select("id, card_code, points_balance, first_name, contact_id")
      .eq("program_id", program.id)
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    if (existing) {
      await ensureWallet(admin, program.user_id, existing.id, existing.contact_id, fullName, phoneE164);
      return json({ status: "existing", member: existing });
    }

    const { data: member, error: insErr } = await admin
      .from("loyalty_members")
      .insert({
        program_id: program.id,
        user_id: program.user_id,
        first_name: firstName,
        last_name: lastName || null,
        birth_day: birthDay,
        birth_month: birthMonth,
        birth_year: birthYear,
        phone_code: phoneCode,
        phone: phoneRaw,
        phone_e164: phoneE164,
        country: country || null,
      })
      .select("id, card_code, points_balance, first_name, contact_id")
      .single();

    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        return json({ error: "already_registered" }, 409);
      }
      throw insErr;
    }

    await ensureWallet(admin, program.user_id, member.id, null, fullName, phoneE164);

    return json({ status: "created", member });
  } catch (err) {
    console.error("loyalty-signup failed:", err);
    return json({ error: "server_error", details: String(err) }, 500);
  }
});

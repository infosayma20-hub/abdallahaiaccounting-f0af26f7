// Smart Accountant — Phase 4: AI capture → draft.
// Takes free Arabic/English text, classifies via Lovable AI Gateway against
// smart_accountant_categories, resolves debit/credit accounts using
// sa_resolve_account, then inserts a row into smart_accountant_drafts.
// NEVER writes to the ledger directly — that's sa_post_journal_voucher_live.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, corsHeaders } from "../_shared/auth.ts";

interface CapturePayload {
  text: string;
  amount?: number;
  currency?: string;
  transaction_date?: string;
  source?: "voice" | "text" | "manual" | "ai";
}

interface ExtractedIntent {
  category_code: string | null;
  amount: number | null;
  currency: string | null;
  transaction_date: string | null;
  description: string | null;
  contact_name: string | null;
  confidence: number;
  reasoning: string;
}

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof Response) return auth;
    const userId = auth.userId;

    const body: CapturePayload = await req.json();
    if (!body?.text || typeof body.text !== "string") {
      return json({ ok: false, error: "text_required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Load active categories (global taxonomy) to constrain AI output.
    const { data: cats, error: catsErr } = await admin
      .from("smart_accountant_categories")
      .select("code,name_ar,name_en,debit_role,credit_role,debit_code_fallback,credit_code_fallback,keywords,ambiguity_resolution_policy,default_currency")
      .eq("is_active", true)
      .order("sort_order");
    if (catsErr) return json({ ok: false, error: "categories_fetch_failed", detail: catsErr.message }, 500);

    // 2) Fast keyword guess (DB-side) as fallback signal for the AI prompt.
    const { data: guess } = await admin.rpc("sa_guess_category", { p_text: body.text });
    const guessedCode: string | null = (guess as any) ?? null;

    // 3) AI extraction (Lovable Gateway).
    const intent = await extractIntent(body, cats ?? [], guessedCode);

    const finalCategoryCode = intent.category_code ?? guessedCode ?? "OTHER";
    const category = (cats ?? []).find((c) => c.code === finalCategoryCode)
      ?? (cats ?? []).find((c) => c.code === "OTHER")
      ?? null;
    if (!category) return json({ ok: false, error: "no_category_matched" }, 422);

    // 4) Resolve both legs via sa_resolve_account.
    const [debitRes, creditRes] = await Promise.all([
      admin.rpc("sa_resolve_account", {
        p_role: category.debit_role,
        p_fallback_code: category.debit_code_fallback,
        p_data_owner_id: userId,
      }),
      admin.rpc("sa_resolve_account", {
        p_role: category.credit_role,
        p_fallback_code: category.credit_code_fallback,
        p_data_owner_id: userId,
      }),
    ]);
    const debit = (debitRes.data as any) ?? { status: "missing" };
    const credit = (creditRes.data as any) ?? { status: "missing" };

    // 5) Decide draft status:
    //    ready = both resolved AND policy is auto_remember
    //    pending otherwise (UI/voice flow must confirm)
    const bothResolved = debit.status === "resolved" && credit.status === "resolved";
    const status =
      bothResolved && category.ambiguity_resolution_policy === "auto_remember"
        ? "ready"
        : "pending";

    const amount = Number(body.amount ?? intent.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      // Still create as pending so the user can fix it in UI.
    }

    const insertPayload = {
      user_id: userId,
      category_code: category.code,
      description: intent.description ?? body.text.slice(0, 500),
      amount: amount > 0 ? amount : null,
      currency: body.currency ?? intent.currency ?? category.default_currency ?? "شيكل",
      transaction_date: body.transaction_date ?? intent.transaction_date ?? new Date().toISOString().slice(0, 10),
      debit_account_id: debit.status === "resolved" ? debit.account_id : null,
      credit_account_id: credit.status === "resolved" ? credit.account_id : null,
      debit_resolution: debit,
      credit_resolution: credit,
      status,
      source: body.source ?? "ai",
      source_text: body.text,
      ai_intent: intent as unknown as Record<string, unknown>,
    };

    const { data: draft, error: insErr } = await admin
      .from("smart_accountant_drafts")
      .insert(insertPayload)
      .select()
      .single();
    if (insErr) return json({ ok: false, error: "draft_insert_failed", detail: insErr.message }, 500);

    return json({
      ok: true,
      draft,
      resolution: { debit, credit },
      category: { code: category.code, name_ar: category.name_ar, policy: category.ambiguity_resolution_policy },
      intent,
      next_action: status === "ready" ? "review_and_post" : "confirm_in_ui",
    });
  } catch (err) {
    console.error("sa-capture error", err);
    return json({ ok: false, error: "internal_error", detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function extractIntent(
  payload: CapturePayload,
  categories: Array<{ code: string; name_ar: string; name_en: string | null; keywords: string[] | null }>,
  guessedCode: string | null,
): Promise<ExtractedIntent> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const today = new Date().toISOString().slice(0, 10);

  // Graceful degradation: no AI key → return keyword guess only.
  if (!apiKey) {
    return {
      category_code: guessedCode,
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      transaction_date: payload.transaction_date ?? today,
      description: payload.text,
      contact_name: null,
      confidence: guessedCode ? 0.4 : 0,
      reasoning: "no_ai_key_fallback_to_keyword_guess",
    };
  }

  const catalog = categories
    .map((c) => `- ${c.code} :: ${c.name_ar}${c.name_en ? ` (${c.name_en})` : ""} :: keywords=${(c.keywords ?? []).join("|")}`)
    .join("\n");

  const system = `أنت محاسب فلسطيني (لهجة محلية). مهمتك تحويل نص حر إلى نية محاسبية منظمة (JSON).
اختر category_code من القائمة فقط. لا تخترع.
- التاريخ ISO (YYYY-MM-DD). اليوم = ${today}.
- العملة: "شيكل" أو "دينار" أو "دولار" (افتراضي: شيكل).
- amount رقم موجب فقط. إذا غير واضح → null.
- description: ملخّص قصير عربي للسطر المحاسبي.
القائمة المتاحة:
${catalog}
تخمين أولي بالكلمات المفتاحية: ${guessedCode ?? "لا يوجد"}`;

  const user = `النص: ${payload.text}\nهل يوجد مبلغ مدخل يدويًا؟ ${payload.amount ?? "لا"}`;

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_intent",
            description: "Emit the structured accounting intent.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                category_code: { type: ["string", "null"] },
                amount: { type: ["number", "null"] },
                currency: { type: ["string", "null"], enum: ["شيكل", "دينار", "دولار", null] },
                transaction_date: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                contact_name: { type: ["string", "null"] },
                confidence: { type: "number" },
                reasoning: { type: "string" },
              },
              required: ["category_code", "amount", "currency", "transaction_date", "description", "contact_name", "confidence", "reasoning"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "emit_intent" } },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("Lovable AI error", res.status, txt);
    return {
      category_code: guessedCode,
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      transaction_date: payload.transaction_date ?? today,
      description: payload.text,
      contact_name: null,
      confidence: guessedCode ? 0.3 : 0,
      reasoning: `ai_http_${res.status}`,
    };
  }

  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    return {
      category_code: guessedCode,
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      transaction_date: payload.transaction_date ?? today,
      description: payload.text,
      contact_name: null,
      confidence: guessedCode ? 0.3 : 0,
      reasoning: "ai_no_tool_call",
    };
  }

  try {
    const parsed = JSON.parse(call.function.arguments) as ExtractedIntent;
    return parsed;
  } catch (_e) {
    return {
      category_code: guessedCode,
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      transaction_date: payload.transaction_date ?? today,
      description: payload.text,
      contact_name: null,
      confidence: 0,
      reasoning: "ai_parse_failed",
    };
  }
}
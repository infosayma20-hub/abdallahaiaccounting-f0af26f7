// Single multi-tenant WhatsApp Cloud API webhook. Routes by phone_number_id -> wa_channels.owner_id.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildAgentPrompt, type WaAgentProfile, type WaTrack } from "../_shared/wa-agent-prompt.ts";
import { decryptToken } from "../_shared/wa-crypto.ts";

const GRAPH = "https://graph.facebook.com/v25.0";
const enc = new TextEncoder();

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

function db(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function log(sb: SupabaseClient, level: string, message: string, payload: unknown = null, ownerId: string | null = null) {
  try {
    await sb.from("edge_logs").insert({ fn: "wa-webhook", level, message, payload, owner_id: ownerId });
  } catch { /* never throw from logging */ }
}

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(raw)));
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

async function channelToken(sb: SupabaseClient, channelId: string): Promise<string | null> {
  const { data } = await sb.from("wa_channel_tokens").select("ciphertext, iv").eq("channel_id", channelId).maybeSingle();
  if (!data) return null;
  return decryptToken(data.ciphertext, data.iv);
}

async function graphPost(phoneNumberId: string, token: string, body: unknown) {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`graph ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

async function transcribe(mediaId: string, token: string): Promise<{ text: string; seconds: number }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  if (!meta?.url) throw new Error("media url missing");
  const audio = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!audio.ok) throw new Error(`media download ${audio.status}`);
  const blob = await audio.blob();
  const form = new FormData();
  form.append("file", blob, "voice.ogg");
  form.append("model_id", "scribe_v1");
  form.append("language_code", "ar");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY") || "" },
    body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stt ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const words = Array.isArray(j.words) ? j.words : [];
  const seconds = words.length ? Number(words[words.length - 1]?.end || 0) : 0;
  return { text: String(j.text || ""), seconds };
}

const SUMMARY_TOOL = {
  name: "send_summary",
  description: "يرسل ملخص طلب الزبون لصاحب النشاط بعد تأكيد الزبون، أو فورًا إذا كان الأمر مستعجلًا.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" }, company: { type: "string" }, city: { type: "string" },
      phone_given: { type: "string" }, track_key: { type: "string" }, details: { type: "string" },
      questions: { type: "string" }, deadline: { type: "string" }, best_time: { type: "string" },
      existing_client: { type: "boolean" }, urgent: { type: "boolean" },
    },
    required: ["details", "urgent"],
  },
};

type ClaudeMsg = { role: "user" | "assistant"; content: unknown };

async function callClaude(model: string, system: string, messages: ClaudeMsg[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 600, system, messages, tools: [SUMMARY_TOOL] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`claude ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j as { content: any[]; stop_reason: string; usage?: { input_tokens: number; output_tokens: number } };
}

function textOf(content: any[]): string {
  return (content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
}

async function processMessage(sb: SupabaseClient, value: any, msg: any) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const { data: channel } = await sb.from("wa_channels").select("*").eq("phone_number_id", phoneNumberId).maybeSingle();
  if (!channel) { await log(sb, "warn", "unknown phone_number_id", { phoneNumberId }); return; }
  const ownerId = channel.owner_id as string;

  if (!msg?.id) return;
  const { data: dup } = await sb.from("wa_messages").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (dup) return;

  // Contact
  const waId = String(msg.from || "");
  const c = (value.contacts || []).find((x: any) => x.wa_id === waId || x.user_id === waId) || value.contacts?.[0] || {};
  const phoneCandidate = c.wa_id || (/^\d{8,15}$/.test(waId) ? waId : null);
  const contactRow: Record<string, unknown> = { owner_id: ownerId, wa_id: waId };
  if (c.profile?.name) contactRow.profile_name = c.profile.name;
  if (c.user_id || c.bsuid || c.username) contactRow.bsuid = c.user_id || c.bsuid || c.username;
  if (phoneCandidate) contactRow.phone = phoneCandidate;
  const { data: contact, error: cErr } = await sb.from("wa_contacts")
    .upsert(contactRow, { onConflict: "owner_id,wa_id" }).select("*").single();
  if (cErr) throw cErr;

  // Conversation
  let { data: conv } = await sb.from("wa_conversations").select("*")
    .eq("owner_id", ownerId).eq("channel_id", channel.id).eq("contact_id", contact.id).eq("status", "open")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv) {
    const ins = await sb.from("wa_conversations").insert({ owner_id: ownerId, channel_id: channel.id, contact_id: contact.id }).select("*").single();
    if (ins.error) throw ins.error;
    conv = ins.data;
  }

  const token = await channelToken(sb, channel.id);

  // Content
  const kind = String(msg.type || "other");
  let type: string = ["text", "audio", "image", "document", "interactive"].includes(kind) ? kind : "other";
  let body = "";
  let transcript: string | null = null;
  let mediaId: string | null = null;
  let sttSeconds = 0;
  if (kind === "text") body = msg.text?.body || "";
  else if (kind === "audio" || kind === "voice") {
    type = "audio";
    mediaId = msg.audio?.id || msg.voice?.id || null;
    if (mediaId && token) {
      try { const t = await transcribe(mediaId, token); transcript = t.text; sttSeconds = t.seconds; }
      catch (e) { await log(sb, "error", "transcription failed", { error: String(e) }, ownerId); }
    }
    body = transcript || "[رسالة صوتية]";
  } else if (kind === "image" || kind === "document") {
    mediaId = msg[kind]?.id || null;
    body = `[${kind === "image" ? "صورة" : "ملف"}]${msg[kind]?.caption ? " " + msg[kind].caption : ""}`;
  } else if (kind === "interactive") {
    body = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
  } else if (kind === "button") {
    type = "interactive"; body = msg.button?.text || "";
  } else body = "[رسالة غير مدعومة]";

  const { error: mErr } = await sb.from("wa_messages").insert({
    owner_id: ownerId, conversation_id: conv.id, wa_message_id: msg.id, direction: "in", type, body, media_id: mediaId, transcript,
  });
  if (mErr) { if (String(mErr.code) === "23505") return; throw mErr; }
  await sb.from("wa_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  if (!token) { await log(sb, "warn", "channel token missing", { channel: channel.id }, ownerId); return; }
  try { await graphPost(phoneNumberId, token, { status: "read", message_id: msg.id }); } catch (e) { await log(sb, "warn", "mark read failed", { error: String(e) }, ownerId); }

  const { data: profile } = await sb.from("wa_agent_profiles").select("*").eq("owner_id", ownerId).maybeSingle();
  if (!profile?.is_active) return;

  // History (last 20), merged into alternating roles
  const { data: hist } = await sb.from("wa_messages").select("direction, body, transcript")
    .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(20);
  const messages: ClaudeMsg[] = [];
  for (const h of (hist || []).reverse()) {
    const role = h.direction === "in" ? "user" : "assistant";
    const text = (h.transcript || h.body || "").trim() || "…";
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n${text}`;
    else messages.push({ role, content: text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return;

  const nowHebron = new Date().toLocaleString("ar", { timeZone: "Asia/Hebron", weekday: "long", hour: "2-digit", minute: "2-digit" });
  const system = `${buildAgentPrompt(profile as WaAgentProfile)}\n\n## سياق\n- الوقت الحالي: ${nowHebron}\n- رقم الزبون معروف: ${contact.phone ? "نعم (" + contact.phone + ")" : "لا"}\n- اسمه على واتساب: ${contact.profile_name || "غير معروف"}`;
  const model = profile.model || "claude-sonnet-5-5";

  let inTok = 0, outTok = 0, sent = 0;
  let res = await callClaude(model, system, messages);
  inTok += res.usage?.input_tokens || 0; outTok += res.usage?.output_tokens || 0;

  const toolUse = (res.content || []).find((x: any) => x.type === "tool_use" && x.name === "send_summary");
  if (toolUse) {
    const result = await handleSummary(sb, ownerId, conv.id, profile, toolUse.input || {}, phoneNumberId, token, contact);
    res = await callClaude(model, system, [
      ...messages,
      { role: "assistant", content: res.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result }] },
    ]);
    inTok += res.usage?.input_tokens || 0; outTok += res.usage?.output_tokens || 0;
  }

  const reply = textOf(res.content);
  if (reply) {
    const out = await graphPost(phoneNumberId, token, { to: waId, type: "text", text: { body: reply.slice(0, 4000) } });
    sent++;
    await sb.from("wa_messages").insert({
      owner_id: ownerId, conversation_id: conv.id, wa_message_id: out?.messages?.[0]?.id || null, direction: "out", type: "text", body: reply,
    });
    await sb.from("wa_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
  }
  await sb.from("wa_usage").insert({
    owner_id: ownerId, conversation_id: conv.id, input_tokens: inTok, output_tokens: outTok, stt_seconds: sttSeconds, messages_out: sent,
  });
}

async function handleSummary(sb: SupabaseClient, ownerId: string, convId: string, profile: any, input: any, phoneNumberId: string, token: string, contact: any): Promise<string> {
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : null);
  const { count } = await sb.from("wa_messages").select("id", { count: "exact", head: true })
    .eq("conversation_id", convId).in("type", ["image", "document"]);
  const lead = {
    owner_id: ownerId, conversation_id: convId, name: s(input.name), company: s(input.company), city: s(input.city),
    phone_given: s(input.phone_given) || contact.phone || null, track_key: s(input.track_key), details: s(input.details),
    questions: s(input.questions), deadline: s(input.deadline), best_time: s(input.best_time),
    existing_client: typeof input.existing_client === "boolean" ? input.existing_client : null,
    urgent: input.urgent === true, attachments_count: count || 0,
  };
  const { error } = await sb.from("wa_leads").insert(lead);
  if (error) { await log(sb, "error", "lead insert failed", { error: error.message }, ownerId); return "تعذر حفظ الملخص"; }
  await sb.from("wa_conversations").update({ status: "summarized", track_key: lead.track_key }).eq("id", convId);

  const track = ((profile.tracks || []) as WaTrack[]).find((t) => t.key === lead.track_key);
  const notifyTo = (track?.notify_whatsapp || profile.notify_whatsapp || "").replace(/\D/g, "");
  if (notifyTo) {
    const v = (x: unknown) => (x ? String(x) : "-").replace(/\s+/g, " ").slice(0, 900);
    try {
      if (Deno.env.get("USE_TEMPLATE") === "true") {
        const params = [track?.label || lead.track_key, lead.name, lead.company, lead.city, lead.details, lead.deadline, lead.best_time, lead.phone_given]
          .map((x) => ({ type: "text", text: v(x) }));
        await graphPost(phoneNumberId, token, {
          to: notifyTo, type: "template",
          template: { name: "new_lead_ar", language: { code: "ar" }, components: [{ type: "body", parameters: params }] },
        });
      } else {
        const text = [
          `${lead.urgent ? "🔴 مستعجل — " : ""}طلب جديد من واتساب`,
          `المسار: ${v(track?.label || lead.track_key)}`,
          `الاسم: ${v(lead.name)} | الشركة: ${v(lead.company)} | المدينة: ${v(lead.city)}`,
          `الرقم: ${v(lead.phone_given)} | أفضل وقت: ${v(lead.best_time)}`,
          `الموعد: ${v(lead.deadline)}`,
          `التفاصيل: ${v(lead.details)}`,
          lead.questions ? `أسئلة: ${v(lead.questions)}` : "",
          lead.attachments_count ? `مرفقات: ${lead.attachments_count}` : "",
        ].filter(Boolean).join("\n");
        await graphPost(phoneNumberId, token, { to: notifyTo, type: "text", text: { body: text } });
      }
    } catch (e) {
      await log(sb, "error", "owner notify failed", { error: String(e) }, ownerId);
    }
  }
  return "تم إرسال الملخص لصاحب النشاط بنجاح. اختم بسطر شكر واحد.";
}

async function processPayload(raw: string) {
  const sb = db();
  try {
    const payload = JSON.parse(raw);
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        for (const msg of value?.messages || []) {
          try { await processMessage(sb, value, msg); }
          catch (e) { await log(sb, "error", "process message failed", { error: String(e), id: msg?.id }); }
        }
      }
    }
  } catch (e) {
    await log(sb, "error", "invalid payload", { error: String(e) });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      !!Deno.env.get("VERIFY_TOKEN") && url.searchParams.get("hub.verify_token") === Deno.env.get("VERIFY_TOKEN");
    return ok
      ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } })
      : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("invalid signature", { status: 401 });
  }
  EdgeRuntime.waitUntil(processPayload(raw));
  return new Response("ok", { status: 200 });
});

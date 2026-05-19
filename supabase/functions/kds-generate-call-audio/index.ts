/**
 * kds-generate-call-audio
 * Generates (or returns cached) Arabic MP3 for the order-ready call.
 * Validates the device token, looks for a cached file in the kds-audio-cache
 * bucket, otherwise calls ElevenLabs TTS and uploads the result.
 * Public — no JWT required (token is the auth).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_VOICE_ID = "xvhpbk8otnNHtT3fjCpr"; // Omar — Arabic KDS voice
const MODEL_ID = "eleven_multilingual_v2";
const BUCKET = "kds-audio-cache";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function diagnostic(overrides: Record<string, unknown>) {
  return {
    mode_used: "cached_arabic_audio",
    success: false,
    provider: "elevenlabs",
    error_message: null,
    audio_url: null,
    voice_id: null,
    elevenlabs_api_key_present: false,
    ...overrides,
  };
}

async function isValidPreviewJwt(jwt: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) return false;
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error) console.warn("kds preview auth failed", { message: error.message });
  return !!data.user;
}

async function sha1(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, display_number, template, language, preview } = await req.json();
    if (display_number == null) {
      return jsonResp(diagnostic({ error: "display_number required", error_message: "display_number required" }), 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (preview) {
      // Preview from admin settings — require a valid logged-in user via JWT.
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      if (!jwt || !(await isValidPreviewJwt(jwt))) {
        return jsonResp(diagnostic({
          error: "unauthorized_preview",
          error_message: "فشل التحقق من جلسة المستخدم لتجربة الصوت. سجّل الدخول من جديد ثم جرّب.",
        }), 401);
      }
    } else {
      if (!token) return jsonResp(diagnostic({ error: "token required", error_message: "token required" }), 400);
      const { data: device } = await supabase
        .from("pos_display_devices")
        .select("id, device_type, is_active")
        .eq("token", token).eq("is_active", true).maybeSingle();
      if (!device) return jsonResp(diagnostic({ error: "invalid_token", error_message: "invalid_token" }), 401);
    }

    const VOICE_ID = (Deno.env.get("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE_ID).trim();
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    console.log("kds audio request", {
      preview: !!preview,
      has_token: !!token,
      display_number: String(display_number),
      voice_id: VOICE_ID,
      model_id: MODEL_ID,
      elevenlabs_api_key_present: !!apiKey,
      bucket: BUCKET,
    });
    const tpl = template || "طلب رقم {n}، تفضل للاستلام";
    const text = tpl.replace(/\{n\}/g, String(display_number));
    const lang = language || "ar-PS";
    const hash = await sha1(`${VOICE_ID}|${MODEL_ID}|${lang}|${text}`);
    const path = `${lang}/${hash}.mp3`;

    // Cached?
    const { data: head } = await supabase.storage.from(BUCKET).list(lang, {
      search: `${hash}.mp3`, limit: 1,
    });
    if (head && head.length > 0) {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      console.log("kds audio cache hit", { path, voice_id: VOICE_ID });
      return jsonResp(diagnostic({
        success: true,
        error_message: null,
        audio_url: pub.publicUrl,
        voice_id: VOICE_ID,
        elevenlabs_api_key_present: !!apiKey,
        cached: true,
        text,
      }));
    }

    // Need a TTS key
    if (!apiKey) {
      console.warn("kds audio missing ELEVENLABS_API_KEY", { voice_id: VOICE_ID });
      return jsonResp(diagnostic({
        error: "tts_not_configured",
        error_message: "فشل ElevenLabs: ELEVENLABS_API_KEY غير مضبوط",
        voice_id: VOICE_ID,
        elevenlabs_api_key_present: false,
        text,
      }), 503);
    }

    const ttsResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text, model_id: MODEL_ID,
          voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.95 },
        }),
      },
    );
    if (!ttsResp.ok) {
      const err = await ttsResp.text();
      let reason = err;
      try {
        const j = JSON.parse(err);
        if (j?.detail?.status === "detected_unusual_activity") {
          reason = "ElevenLabs عطّل المفتاح المجاني (Unusual activity). يلزم اشتراك مدفوع. سيتم استخدام صوت المتصفح كبديل.";
        } else if (j?.detail?.message) {
          reason = j.detail.message;
        }
      } catch { /* keep raw */ }
      console.warn("kds ElevenLabs TTS failed", { status: ttsResp.status, voice_id: VOICE_ID, reason });
      return jsonResp(diagnostic({
        error: "tts_failed",
        error_message: `فشل ElevenLabs: ${reason}`,
        voice_id: VOICE_ID,
        elevenlabs_api_key_present: true,
        text,
      }), 502);
    }
    const mp3 = await ttsResp.arrayBuffer();

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mp3, {
      contentType: "audio/mpeg", upsert: true, cacheControl: "public, max-age=31536000",
    });
    if (upErr) return jsonResp({ error: "upload_failed", message: upErr.message }, 500);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return jsonResp({ audio_url: pub.publicUrl, cached: false, text });
  } catch (e: any) {
    return jsonResp({ error: "internal_error", message: e?.message || String(e) }, 500);
  }
});
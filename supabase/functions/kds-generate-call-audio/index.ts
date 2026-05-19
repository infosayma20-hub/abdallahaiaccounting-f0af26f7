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

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — supports Arabic via multilingual_v2
const MODEL_ID = "eleven_multilingual_v2";
const BUCKET = "kds-audio-cache";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha1(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, display_number, template, language } = await req.json();
    if (!token || display_number == null) {
      return jsonResp({ error: "token and display_number required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate device token
    const { data: device } = await supabase
      .from("pos_display_devices")
      .select("id, device_type, is_active")
      .eq("token", token).eq("is_active", true).maybeSingle();
    if (!device) return jsonResp({ error: "invalid_token" }, 401);

    const VOICE_ID = (Deno.env.get("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE_ID).trim();
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
      return jsonResp({ audio_url: pub.publicUrl, cached: true, text });
    }

    // Need a TTS key
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return jsonResp({
        error: "tts_not_configured",
        message: "ELEVENLABS_API_KEY غير مضبوط — أضف المفتاح لتفعيل الصوت العربي الثابت",
      }, 503);
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
      return jsonResp({ error: "tts_failed", message: err }, 502);
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
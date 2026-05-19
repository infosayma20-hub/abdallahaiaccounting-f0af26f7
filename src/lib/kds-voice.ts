/**
 * KDS voice utility — speaks order numbers in Arabic using the browser's
 * built-in Web Speech API. No external network calls; works offline.
 *
 * Why Web Speech for v1: zero deps, instant, free, language-aware.
 * Quality depends on the device; we pick the best available Arabic voice.
 * A future version can swap this for ElevenLabs MP3 stitching.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined = undefined;

let lastVoiceError: string | null = null;
export function getLastVoiceError(): string | null { return lastVoiceError; }

/** Structured result for the diagnostics UI on /pos/kds-control */
export interface VoiceResult {
  played: "cached_arabic_audio" | "browser_tts" | "beep_only" | "none";
  reason?: string;
  diagnostics?: VoiceDiagnostics;
}

export interface VoiceDiagnostics {
  mode_used: "cached_arabic_audio" | "browser_tts" | "beep_only";
  success: boolean;
  provider: "elevenlabs" | "browser" | "beep";
  error_message: string | null;
  audio_url: string | null;
  voice_id: string | null;
  elevenlabs_api_key_present: boolean | null;
  text?: string;
  cached?: boolean;
}

const cachedAudioElems = new Map<string, HTMLAudioElement>();

async function playCachedArabicAudio(
  token: string | undefined,
  displayNumber: string | number,
  opts: SpeakOptions,
): Promise<VoiceResult> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("kds-generate-call-audio", {
      body: {
        token, display_number: displayNumber,
        template: opts.template, language: opts.language,
        preview: opts.preview ? true : undefined,
      },
    });
    let responseData = data as (VoiceDiagnostics & { message?: string; error?: string }) | null;
    const response = (error as any)?.context as Response | undefined;
    if (error && response?.json) {
      try { responseData = await response.json(); } catch { /* keep invoke error */ }
    }
    const diagnostics = responseData as VoiceDiagnostics | undefined;
    if (error || !responseData?.audio_url || responseData?.success === false) {
      return {
        played: "none",
        reason: responseData?.error_message || responseData?.message || responseData?.error || error?.message || "tts_failed",
        diagnostics,
      };
    }
    const key = responseData.audio_url as string;
    let audio = cachedAudioElems.get(key);
    if (!audio) {
      audio = new Audio(key);
      audio.preload = "auto";
      cachedAudioElems.set(key, audio);
    }
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch (e: any) {
      return {
        played: "none",
        reason: `autoplay blocked: ${e?.message || e}`,
        diagnostics: { ...diagnostics, success: false, error_message: `autoplay blocked: ${e?.message || e}` } as VoiceDiagnostics,
      };
    }
    return { played: "cached_arabic_audio", diagnostics };
  } catch (e: any) {
    return { played: "none", reason: `mp3 load failed: ${e?.message || e}` };
  }
}

function pickArabicVoice(lang: string): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    cachedVoice = null;
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet
  const exact = voices.find(v => v.lang?.toLowerCase() === lang.toLowerCase());
  const arAny = voices.find(v => v.lang?.toLowerCase().startsWith("ar"));
  cachedVoice = exact || arAny || null;
  return cachedVoice;
}

export function ensureVoicesLoaded(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    if (window.speechSynthesis.getVoices().length) return resolve();
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(resolve, 1500);
  });
}

export interface SpeakOptions {
  template?: string;     // e.g. "طلب رقم {n}، تفضل للاستلام"
  language?: string;     // e.g. "ar-PS"
  rate?: number;         // 0.8 - 1.2
  pitch?: number;        // 0.8 - 1.2
  /** Optional device token enables cached_arabic_audio mode */
  deviceToken?: string;
  /** Strategy: cached_arabic_audio | browser_tts | beep_only (default browser_tts) */
  mode?: "cached_arabic_audio" | "browser_tts" | "beep_only";
  /** Admin preview from settings — uses JWT instead of device token */
  preview?: boolean;
}

export async function speakOrderCall(displayNumber: string | number, opts: SpeakOptions = {}): Promise<VoiceResult> {
  const tpl = opts.template || "طلب رقم {n}، تفضل للاستلام";
  const lang = opts.language || "ar-PS";
  const text = tpl.replace(/\{n\}/g, String(displayNumber));
  const mode = opts.mode || "browser_tts";

  // 1) Cached Arabic MP3 path. Do not silently downgrade this mode: callers need
  // the real ElevenLabs/storage reason so beep is not presented as success.
  if (mode === "cached_arabic_audio" && (opts.deviceToken || opts.preview)) {
    const r = await playCachedArabicAudio(opts.deviceToken, displayNumber, opts);
    if (r.played === "cached_arabic_audio") { lastVoiceError = null; return r; }
    lastVoiceError = r.reason || "cached audio unavailable";
    return r;
  }

  if (mode === "beep_only") {
    playFallbackAlert();
    return {
      played: "beep_only",
      reason: "configured beep_only",
      diagnostics: {
        mode_used: "beep_only",
        success: false,
        provider: "beep",
        error_message: "لم يتم تشغيل الصوت العربي. تم تشغيل تنبيه فقط.",
        audio_url: null,
        voice_id: null,
        elevenlabs_api_key_present: null,
      },
    };
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    lastVoiceError = "speechSynthesis غير متوفر — استخدام صوت تنبيه فقط";
    playFallbackAlert();
    return {
      played: "beep_only",
      reason: lastVoiceError,
      diagnostics: {
        mode_used: "browser_tts",
        success: false,
        provider: "beep",
        error_message: `لم يتم تشغيل الصوت العربي. تم تشغيل تنبيه فقط. ${lastVoiceError}`,
        audio_url: null,
        voice_id: null,
        elevenlabs_api_key_present: null,
      },
    };
  }

  await ensureVoicesLoaded();
  cachedVoice = undefined; // refresh selection in case language changed
  const voice = pickArabicVoice(lang);
  if (!voice) {
    lastVoiceError = "لا يوجد صوت عربي مثبت على هذا الجهاز";
    playFallbackAlert();
    return {
      played: "beep_only",
      reason: lastVoiceError,
      diagnostics: {
        mode_used: "browser_tts",
        success: false,
        provider: "beep",
        error_message: `لم يتم تشغيل الصوت العربي. تم تشغيل تنبيه فقط. ${lastVoiceError}`,
        audio_url: null,
        voice_id: null,
        elevenlabs_api_key_present: null,
      },
    };
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.voice = voice;
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = opts.pitch ?? 1;
  utter.onerror = (e: any) => { lastVoiceError = `خطأ في النطق: ${e?.error || "غير معروف"}`; };

  // Speak twice with a short gap, common practice for in-store calls.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  const second = new SpeechSynthesisUtterance(text);
  second.lang = lang;
  second.voice = voice;
  second.rate = utter.rate;
  second.pitch = utter.pitch;
  window.speechSynthesis.speak(second);
  lastVoiceError = null;
  return {
    played: "browser_tts",
    diagnostics: {
      mode_used: "browser_tts",
      success: true,
      provider: "browser",
      error_message: null,
      audio_url: null,
      voice_id: voice.name || null,
      elevenlabs_api_key_present: null,
      text,
    },
  };
}

/** Loud 3-tone fallback used when speech synthesis is unavailable. */
export function playFallbackAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [880, 1100, 880];
    const start = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const t0 = start + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.34);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch (e: any) { lastVoiceError = `تنبيه: ${e?.message}`; }
}

/** Quick chime to grab attention before the spoken call. */
export function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [880, 660];
    const start = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, start + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.25 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + i * 0.25);
      osc.stop(start + i * 0.25 + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* ignore */ }
}
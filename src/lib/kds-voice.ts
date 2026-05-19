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
}

export async function speakOrderCall(displayNumber: string | number, opts: SpeakOptions = {}) {
  const tpl = opts.template || "طلب رقم {n}، تفضل للاستلام";
  const lang = opts.language || "ar-PS";
  const text = tpl.replace(/\{n\}/g, String(displayNumber));

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    lastVoiceError = "speechSynthesis غير متوفر — استخدام صوت تنبيه فقط";
    playFallbackAlert();
    return;
  }

  await ensureVoicesLoaded();
  cachedVoice = undefined; // refresh selection in case language changed
  const voice = pickArabicVoice(lang);
  if (!voice) {
    lastVoiceError = "لا يوجد صوت عربي مثبت على هذا الجهاز — تشغيل تنبيه فقط";
    playFallbackAlert();
    return;
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
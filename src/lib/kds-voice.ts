/**
 * KDS voice utility — speaks order numbers in Arabic using the browser's
 * built-in Web Speech API. No external network calls; works offline.
 *
 * Why Web Speech for v1: zero deps, instant, free, language-aware.
 * Quality depends on the device; we pick the best available Arabic voice.
 * A future version can swap this for ElevenLabs MP3 stitching.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined = undefined;

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

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  await ensureVoicesLoaded();
  cachedVoice = undefined; // refresh selection in case language changed
  const voice = pickArabicVoice(lang);

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  if (voice) utter.voice = voice;
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = opts.pitch ?? 1;

  // Speak twice with a short gap, common practice for in-store calls.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  const second = new SpeechSynthesisUtterance(text);
  second.lang = lang;
  if (voice) second.voice = voice;
  second.rate = utter.rate;
  second.pitch = utter.pitch;
  window.speechSynthesis.speak(second);
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
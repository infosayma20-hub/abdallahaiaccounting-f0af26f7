/**
 * "Unify" notification chime — a short, premium two-note bell synthesized with
 * WebAudio (no asset download, works offline, instant).
 *
 * NOTE: for notifications delivered while the app is CLOSED, the sound is chosen
 * by the phone's OS notification channel — the web platform gives no control
 * over it. This chime covers the app-open (foreground / background tab) case.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers block audio until a user gesture — call this once on first tap. */
export function unlockNotificationSound() {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  c.resume().then(() => { unlocked = true; }, () => {});
}

/** One soft bell partial. */
function bell(c: AudioContext, freq: number, at: number, dur: number, gain: number) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  const tone = c.createBiquadFilter();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);

  tone.type = "lowpass";
  tone.frequency.setValueAtTime(4200, at);

  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(tone).connect(amp).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/**
 * Plays the Unify chime: a rising perfect-fifth bell pair (E6 → B6) with a warm
 * low octave underneath — short, calm, and "expensive" sounding.
 */
export function playNotificationChime() {
  const c = getCtx();
  if (!c) return;
  const start = () => {
    const t = c.currentTime + 0.01;
    // Warm body
    bell(c, 659.25, t, 1.1, 0.16);        // E5
    bell(c, 1318.51, t + 0.005, 0.9, 0.07); // E6 shimmer
    // Rising second note
    bell(c, 987.77, t + 0.16, 1.4, 0.14);   // B5
    bell(c, 1975.53, t + 0.165, 1.0, 0.05); // B6 shimmer
    // Sub for depth
    bell(c, 329.63, t, 1.3, 0.06);          // E4
  };
  if (c.state === "suspended") c.resume().then(start, () => {});
  else start();
}

/** Chime + a short haptic double-tap where supported. */
export function notifyAlert() {
  playNotificationChime();
  try { navigator.vibrate?.([18, 60, 28]); } catch { /* not supported */ }
}

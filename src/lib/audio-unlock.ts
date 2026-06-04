/**
 * Shared "alert beep" helper for POS / call-center screens.
 *
 * Chrome (and other Chromium browsers) block AudioContext playback until the
 * user has interacted with the page. To keep alert beeps reliable we:
 *   1. Lazily create ONE shared AudioContext per tab.
 *   2. Register a one-shot global `pointerdown` / `keydown` / `touchstart`
 *      listener that resumes the context on the user's very first gesture
 *      anywhere in the app (POS, sidebar, dialog buttons, …).
 *   3. Expose `isAudioUnlocked()` so the UI can show a silent-mode banner
 *      until the user has clicked somewhere.
 *
 * If the browser still refuses to play (e.g. the user never clicked, or
 * autoplay policy is stricter than usual) `playAlertBeep()` returns `false`
 * and the caller can fall back to a visual indicator. It NEVER throws.
 */

let ctx: AudioContext | null = null;
let unlocked = false;
let unlockListenersInstalled = false;
let lateAlertPlayingUntil = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tryResume(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "running") {
    unlocked = true;
    return;
  }
  try {
    const p = c.resume();
    if (p && typeof p.then === "function") {
      p.then(() => {
        if (c.state === "running") unlocked = true;
      }).catch(() => {});
    }
  } catch {
    /* noop */
  }
}

/**
 * Install global gesture listeners once. Safe to call from many components —
 * subsequent calls are no-ops.
 */
export function installAudioUnlock(): void {
  if (typeof window === "undefined") return;
  if (unlockListenersInstalled) return;
  unlockListenersInstalled = true;

  const onGesture = () => {
    tryResume();
  };
  // `once: true` removes the listener after the first event of that type.
  // We register three so any kind of first interaction unlocks audio.
  window.addEventListener("pointerdown", onGesture, { once: true, capture: true });
  window.addEventListener("keydown", onGesture, { once: true, capture: true });
  window.addEventListener("touchstart", onGesture, { once: true, capture: true, passive: true });

  // Best-effort: also try to resume eagerly in case the page was opened from
  // a user-initiated navigation (some browsers allow this).
  tryResume();
}

export function isAudioUnlocked(): boolean {
  return unlocked && !!ctx && ctx.state === "running";
}

/**
 * Play a short two-tone alert beep. Returns `true` if playback was scheduled,
 * `false` if the browser blocked it (caller should show a visual fallback).
 */
export function playAlertBeep(): boolean {
  const c = getCtx();
  if (!c) return false;
  // If the context is suspended, try one more time to resume — but don't beep
  // until it's actually running, otherwise we'd schedule a silent oscillator.
  if ((c.state as string) !== "running") {
    tryResume();
    if ((c.state as string) !== "running") return false;
  }
  try {
    const now = c.currentTime;
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = "sine";
    o1.frequency.value = 880;
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    o1.connect(g1).connect(c.destination);
    o1.start(now);
    o1.stop(now + 0.55);

    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = "sine";
    o2.frequency.value = 1100;
    g2.gain.setValueAtTime(0.0001, now + 0.3);
    g2.gain.exponentialRampToValueAtTime(0.25, now + 0.32);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    o2.connect(g2).connect(c.destination);
    o2.start(now + 0.3);
    o2.stop(now + 0.8);
    return true;
  } catch {
    return false;
  }
}

/**
 * Long call-center style "تنبيه طلبية متأخرة" — a calm, repeating two-tone
 * pattern that lasts ~4 seconds. Designed to be obviously audible without
 * being harsh. If another late-order alert is still playing, this call is a
 * no-op (returns `true`) so multiple late orders never stack their audio.
 */
export function playLateOrderAlert(): boolean {
  const c = getCtx();
  if (!c) return false;
  if ((c.state as string) !== "running") {
    tryResume();
    if ((c.state as string) !== "running") return false;
  }
  // Prevent overlapping playback if multiple late orders trigger at once.
  const nowMs = Date.now();
  if (nowMs < lateAlertPlayingUntil) return true;

  try {
    const start = c.currentTime;
    // 5 paired beeps (low → high), 0.75s per pair → ~3.75s total.
    const pairs = 5;
    const pairDuration = 0.75;
    const peak = 0.22;

    for (let i = 0; i < pairs; i++) {
      const t0 = start + i * pairDuration;

      // Low tone
      const oLow = c.createOscillator();
      const gLow = c.createGain();
      oLow.type = "sine";
      oLow.frequency.value = 720;
      gLow.gain.setValueAtTime(0.0001, t0);
      gLow.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
      gLow.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      oLow.connect(gLow).connect(c.destination);
      oLow.start(t0);
      oLow.stop(t0 + 0.35);

      // High tone (slightly after, like a call-center chime)
      const oHi = c.createOscillator();
      const gHi = c.createGain();
      oHi.type = "sine";
      oHi.frequency.value = 960;
      gHi.gain.setValueAtTime(0.0001, t0 + 0.34);
      gHi.gain.exponentialRampToValueAtTime(peak, t0 + 0.38);
      gHi.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      oHi.connect(gHi).connect(c.destination);
      oHi.start(t0 + 0.34);
      oHi.stop(t0 + 0.72);
    }

    const totalMs = Math.ceil(pairs * pairDuration * 1000);
    lateAlertPlayingUntil = nowMs + totalMs;
    return true;
  } catch {
    return false;
  }
}
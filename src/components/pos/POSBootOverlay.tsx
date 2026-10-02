import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

/**
 * Same visual as the post-login welcome popup, shown while POS prepares.
 * When `active` turns false: short success check, then fade out.
 */
export default function POSBootOverlay({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(active);
  const [success, setSuccess] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shownAtRef = useRef(Date.now());

  useEffect(() => {
    if (active) {
      if (!visible) shownAtRef.current = Date.now();
      setVisible(true);
      setSuccess(false);
      setLeaving(false);
      return;
    }
    if (!visible) return;
    // At least one full orbit so the popup never flashes.
    const delay = Math.max(0, 780 - (Date.now() - shownAtRef.current));
    const t1 = window.setTimeout(() => setSuccess(true), delay);
    const t2 = window.setTimeout(() => setLeaving(true), delay + 450);
    const t3 = window.setTimeout(() => setVisible(false), delay + 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!visible) return null;

  return (
    <div
      className={`post-login-welcome fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 ${leaving ? "post-login-welcome--leaving" : ""}`}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-label="جاري تجهيز نقطة البيع"
    >
      <div className="post-login-welcome__scrim" aria-hidden="true" />
      <main className="post-login-welcome__dialog relative z-10 flex w-full max-w-[240px] flex-col items-center border border-primary-foreground/20 bg-background/95 px-5 py-5 text-center text-foreground shadow-2xl backdrop-blur-xl">
        <div className={`post-login-welcome__check ${success ? "post-login-welcome__check--success" : ""}`} aria-hidden="true">
          <span className="post-login-welcome__orbit" />
          <Check className="post-login-welcome__checkmark h-8 w-8" strokeWidth={3} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-foreground">أهلاً بك</h1>
        <p className="mt-1 text-xs text-muted-foreground">جاري تجهيز نقطة البيع…</p>
      </main>
    </div>
  );
}

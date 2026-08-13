/**
 * useCardScanner — التقاط قراءات الماسح الضوئي (USB HID) على الكاش.
 * الماسح يتصرّف كلوحة مفاتيح: أحرف سريعة متتابعة تنتهي بـ Enter.
 * نتجاهل الكتابة اليدوية البطيئة والحقول النشطة (input/textarea).
 */
import { useEffect, useRef } from "react";

interface Options {
  onScan: (code: string) => void;
  enabled?: boolean;
  /** أقصى فاصل زمني بين حرفين ليُعتبر مسحاً آلياً (ms) */
  maxKeyInterval?: number;
  minLength?: number;
}

export function useCardScanner({ onScan, enabled = true, maxKeyInterval = 40, minLength = 5 }: Options) {
  const buffer = useRef("");
  const lastTime = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      const now = Date.now();
      if (now - lastTime.current > maxKeyInterval) buffer.current = "";
      lastTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          cb.current(code);
        }
        return;
      }

      if (e.key.length === 1) {
        // أثناء الكتابة اليدوية داخل حقل: نتجاهل إلا إذا كان الإيقاع سريعاً جداً (ماسح)
        if (typing && now - lastTime.current > maxKeyInterval) return;
        buffer.current += e.key;
        if (buffer.current.length > 64) buffer.current = "";
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [enabled, maxKeyInterval, minLength]);
}

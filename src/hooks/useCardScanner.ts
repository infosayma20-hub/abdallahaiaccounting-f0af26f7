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

export function useCardScanner({ onScan, enabled = true, maxKeyInterval = 80, minLength = 5 }: Options) {
  const buffer = useRef("");
  const lastTime = useRef(0);
  const fastChars = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      const now = Date.now();
      const delta = now - lastTime.current;
      if (delta > maxKeyInterval) { buffer.current = ""; fastChars.current = 0; }
      lastTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        const wasFast = fastChars.current >= minLength - 1;
        buffer.current = "";
        fastChars.current = 0;
        // داخل حقل إدخال: نقبل فقط إذا كان الإيقاع سريعاً (ماسح) لا كتابة يدوية
        if (code.length >= minLength && (!typing || wasFast)) {
          e.preventDefault();
          cb.current(code);
        }
        return;
      }

      if (e.key.length === 1) {
        // USB/HID readers emulate a keyboard. `e.key` follows the active OS
        // keyboard language, which can corrupt an ASCII loyalty code when the
        // cashier uses Arabic. `e.code` represents the physical US key sent by
        // the reader and is stable across keyboard layouts.
        let scannedChar = e.key;
        if (/^Key[A-Z]$/.test(e.code)) {
          const letter = e.code.slice(3);
          scannedChar = e.shiftKey ? letter : letter.toLowerCase();
        } else if (/^Digit[0-9]$/.test(e.code)) {
          scannedChar = e.code.slice(5);
        } else if (/^Numpad[0-9]$/.test(e.code)) {
          scannedChar = e.code.slice(6);
        }
        buffer.current += scannedChar;
        if (delta <= maxKeyInterval) fastChars.current += 1;
        if (buffer.current.length > 200) { buffer.current = ""; fastChars.current = 0; }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [enabled, maxKeyInterval, minLength]);
}

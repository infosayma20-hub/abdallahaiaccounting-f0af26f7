import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * حقل وقت بسيط بالكتابة اليدوية فقط (بدون منتقي الساعة).
 * يقبل صيغة 24 ساعة مثل 9:05 أو 09:05 ويطبّعها إلى HH:MM عند الخروج من الحقل.
 */
export function TimeTextInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const normalize = (raw: string): string | null => {
    const m = raw.trim().match(/^(\d{1,2})\s*[:：.]\s*(\d{1,2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      dir="ltr"
      placeholder="09:00"
      className={className}
      value={draft ?? value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d:：.]/g, "").slice(0, 5);
        setDraft(v);
        const n = normalize(v);
        if (n) onChange(n);
      }}
      onBlur={() => {
        if (draft !== null) {
          const n = normalize(draft);
          if (n) onChange(n);
          setDraft(null);
        }
      }}
    />
  );
}

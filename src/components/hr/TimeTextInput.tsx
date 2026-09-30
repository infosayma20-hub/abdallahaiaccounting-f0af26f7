import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * حقل وقت بالكتابة اليدوية (بدون منتقي الساعة) بنظام AM/PM.
 * يقبل: "5:30 PM" / "5:30م" / "9:05 AM" / "9:05ص" وأيضاً 24 ساعة "17:30".
 * يعرض القيمة بصيغة 12 ساعة، ويُرجع للنظام دائماً HH:MM (24 ساعة) للتخزين.
 */
export function parseTimeText(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const m = s.match(/^(\d{1,2})(?:\s*[:：.]\s*(\d{1,2}))?\s*(am|pm|a|p|ص|م)?\.?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] !== undefined ? Number(m[2]) : 0;
  const mer = m[3];
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    const isPm = mer === "pm" || mer === "p" || mer === "م";
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
  } else {
    if (m[2] === undefined) return null; // bare "5" is ambiguous
    if (h > 23) return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatTime12(v: string): string {
  const m = (v || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return v || "";
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

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
  const invalid = draft !== null && draft.trim() !== "" && !parseTimeText(draft);

  return (
    <Input
      type="text"
      dir="ltr"
      placeholder="09:00 AM"
      aria-invalid={invalid || undefined}
      className={`${className ?? ""} ${invalid ? "border-destructive" : ""}`}
      value={draft ?? formatTime12(value)}
      onChange={(e) => {
        const v = e.target.value.slice(0, 12);
        setDraft(v);
        const n = parseTimeText(v);
        if (n) onChange(n);
      }}
      onBlur={() => {
        if (draft === null) return;
        const n = parseTimeText(draft);
        if (n) {
          onChange(n);
          setDraft(null);
        } else if (draft.trim() === "") {
          setDraft(null);
        }
        // غير صالح: نُبقي النص ظاهراً مع إطار أحمر بدل الرجوع الصامت للقيمة القديمة
      }}
    />
  );
}

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
  // تقسيم القيمة المخزنة HH:MM إلى ساعة (1-12) ودقائق وفترة
  const parsed = (() => {
    const m = (value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    return { h12: String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0"), min: m[2], pm: h >= 12 };
  })();

  const [hDraft, setHDraft] = useState<string | null>(null);
  const [mDraft, setMDraft] = useState<string | null>(null);
  const [pmLocal, setPmLocal] = useState<boolean | null>(null);
  const minRef = useRef<HTMLInputElement>(null);

  const hour = hDraft ?? parsed?.h12 ?? "";
  const minute = mDraft ?? parsed?.min ?? "";
  const pm = pmLocal ?? parsed?.pm ?? false;

  const emit = (hStr: string, mStr: string, isPm: boolean) => {
    const h = Number(hStr);
    const mi = Number(mStr);
    if (hStr === "" || mStr === "" || !(h >= 1 && h <= 12) || !(mi >= 0 && mi <= 59)) return false;
    let h24 = h % 12;
    if (isPm) h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
    return true;
  };

  const hInvalid = hour !== "" && !(Number(hour) >= 1 && Number(hour) <= 12);
  const mInvalid = minute !== "" && !(Number(minute) >= 0 && Number(minute) <= 59);

  const box = "w-9 bg-transparent text-center outline-none tabular-nums";

  return (
    <div
      dir="ltr"
      className={cn(
        "flex h-10 w-full items-center gap-1 rounded-md border border-input bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring",
        (hInvalid || mInvalid) && "border-destructive",
        className,
      )}
    >
      <input
        inputMode="numeric"
        placeholder="09"
        aria-label="الساعة"
        className={box}
        value={hour}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          setHDraft(v);
          emit(v, minute, pm);
          // انتقال تلقائي للدقائق بعد رقمين أو رقم لا يمكن أن يبدأ ساعة من خانتين
          if (v.length === 2 || (v.length === 1 && Number(v) > 1)) minRef.current?.focus();
        }}
        onBlur={() => {
          if (hDraft && emit(hDraft, minute, pm)) setHDraft(null);
        }}
      />
      <span className="text-muted-foreground">:</span>
      <input
        ref={minRef}
        inputMode="numeric"
        placeholder="00"
        aria-label="الدقائق"
        className={box}
        value={minute}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          setMDraft(v);
          emit(hour, v, pm);
        }}
        onBlur={() => {
          if (mDraft !== null && emit(hour, mDraft.padStart(2, "0"), pm)) setMDraft(null);
        }}
      />
      <div className="ms-auto flex overflow-hidden rounded border border-input text-xs font-semibold">
        {([false, true] as const).map((isPm) => (
          <button
            key={String(isPm)}
            type="button"
            tabIndex={-1}
            onClick={() => {
              setPmLocal(isPm);
              emit(hour, minute, isPm);
            }}
            className={cn(
              "px-2 py-1 transition-colors",
              pm === isPm ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {isPm ? "PM" : "AM"}
          </button>
        ))}
      </div>
    </div>
  );
}

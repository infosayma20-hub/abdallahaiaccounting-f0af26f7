import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * حقل وقت بالكتابة اليدوية (بدون منتقي الساعة) بنظام AM/PM.
 * يقبل: "5:30 PM" / "5:30م" / "9:05 AM" / "9:05ص" وأيضاً 24 ساعة "17:30".
 * يعرض القيمة بصيغة 12 ساعة، ويُرجع للنظام دائماً HH:MM (24 ساعة) للتخزين.
 */
export function parseTimeText(raw: string): string | null {
  const s = (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  const m = s.match(/^(\d{1,2})(?:\s*[:：.]\s*(\d{1,2}))?(?::\d{1,2})?\s*(am|pm|a|p|ص|م)?\.?$/);
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

/** يحوّل أي صيغة وقت مقبولة إلى HH:MM (24 ساعة)، أو "" إن لم تكن صالحة. */
export function normalizeTime24(v: string | null | undefined): string {
  return parseTimeText(v || "") ?? "";
}

export function formatTime12(v: string): string {
  const n = parseTimeText(v || "");
  if (!n) return v || "";
  const h = Number(n.slice(0, 2));
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${n.slice(3)} ${h < 12 ? "AM" : "PM"}`;
}

/** تحديد كامل محتوى الخانة — مؤجَّل ليعمل على الآيفون/الآيباد أيضاً. */
function selectAll(el: HTMLInputElement) {
  el.select();
  requestAnimationFrame(() => {
    try { el.setSelectionRange(0, el.value.length); } catch { /* ignore */ }
  });
}

/** يأخذ آخر رقمين كُتبا — حتى لو لم يُحدَّد النص القديم (مثلاً "01" ثم "2" ⇒ "12"). */
function lastTwoDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length > 2 ? d.slice(-2) : d;
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
  // القيمة المخزنة قد تصل بصيغة "13:10" أو "01:10 PM" — نوحّدها قبل التقسيم.
  const parsed = (() => {
    const n = parseTimeText(value || "");
    if (!n) return null;
    const h = Number(n.slice(0, 2));
    return { h12: String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0"), min: n.slice(3), pm: h >= 12 };
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

  const hourComplete = (v: string) => v.length === 2 || (v.length === 1 && Number(v) > 1);

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
        onFocus={(e) => selectAll(e.currentTarget)}
        onChange={(e) => {
          const v = lastTwoDigits(e.target.value);
          setHDraft(v);
          // لا نحفظ ساعة ناقصة (مثل "1" أثناء كتابة "12") — ننتظر اكتمالها أو الخروج من الخانة.
          if (hourComplete(v)) {
            emit(v, minute, pm);
            minRef.current?.focus();
          }
        }}
        onBlur={() => {
          if (hDraft !== null && emit(hDraft, minute, pm)) setHDraft(null);
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
        onFocus={(e) => selectAll(e.currentTarget)}
        onChange={(e) => {
          const v = lastTwoDigits(e.target.value);
          setMDraft(v);
          if (v.length === 2) emit(hour, v, pm);
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
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const h = hDraft ?? hour;
              const m = mDraft !== null ? mDraft.padStart(2, "0") : minute;
              if (emit(h, m, isPm)) {
                setPmLocal(null);
                setHDraft(null);
                setMDraft(null);
              } else {
                setPmLocal(isPm);
              }
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

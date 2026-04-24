/**
 * TypedDateInput — Typeable dd/mm/yyyy date field for accountants.
 * ────────────────────────────────────────────────────────────────
 * - Users type the date directly (digits only); auto-inserts "/" separators.
 * - Accepts inputs like "23042026" → "23/04/2026" and "23/4/2026" → "23/04/2026".
 * - Stores the value as ISO yyyy-mm-dd via `onChange`.
 * - Calendar icon on the side opens the native picker as an optional fallback.
 * - Shows a subtle red border if the typed value is incomplete or invalid.
 * - Enter is allowed to bubble up so SmartFormScope can move to next field.
 */
import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** ISO yyyy-mm-dd value (controlled). */
  value: string;
  /** Called with ISO yyyy-mm-dd (or "" if cleared). */
  onChange: (iso: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Forward additional data-* attributes for SmartFormScope / first-field marking. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & Record<string, any>;
}

const isoToDDMMYYYY = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const ddmmyyyyToIso = (s: string): string | null => {
  // Accept dd/mm/yyyy or d/m/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  const day = Number(dd), mon = Number(mm), year = Number(yyyy);
  if (mon < 1 || mon > 12) return null;
  if (day < 1 || day > 31) return null;
  // Validate real calendar date
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (
    d.getFullYear() !== year ||
    d.getMonth() + 1 !== mon ||
    d.getDate() !== day
  ) return null;
  return `${yyyy}-${mm}-${dd}`;
};

/** Auto-format raw user input into dd/mm/yyyy as they type.
 *  Strips non-digits, then inserts slashes after positions 2 and 4.
 */
const formatTyped = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export default function TypedDateInput({
  value,
  onChange,
  ariaLabel,
  placeholder = "dd/mm/yyyy",
  className,
  disabled,
  inputProps,
}: Props) {
  const [text, setText] = useState<string>(() => isoToDDMMYYYY(value));
  const pickerRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local text in sync with external value changes (e.g. duplicate, restore draft).
  useEffect(() => {
    const next = isoToDDMMYYYY(value);
    setText((prev) => (prev === next ? prev : next));
  }, [value]);

  const commit = (raw: string) => {
    const formatted = formatTyped(raw);
    setText(formatted);
    if (formatted.length === 0) {
      onChange("");
      return;
    }
    const iso = ddmmyyyyToIso(formatted);
    if (iso) onChange(iso);
  };

  const onBlur = () => {
    if (!text) {
      onChange("");
      return;
    }
    const iso = ddmmyyyyToIso(text);
    if (iso) {
      // normalize with leading zeros
      setText(isoToDDMMYYYY(iso));
      onChange(iso);
    }
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof (el as any).showPicker === "function") {
      try { (el as any).showPicker(); return; } catch { /* fall-through */ }
    }
    el.focus();
    el.click();
  };

  const isValid = text.length === 0 || ddmmyyyyToIso(text) !== null;
  const isComplete = text.length === 10 && isValid;

  return (
    <div className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        {...inputProps}
        className={cn(
          "w-full h-10 rounded-xl border bg-background pr-9 pl-3 text-sm tabular-nums",
          "shadow-sm transition-colors outline-none",
          "placeholder:text-muted-foreground/60",
          "hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/15",
          isValid ? "border-input" : "border-destructive/60 focus:border-destructive",
          isComplete && "border-primary/40",
          inputProps?.className,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        title="فتح التقويم"
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center",
          "h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-muted/60 transition-colors",
        )}
      >
        <Calendar className="w-3.5 h-3.5" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ""}
        onChange={(e) => {
          const iso = e.target.value;
          onChange(iso);
          setText(isoToDDMMYYYY(iso));
        }}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          right: 0,
          top: 0,
          direction: "ltr",
        }}
      />
    </div>
  );
}
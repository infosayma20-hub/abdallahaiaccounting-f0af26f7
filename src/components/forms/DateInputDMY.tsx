/**
 * DateInputDMY — date input that DISPLAYS dd/mm/yyyy
 * but exposes the value in ISO (yyyy-mm-dd) to the parent.
 *
 * - Storage / API value: ISO (yyyy-mm-dd)
 * - Visible / typed value: dd/mm/yyyy
 * - Native picker available via the calendar icon (📅) on the right.
 *
 * Use as a drop-in replacement for `<Input type="date" />`.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

export interface DateInputDMYProps {
  /** ISO date (yyyy-mm-dd) or empty string */
  value: string;
  /** Returns ISO date (yyyy-mm-dd) or empty string */
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Forwarded onKeyDown (for Enter→next-cheque navigation, etc.) */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const isoToDmy = (iso: string): string => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const dmyToIso = (dmy: string): string => {
  const cleaned = dmy.trim();
  // Accept dd/mm/yyyy or dd-mm-yyyy
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(cleaned);
  if (!m) return "";
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  // basic validity guard
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  if (Number.isNaN(d.getTime())) return "";
  return `${yyyy}-${mm}-${dd}`;
};

/** Auto-insert "/" while typing dd/mm/yyyy */
const maskDmy = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const DateInputDMY = React.forwardRef<HTMLInputElement, DateInputDMYProps>(
  ({ value, onChange, className, placeholder = "dd/mm/yyyy", disabled, onKeyDown }, ref) => {
    const [text, setText] = React.useState<string>(() => isoToDmy(value));
    const hiddenRef = React.useRef<HTMLInputElement | null>(null);

    // Keep text in sync when parent value changes (e.g., reset)
    React.useEffect(() => {
      setText(isoToDmy(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = maskDmy(e.target.value);
      setText(masked);
      const iso = dmyToIso(masked);
      if (iso) onChange(iso);
      else if (masked === "") onChange("");
    };

    const handleBlur = () => {
      if (!text) return;
      const iso = dmyToIso(text);
      if (iso) {
        setText(isoToDmy(iso));
        onChange(iso);
      }
    };

    const openPicker = (e?: React.MouseEvent) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (disabled) return;
      const el = hiddenRef.current;
      if (!el) return;
      // Modern browsers
      // @ts-ignore
      if (typeof el.showPicker === "function") {
        try { (el as any).showPicker(); return; } catch {}
      }
      try { el.focus(); el.click(); } catch {}
    };

    return (
      <div className={cn("relative", className)}>
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8 font-mono"
          dir="ltr"
        />
        <button
          type="button"
          onClick={openPicker}
          tabIndex={-1}
          className="absolute inset-y-0 right-1.5 flex items-center justify-center px-1 text-muted-foreground/70 hover:text-foreground transition-colors"
          aria-label="فتح التقويم"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>
        <input
          ref={hiddenRef}
          type="date"
          value={value || ""}
          onChange={(e) => {
            const iso = e.target.value;
            setText(isoToDmy(iso));
            onChange(iso);
          }}
          tabIndex={-1}
          aria-hidden="true"
          // sr-only-like positioning but WITHOUT pointer-events:none,
          // so showPicker()/click() fallback can actually open the native picker.
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 1,
            height: 1,
            opacity: 0,
            border: 0,
            padding: 0,
            margin: 0,
          }}
        />
      </div>
    );
  },
);
DateInputDMY.displayName = "DateInputDMY";

export default DateInputDMY;
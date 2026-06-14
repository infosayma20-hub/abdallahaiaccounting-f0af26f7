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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

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
    const [open, setOpen] = React.useState(false);

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

    const selectedDate = React.useMemo(() => {
      if (!value) return undefined;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      if (!m) return undefined;
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }, [value]);

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
        <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              className="absolute inset-y-0 right-1.5 flex items-center justify-center px-1 text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="فتح التقويم"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" dir="rtl">
            <CalendarPicker
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                if (!d) return;
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setText(isoToDmy(iso));
                onChange(iso);
                setOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
DateInputDMY.displayName = "DateInputDMY";

export default DateInputDMY;
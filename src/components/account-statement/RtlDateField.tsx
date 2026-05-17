import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";

/**
 * RTL-safe editable date field.
 *
 * - Visible value is dd/mm/yyyy (editable text input).
 * - User can type manually; value commits on blur or Enter.
 * - Calendar icon (right side) opens the native date picker.
 * - Stored value remains ISO yyyy-mm-dd.
 */

interface Props {
  value: string;          // ISO yyyy-mm-dd
  onChange: (v: string) => void;
  label?: string;
  ariaLabel?: string;
}

const isoToDDMM = (iso: string) => {
  if (!iso) return "";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

// Parse user input. Accepts dd/mm/yyyy, dd-mm-yyyy, ddmmyyyy, also yyyy-mm-dd.
const parseToISO = (raw: string): string | null => {
  if (!raw) return "";
  const s = raw.trim();

  // yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return validISO(+y, +mo, +d);
  }

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    let yn = parseInt(y, 10);
    if (yn < 100) yn += 2000;
    return validISO(yn, +mo, +d);
  }

  // ddmmyyyy compact
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return validISO(+m[3], +m[2], +m[1]);

  return null;
};

const validISO = (y: number, mo: number, d: number): string | null => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
};

export default function RtlDateField({ value, onChange, label, ariaLabel }: Props) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(isoToDDMM(value));

  // Keep text in sync when parent value changes externally.
  useEffect(() => {
    setText(isoToDDMM(value));
  }, [value]);

  const commit = () => {
    const iso = parseToISO(text);
    if (iso === null) {
      // invalid — revert
      setText(isoToDDMM(value));
      return;
    }
    if (iso !== value) onChange(iso);
    setText(isoToDDMM(iso));
  };

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof (el as any).showPicker === "function") {
      try { (el as any).showPicker(); return; } catch { /* fall through */ }
    }
    el.click();
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {label && (
        <span className="text-[10px] font-semibold text-muted-foreground select-none">
          {label}
        </span>
      )}
      <div
        className="relative inline-flex items-center gap-1.5 h-7 px-2 rounded border bg-card text-foreground text-xs tabular-nums hover:border-primary/50 focus-within:border-primary/70 transition-colors"
        style={{ borderColor: "#E5E7EB", direction: "ltr" }}
      >
        <input
          type="text"
          inputMode="numeric"
          value={text}
          placeholder="dd/mm/yyyy"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setText(isoToDDMM(value)); (e.target as HTMLInputElement).blur(); }
          }}
          aria-label={ariaLabel || label}
          className="bg-transparent outline-none border-0 p-0 text-xs tabular-nums w-[78px] text-foreground"
          style={{ direction: "ltr" }}
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label="فتح التقويم"
          className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          style={{ background: "none", border: "none", padding: 0 }}
        >
          <Calendar aria-hidden="true" className="w-3 h-3" />
        </button>
        {/* Hidden native date input — used only to open the OS date picker. */}
        <input
          ref={nativeRef}
          type="date"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

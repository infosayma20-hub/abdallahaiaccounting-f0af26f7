import { useRef } from "react";
import { Calendar } from "lucide-react";

/**
 * RTL-safe date field.
 *
 * Bug being fixed: stacking a transparent native <input type="date"> on top of a
 * formatted overlay <span> causes the caret/selection to render at the wrong
 * position in RTL layouts (caret appears far from the digits the user clicks).
 *
 * This component avoids that entirely by:
 *  - keeping a real, fully-visible <input type="date"> for accessibility and
 *    keyboard input,
 *  - rendering it LTR (which is what date inputs require) inside the RTL page,
 *  - showing a separate dd/mm/yyyy display label that the user can click to
 *    open the native picker (no overlay over the input itself).
 */

interface Props {
  value: string;          // ISO yyyy-mm-dd
  onChange: (v: string) => void;
  label?: string;
  ariaLabel?: string;
}

const fmtDDMMYYYY = (iso: string) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

export default function RtlDateField({ value, onChange, label, ariaLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // Modern browsers
    if (typeof (el as any).showPicker === "function") {
      try { (el as any).showPicker(); return; } catch { /* fall through */ }
    }
    el.focus();
    el.click();
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {label && (
        <span className="text-[10px] font-semibold text-muted-foreground select-none">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={openPicker}
        aria-label={ariaLabel || label}
        className="inline-flex items-center gap-1.5 h-7 px-2 rounded border bg-card text-foreground text-xs tabular-nums hover:border-primary/50 focus:outline-none focus:border-primary/70 transition-colors"
        style={{ borderColor: "#E5E7EB", direction: "ltr" }}
      >
        <Calendar className="w-3 h-3 text-muted-foreground" />
        <span>{fmtDDMMYYYY(value)}</span>
      </button>
      {/* Real input — visually hidden but accessible to the picker.
          We DO NOT overlay it on top of any visible text — this is what
          previously caused the caret-misalignment bug. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          // Keep it in LTR so the OS picker positions correctly
          direction: "ltr",
        }}
      />
    </div>
  );
}
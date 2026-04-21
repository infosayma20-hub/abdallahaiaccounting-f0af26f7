import { Sparkles } from "lucide-react";
import { STYLE_OPTIONS, type WritingStyle } from "./writingStyles";

interface Props {
  value: WritingStyle | null;
  onChange: (style: WritingStyle) => void;
}

const StyleSelector = ({ value, onChange }: Props) => {
  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">أسلوب الكتابة</span>
        <span className="text-[10px] text-muted-foreground">— يعبّئ الحقول النصية تلقائياً</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {STYLE_OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`flex flex-col items-center gap-0.5 p-2 rounded-md border text-center transition-all ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <span className="text-base leading-none">{opt.emoji}</span>
              <span className="text-[11px] font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {value && (
        <p className="text-[10px] text-muted-foreground mt-2">
          {STYLE_OPTIONS.find(o => o.id === value)?.description}
        </p>
      )}
    </div>
  );
};

export default StyleSelector;
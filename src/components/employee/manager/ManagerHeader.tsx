import { ChevronRight } from "lucide-react";

export default function ManagerHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border" dir="rtl">
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          onClick={onBack}
          className="h-9 w-9 rounded-xl bg-secondary/60 flex items-center justify-center active:scale-95 transition"
          aria-label="رجوع"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
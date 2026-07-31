import { Quote, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrainingLesson } from "@/hooks/training/useTraining";

/**
 * عرض شريحة تدريبية بتصميم يونيفاي (D365) — RTL، بدون نوافذ منبثقة.
 */
export function LessonSlideView({ lesson, compact = false }: { lesson: TrainingLesson; compact?: boolean }) {
  const c = lesson.content || {};
  const isSection = lesson.lesson_type === "section" || lesson.lesson_type === "cover";

  return (
    <div dir="rtl" className="w-full">
      {/* Header band */}
      <div
        className={cn(
          "rounded-lg border border-border px-4 py-3 mb-3",
          isSection ? "bg-primary text-primary-foreground border-primary" : "bg-card",
          lesson.lesson_type === "warning" && "border-destructive/40",
        )}
      >
        {lesson.section && (
          <div className={cn("text-[11px] mb-0.5", isSection ? "opacity-80" : "text-muted-foreground")}>
            {lesson.section}
          </div>
        )}
        <h2 className={cn("font-bold leading-snug", compact ? "text-[16px]" : "text-[20px]")}>{lesson.title}</h2>
        {lesson.subtitle && (
          <p className={cn("mt-1 text-[13px]", isSection ? "opacity-90" : "text-muted-foreground")}>{lesson.subtitle}</p>
        )}
      </div>

      {c.quote?.text && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-3 flex gap-2">
          <Quote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-[15px] font-semibold leading-relaxed">﴿{c.quote.text}﴾</p>
            {c.quote.source && <p className="text-[11px] text-muted-foreground mt-1">{c.quote.source}</p>}
          </div>
        </div>
      )}

      {!!c.steps?.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {c.steps.map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-card p-3 flex gap-3">
              <span className="h-7 w-7 shrink-0 rounded-md bg-primary/10 text-primary font-bold text-[13px] flex items-center justify-center">
                {s.n}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[14px]">{s.title}</div>
                {s.desc && <div className="text-[12.5px] text-muted-foreground leading-relaxed">{s.desc}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!!c.columns?.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {c.columns.map((col, i) => (
            <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-muted/60 px-3 py-1.5 text-[13px] font-bold border-b border-border">{col.title}</div>
              <ul className="p-3 space-y-1.5">
                {col.items.map((it, j) => (
                  <li key={j} className="text-[13px] leading-relaxed flex gap-2">
                    <span className="text-primary">•</span><span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!!c.bullets?.length && (
        <ul className="rounded-lg border border-border bg-card p-4 space-y-2 mb-3">
          {c.bullets.map((b, i) => (
            <li key={i} className="text-[14px] leading-relaxed flex gap-2">
              <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", lesson.lesson_type === "warning" ? "bg-destructive" : "bg-primary")} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {c.badge && (
        <div className={cn(
          "rounded-lg border px-4 py-3 mb-3",
          lesson.lesson_type === "warning" ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5",
        )}>
          <div className="text-[12px] font-bold mb-1.5 flex items-center gap-1.5">
            {lesson.lesson_type === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            {c.badge.title}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.badge.items.map((it, i) => (
              <span key={i} className="rounded-md bg-card border border-border px-2 py-1 text-[12.5px] font-medium">{it}</span>
            ))}
          </div>
        </div>
      )}

      {c.note && (
        <div className="rounded-lg border-r-4 border-primary bg-muted/40 px-3 py-2 text-[13px] leading-relaxed">
          {c.note}
        </div>
      )}
    </div>
  );
}

export default LessonSlideView;
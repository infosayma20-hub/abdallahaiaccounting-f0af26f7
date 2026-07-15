import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const AR_WEEKDAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

export function ScheduleModeEditor(props: {
  disabled?: boolean;
  mode: "monthly" | "weekly";
  openDay: number | null;
  closeDay: number | null;
  weekdays: number[];
  onMode: (v: "monthly" | "weekly") => void;
  onOpenDay: (n: number | null) => void;
  onCloseDay: (n: number | null) => void;
  onWeekdays: (arr: number[]) => void;
}) {
  const { disabled, mode, openDay, closeDay, weekdays } = props;
  const toggleDay = (d: number) => {
    if (disabled) return;
    const set = new Set(weekdays || []);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    props.onWeekdays(Array.from(set).sort((a, b) => a - b));
  };
  return (
    <div className="space-y-2">
      {/* Mode selector */}
      <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/40 w-fit">
        {[
          { key: "monthly", label: "شهري" },
          { key: "weekly", label: "أسبوعي" },
        ].map(m => (
          <button
            key={m.key}
            type="button"
            disabled={disabled}
            onClick={() => props.onMode(m.key as any)}
            className={cn(
              "text-[11px] px-2 py-0.5 rounded transition-colors",
              mode === m.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "monthly" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">يوم الفتح</Label>
            <Input
              type="number" min={1} max={31}
              className="h-8 text-xs"
              disabled={disabled}
              value={openDay ?? ""}
              onChange={e => {
                const n = e.target.value === "" ? null : Math.max(1, Math.min(31, Number(e.target.value)));
                props.onOpenDay(n);
              }}
            />
          </div>
          <div>
            <Label className="text-[10px]">يوم الإغلاق</Label>
            <Input
              type="number" min={1} max={31}
              className="h-8 text-xs"
              disabled={disabled}
              value={closeDay ?? ""}
              onChange={e => {
                const n = e.target.value === "" ? null : Math.max(1, Math.min(31, Number(e.target.value)));
                props.onCloseDay(n);
              }}
            />
          </div>
        </div>
      ) : (
        <div>
          <Label className="text-[10px] mb-1 block">الأيام المفتوحة</Label>
          <div className="flex flex-wrap gap-1">
            {AR_WEEKDAYS.map((name, i) => {
              const active = (weekdays || []).includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted",
                    disabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
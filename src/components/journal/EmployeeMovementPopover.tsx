import { useState } from "react";
import { UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

export type EmployeeMovementCategory =
  | "food_individual"
  | "food_family"
  | "advance"
  | "penalty";

export interface EmployeeMovementValue {
  category: EmployeeMovementCategory | null;
}

const CATEGORIES: { key: EmployeeMovementCategory; label: string; hint: string }[] = [
  { key: "food_individual", label: "أكل فردي", hint: "خصم 50% على الراتب" },
  { key: "food_family", label: "أكل عائلي", hint: "خصم 90% على الراتب" },
  { key: "advance", label: "سلفة", hint: "سلفة على الموظف" },
  { key: "penalty", label: "خصم / جزاء", hint: "خصم عام" },
];

interface Props {
  value: EmployeeMovementValue;
  onChange: (v: EmployeeMovementValue) => void;
  disabled?: boolean;
  className?: string;
  /** اسم الحساب المختار على السطر لعرضه كتلميح فقط. */
  accountName?: string | null;
}

/**
 * أيقونة صغيرة تظهر بجانب مركز التكلفة على سطر القيد.
 * تحدّد نوع حركة الموظف فقط (أكل/سلفة/خصم)، والموظف يُستنتج
 * تلقائياً من حساب الموظف المختار على نفس السطر.
 */
export default function EmployeeMovementPopover({
  value,
  onChange,
  disabled,
  className,
  accountName,
}: Props) {
  const [open, setOpen] = useState(false);
  const active = !!value.category;
  const activeLabel = CATEGORIES.find((c) => c.key === value.category)?.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active ? "default" : "outline"}
          size="icon"
          disabled={disabled}
          dir="rtl"
          title={
            active
              ? `نوع الحركة: ${activeLabel}`
              : "تحديد نوع حركة الموظف (أكل/سلفة/خصم)"
          }
          aria-label="نوع حركة الموظف"
          className={cn("h-8 w-8 shrink-0 relative", className)}
        >
          <UserCog className="h-4 w-4" />
          {active && (
            <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="end" dir="rtl">
        <div className="space-y-3">
          {accountName ? (
            <div className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">الحساب:</span>{" "}
              <span className="truncate">{accountName}</span>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              اختر حساب الموظف على السطر أولاً ليتم الربط تلقائياً.
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">نوع الحركة</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    onChange({ category: c.key });
                    setOpen(false);
                  }}
                  className={cn(
                    "text-[11px] rounded-md border px-2 py-1.5 text-right transition",
                    value.category === c.key
                      ? "border-primary bg-primary/10 font-semibold"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <div>{c.label}</div>
                  <div className="text-[10px] text-muted-foreground">{c.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive"
              onClick={() => {
                onChange({ category: null });
                setOpen(false);
              }}
            >
              مسح التحديد
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
            >
              تم
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
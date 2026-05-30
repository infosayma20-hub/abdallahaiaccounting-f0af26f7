import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedTypeOption<T extends string> {
  key: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

interface SegmentedTypeSelectProps<T extends string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedTypeOption<T>[];
  /** Columns on desktop. Defaults to options.length (max 4). */
  columns?: 2 | 3 | 4;
}

/**
 * Formal radio-card group for "type" selection inside finance modals.
 * No emojis, no colored backgrounds — Lucide icon + label + short description.
 * Selected card uses the system primary border, not a flashy fill.
 */
export function SegmentedTypeSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  columns,
}: SegmentedTypeSelectProps<T>) {
  const cols = columns ?? (Math.min(options.length, 4) as 2 | 3 | 4);
  const colClass =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4";

  return (
    <div>
      {label && (
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          {label}
        </label>
      )}
      <div className={cn("grid gap-2", colClass)}>
        {options.map((opt) => {
          const selected = opt.key === value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={opt.disabled}
              onClick={() => onChange(opt.key)}
              className={cn(
                "relative p-3 text-center rounded-md border transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/40",
                opt.disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {selected && (
                <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 mx-auto mb-1",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                />
              )}
              <p className={cn("text-xs font-semibold", selected ? "text-primary" : "text-foreground")}>
                {opt.label}
              </p>
              {opt.description && (
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {opt.description}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SegmentedTypeSelect;
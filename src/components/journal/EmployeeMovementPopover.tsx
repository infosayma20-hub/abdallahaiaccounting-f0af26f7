import { useEffect, useState } from "react";
import { Plus, UserCog, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export type EmployeeMovementCategory =
  | "food_individual"
  | "food_family"
  | "advance"
  | "penalty"
  | "purchase"
  | "delivery"
  | "other"
  | (string & {});

export interface EmployeeMovementValue {
  category: EmployeeMovementCategory | null;
  /** تسمية اختيارية للعرض عند اختيار «مخصّص/أخرى». */
  custom_label?: string | null;
}

const BASE_CATEGORIES: { key: EmployeeMovementCategory; label: string; hint: string }[] = [
  { key: "food_individual", label: "أكل فردي", hint: "خصم 50% على الراتب" },
  { key: "food_family", label: "أكل عائلي", hint: "خصم 90% على الراتب" },
  { key: "advance", label: "سلفة", hint: "سلفة على الموظف" },
  { key: "penalty", label: "مخالفات / جزاء", hint: "خصم عام" },
  { key: "purchase", label: "مشتريات", hint: "مشتريات على حساب الموظف" },
  { key: "delivery", label: "توصيل", hint: "خصم توصيل" },
  { key: "other", label: "أخرى", hint: "خصم عام أخرى" },
];

const CUSTOM_STORAGE_KEY = "employee_movement_custom_categories_v1";

function readCustom(): { key: string; label: string }[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && x.key && x.label) : [];
  } catch {
    return [];
  }
}

function writeCustom(list: { key: string; label: string }[]) {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

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
 * تحدّد نوع حركة الموظف (أكل/سلفة/مخالفات/مشتريات/توصيل/أخرى)، والموظف يُستنتج
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
  const [customList, setCustomList] = useState<{ key: string; label: string }[]>([]);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (open) setCustomList(readCustom());
  }, [open]);

  const allCategories = [
    ...BASE_CATEGORIES,
    ...customList.map((c) => ({ key: c.key, label: c.label, hint: "مخصّص" })),
  ];

  const active = !!value.category;
  const activeLabel =
    allCategories.find((c) => c.key === value.category)?.label ||
    value.custom_label ||
    (value.category as string | null);

  const addCustom = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = `custom_${Date.now()}`;
    const next = [...customList, { key, label }];
    setCustomList(next);
    writeCustom(next);
    setNewLabel("");
    onChange({ category: key, custom_label: label });
    setOpen(false);
  };

  const removeCustom = (key: string) => {
    const next = customList.filter((c) => c.key !== key);
    setCustomList(next);
    writeCustom(next);
    if (value.category === key) onChange({ category: null });
  };

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
              : "تحديد نوع حركة الموظف"
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
      <PopoverContent className="w-[340px] p-3" align="end" dir="rtl">
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
              {BASE_CATEGORIES.map((c) => (
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
              {customList.map((c) => (
                <div key={c.key} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ category: c.key, custom_label: c.label });
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-[11px] rounded-md border px-2 py-1.5 text-right transition",
                      value.category === c.key
                        ? "border-primary bg-primary/10 font-semibold"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <div className="truncate pl-4">{c.label}</div>
                    <div className="text-[10px] text-muted-foreground">مخصّص</div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustom(c.key);
                    }}
                    className="absolute top-1 left-1 h-4 w-4 rounded-sm text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                    aria-label="حذف"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">إضافة نوع جديد</Label>
            <div className="flex gap-1.5">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="مثال: بنزين، هدايا…"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                onClick={addCustom}
                disabled={!newLabel.trim()}
                aria-label="إضافة"
              >
                <Plus className="h-4 w-4" />
              </Button>
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
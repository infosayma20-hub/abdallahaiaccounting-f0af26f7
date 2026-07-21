import { useEffect, useMemo, useState } from "react";
import { UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export type EmployeeMovementCategory =
  | "food_individual"
  | "food_family"
  | "advance"
  | "penalty";

export interface EmployeeMovementValue {
  employee_id: string | null;
  employee_name?: string | null;
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
}

/**
 * أيقونة صغيرة تظهر بجانب مركز التكلفة على سطر القيد،
 * تسمح بربط السطر بحركة موظف (أكل/سلفة/خصم) لتنعكس على "محفظتي" ومدخلات الراتب.
 */
export default function EmployeeMovementPopover({ value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !ownerId || employees.length) return;
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("user_id", ownerId)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setEmployees(data || []));
  }, [open, ownerId, employees.length]);

  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === value.employee_id) || null,
    [employees, value.employee_id]
  );

  const active = !!(value.employee_id && value.category);

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
              ? `حركة موظف: ${selectedEmp?.full_name || value.employee_name || ""} — ${
                  CATEGORIES.find((c) => c.key === value.category)?.label
                }`
              : "ربط بحركة موظف (أكل/سلفة/خصم)"
          }
          aria-label="ربط بحركة موظف"
          className={cn("h-8 w-8 shrink-0 relative", className)}
        >
          <UserCog className="h-4 w-4" />
          {active && (
            <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="end" dir="rtl">
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">الموظف</Label>
            <Command>
              <CommandInput
                placeholder="ابحث عن موظف..."
                value={search}
                onValueChange={setSearch}
                className="h-8"
              />
              <CommandList className="max-h-40">
                <CommandEmpty>لا نتائج</CommandEmpty>
                <CommandGroup>
                  {employees.map((emp) => (
                    <CommandItem
                      key={emp.id}
                      value={emp.full_name}
                      onSelect={() =>
                        onChange({
                          ...value,
                          employee_id: emp.id,
                          employee_name: emp.full_name,
                        })
                      }
                      className={cn(
                        "text-xs cursor-pointer",
                        value.employee_id === emp.id && "bg-primary/10 font-semibold"
                      )}
                    >
                      {emp.full_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">نوع الحركة</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onChange({ ...value, category: c.key })}
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
                onChange({ employee_id: null, employee_name: null, category: null });
                setOpen(false);
              }}
            >
              مسح الربط
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
              disabled={!value.employee_id || !value.category}
            >
              تم
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
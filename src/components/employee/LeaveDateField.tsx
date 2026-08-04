import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { LeaveBlackout, findBlackout, parseISODate, toISODate } from "@/lib/hr/leaveBlackout";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  blackouts: LeaveBlackout[];
  branchId?: string | null;
  placeholder?: string;
  min?: string;
  className?: string;
};

/**
 * حقل تاريخ لطلب الإجازة — يعطّل الأيام التي حظرتها الموارد البشرية
 * (تظهر مطفيّة وغير قابلة للاختيار).
 */
export function LeaveDateField({ value, onChange, blackouts, branchId, placeholder = "اختر التاريخ", min, className }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISODate(value) : undefined;

  const isDisabled = (d: Date) => {
    const iso = toISODate(d);
    if (min && iso < min) return true;
    return !!findBlackout(iso, blackouts, branchId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between rounded-xl font-normal", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="h-4 w-4 opacity-60" />
          <span dir="ltr">{value || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={d => {
            if (!d) return;
            onChange(toISODate(d));
            setOpen(false);
          }}
          disabled={isDisabled}
          defaultMonth={selected}
          locale={ar}
          dir="rtl"
          className="pointer-events-auto"
        />
        {blackouts.length > 0 && (
          <p className="text-[10px] text-muted-foreground px-3 pb-2 text-center">
            الأيام المطفيّة ممنوع تقديم إجازة عليها
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * SmartDatePicker — thin Arabic-friendly date picker built on shadcn Popover + Calendar.
 * Uses ISO date strings for value (YYYY-MM-DD) so it slots into existing forms.
 */
import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { ar } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SmartDatePickerProps {
  value?: string;                    // ISO yyyy-mm-dd
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  markFirst?: boolean;
  /** Optional label-style date format. Defaults to dd/MM/yyyy. */
  displayFormat?: string;
}

const SmartDatePicker = ({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  className,
  buttonClassName,
  disabled,
  markFirst,
  displayFormat = "dd/MM/yyyy",
}: SmartDatePickerProps) => {
  const date = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            data-smart-first={markFirst ? "true" : undefined}
            data-smart-focusable
            className={cn(
              "w-full justify-between text-right font-normal transition-colors",
              "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/30 focus-visible:bg-primary/[0.04]",
              !date && "text-muted-foreground",
              buttonClassName
            )}
          >
            <span>{date ? format(date, displayFormat, { locale: ar }) : placeholder}</span>
            <CalendarIcon className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (!d) { onChange?.(""); return; }
              onChange?.(format(d, "yyyy-MM-dd"));
            }}
            initialFocus
            locale={ar}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default SmartDatePicker;
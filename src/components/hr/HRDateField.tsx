import * as React from "react";
import DateInputDMY from "@/components/forms/DateInputDMY";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;                   // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  inlineLabel?: boolean;
}

/** HR single date field: visible Arabic label + dd/mm/yyyy input. */
export function HRDateField({
  label, value, onChange, className, inputClassName, disabled, placeholder, inlineLabel,
}: Props) {
  return (
    <div className={cn(inlineLabel ? "flex flex-row items-center gap-1.5 min-w-0" : "flex flex-col gap-1 min-w-0", className)}>
      <label className={cn("text-xs text-muted-foreground", inlineLabel && "shrink-0 whitespace-nowrap leading-none")}>{label}</label>
      <DateInputDMY
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder ?? "يوم/شهر/سنة"}
        className={inputClassName}
      />
    </div>
  );
}

export default HRDateField;
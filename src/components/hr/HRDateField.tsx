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
}

/** HR single date field: visible Arabic label + dd/mm/yyyy input. */
export function HRDateField({
  label, value, onChange, className, inputClassName, disabled, placeholder,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-1 min-w-0", className)}>
      <label className="text-xs text-muted-foreground">{label}</label>
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
/**
 * SmartSelect — wrapper around shadcn Select that applies premium focus visuals
 * to the trigger (the popover content already has its own focus management).
 */
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SmartSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SmartSelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  options: SmartSelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  markFirst?: boolean;
}

const SmartSelect = ({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  className,
  triggerClassName,
  disabled,
  markFirst,
}: SmartSelectProps) => {
  return (
    <div className={cn(className)}>
      <Select value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          data-smart-first={markFirst ? "true" : undefined}
          className={cn(
            "transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/30 focus:bg-primary/[0.04]",
            triggerClassName
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SmartSelect;
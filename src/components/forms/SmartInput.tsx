/**
 * SmartInput — drop-in replacement for shadcn <Input/>.
 * Inherits all premium focus styles globally; adds optional `markFirst`
 * to make this the auto-focus target inside a SmartFormScope.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SmartInputProps extends React.ComponentProps<typeof Input> {
  /** Mark as the preferred first auto-focus target inside a SmartFormScope. */
  markFirst?: boolean;
  /** Disable Enter→next behavior on this specific input (lets default form submit). */
  noEnterNav?: boolean;
}

const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  ({ className, markFirst, noEnterNav, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        data-smart-first={markFirst ? "true" : undefined}
        data-no-enter-nav={noEnterNav ? "true" : undefined}
        className={cn(className)}
        {...props}
      />
    );
  }
);
SmartInput.displayName = "SmartInput";

export default SmartInput;
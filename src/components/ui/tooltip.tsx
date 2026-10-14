import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const ActionLabelContext = React.createContext<React.ReactNode>(null);

// Reuse the existing tooltip text for touch users without adding an action.
function Tooltip({ children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const content = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && child.type === TooltipContent,
  );
  const label = React.isValidElement<{ children?: React.ReactNode }>(content)
    ? content.props.children : null;
  return (
    <ActionLabelContext.Provider value={label}>
      <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
    </ActionLabelContext.Provider>
  );
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ children, asChild, ...props }, ref) => {
  const label = React.useContext(ActionLabelContext);
  const child = React.isValidElement<{ children?: React.ReactNode; size?: string; asChild?: boolean }>(children) ? children : null;
  const labelledChild = asChild && label && child?.props.size === "icon" && !child.props.asChild
    ? React.cloneElement(child, {}, <>{child.props.children}<span className="mobile-action-label hidden">{label}</span></>)
    : children;
  return <TooltipPrimitive.Trigger ref={ref} asChild={asChild} {...props}>{labelledChild}</TooltipPrimitive.Trigger>;
});
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

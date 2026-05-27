import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * SmartTextCell — reusable truncated cell for long text columns.
 *
 * Rules:
 *  - Single line + ellipsis on screen.
 *  - Hover → small tooltip preview (desktop).
 *  - Click → popover with full text, RTL.
 *  - Print → full text expands (no truncation, no popover trigger styling).
 *  - Wrapping <td> must control its own width (table-fixed or max-w).
 */
export interface SmartTextCellProps {
  value?: string | null;
  placeholder?: string;
  className?: string;
  /** popover title (optional) */
  title?: string;
  /** custom render inside popover (e.g. monospace for refs) */
  mono?: boolean;
  /** max width in px applied inline; the parent <td> should also constrain */
  maxWidth?: number;
}

export function SmartTextCell({
  value,
  placeholder = "—",
  className,
  title,
  mono,
  maxWidth,
}: SmartTextCellProps) {
  const [open, setOpen] = useState(false);
  const text = (value ?? "").toString().trim();

  if (!text) {
    return <span className={cn("text-muted-foreground", className)}>{placeholder}</span>;
  }

  const truncated = (
    <span
      className={cn(
        "block w-full text-right truncate cursor-pointer select-none",
        "hover:text-primary transition-colors",
        "print:whitespace-normal print:overflow-visible print:max-w-none print:cursor-auto print:text-foreground",
        mono && "font-mono",
        className,
      )}
      style={maxWidth ? { maxWidth } : undefined}
      dir="rtl"
      title={text}
    >
      {text}
    </span>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <Popover open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
                className="w-full text-right p-0 m-0 bg-transparent border-0 print:pointer-events-none"
              >
                {truncated}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          {/* Hover tooltip — short preview, hidden on touch via Radix defaults */}
          <TooltipContent side="top" className="max-w-[320px] text-xs print:hidden" dir="rtl">
            <span className="line-clamp-3">{text}</span>
          </TooltipContent>
          {/* Click popover — full text */}
          <PopoverContent
            side="bottom"
            align="start"
            className="max-w-[420px] print:hidden"
            dir="rtl"
          >
            {title && (
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{title}</p>
            )}
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground",
                mono && "font-mono text-xs",
              )}
              dir="rtl"
            >
              {text}
            </p>
          </PopoverContent>
        </Popover>
      </Tooltip>
    </TooltipProvider>
  );
}

export default SmartTextCell;
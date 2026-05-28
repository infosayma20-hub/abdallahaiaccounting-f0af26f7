import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Search, ChevronDown, X } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

export interface PickerAccount {
  account_code: string;
  account_name: string;
  account_type?: string;
}

interface Props {
  lineId: string;
  value: string;
  accountName: string;
  accounts: PickerAccount[];
  onSelect: (a: PickerAccount) => void;
  onClear?: () => void;
  /** If true, focusing the trigger opens the dialog automatically (used for new rows). */
  autoOpenOnFocus?: boolean;
  invalid?: boolean;
  /** Selector for the next field to focus after a selection (defaults to debit cell). */
  nextFocusSelector?: string;
}

/**
 * Big, keyboard-first account picker for journal lines.
 * - Opens as a centered popup with autofocused search.
 * - Arrow keys navigate, Enter selects, Esc closes.
 * - After selecting, focus jumps to the row's debit cell.
 */
export default function JournalAccountPicker({
  lineId,
  value,
  accountName,
  accounts,
  onSelect,
  onClear,
  autoOpenOnFocus,
  invalid,
  nextFocusSelector,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Track if open was triggered by focus to avoid immediate re-open after select
  const justClosedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // small cooldown so blur->focus on close doesn't reopen
      justClosedRef.current = true;
      const t = setTimeout(() => { justClosedRef.current = false; }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSelect = (a: PickerAccount) => {
    onSelect(a);
    setOpen(false);
    setTimeout(() => {
      const sel = nextFocusSelector || `[data-journal-debit="${lineId}"]`;
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el) {
        el.focus();
        el.select?.();
      }
    }, 80);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-journal-code={lineId}
        data-smart-focusable
        onClick={() => setOpen(true)}
        onFocus={() => {
          if (autoOpenOnFocus && !justClosedRef.current && !value) {
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          // Any printable key or Enter/Space opens the picker
          if (
            e.key === "Enter" ||
            e.key === " " ||
            (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
          ) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`w-full h-11 px-3 inline-flex items-center justify-between gap-2 rounded-md border text-sm transition-colors text-right ${
          invalid ? "border-destructive ring-1 ring-destructive/30" : "border-input"
        } bg-background hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {value ? (
          <span className="flex items-center gap-2 truncate flex-1 min-w-0">
            <span
              className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0"
              dir="ltr"
            >
              {value}
            </span>
            <span className="text-foreground truncate">{accountName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-2">
            <Search className="h-3.5 w-3.5" /> اختر حساب أو ابحث...
          </span>
        )}
        <span className="inline-flex items-center gap-1 shrink-0">
          {value && onClear && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
              aria-label="تفريغ"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="p-0 max-w-2xl gap-0 overflow-hidden"
          dir="rtl"
          onOpenAutoFocus={(e) => {
            // Let CommandInput receive focus naturally
          }}
        >
          <VisuallyHidden.Root>
            <DialogTitle>اختر حساب</DialogTitle>
          </VisuallyHidden.Root>
          <Command
            shouldFilter
            className="rounded-lg"
            filter={(itemValue, search) => {
              if (!search) return 1;
              const tokens = search.trim().toLowerCase().split(/\s+/);
              const haystack = itemValue.toLowerCase();
              return tokens.every((t) => haystack.includes(t)) ? 1 : 0;
            }}
          >
            <CommandInput
              autoFocus
              placeholder="ابحث برقم الحساب أو الاسم..."
              className="h-12 text-base"
            />
            <CommandList className="max-h-[65vh]">
              <CommandEmpty>لا توجد حسابات مطابقة</CommandEmpty>
              <CommandGroup heading={`الحسابات (${accounts.length})`}>
                {accounts.map((a) => (
                  <CommandItem
                    key={a.account_code}
                    value={`${a.account_code} ${a.account_name}`}
                    onSelect={() => handleSelect(a)}
                    className="cursor-pointer aria-selected:bg-accent"
                  >
                    <span className="flex items-center gap-3 w-full">
                      <span
                        className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0"
                        dir="ltr"
                      >
                        {a.account_code}
                      </span>
                      <span className="text-foreground text-sm flex-1 truncate">
                        {a.account_name}
                      </span>
                      {a.account_type && (
                        <span className="text-[10px] text-muted-foreground shrink-0 uppercase">
                          {a.account_type}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground flex items-center justify-between bg-muted/30">
              <span className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-background border font-mono">↑↓</kbd> تنقل
                <kbd className="px-1.5 py-0.5 rounded bg-background border font-mono">Enter</kbd> اختيار
                <kbd className="px-1.5 py-0.5 rounded bg-background border font-mono">Esc</kbd> إغلاق
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
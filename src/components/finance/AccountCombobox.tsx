import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, PlusCircle, UserPlus, Building2, CheckCircle2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { multiWordMatchAny } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface AccountOption {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_active?: boolean | null;
}

interface AccountComboboxProps {
  accounts: AccountOption[];
  value?: string; // account_code
  onSelect: (acc: AccountOption) => void;
  onAddAccount?: () => void;
  onAddContact?: (type: "customer" | "supplier") => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable account picker:
 * - Renders via Popover Portal so it never gets clipped inside dialogs/modals.
 * - Search by code, account name, or account type.
 * - Sorted by account_code.
 * - Shows code · name · type · postable indicator.
 * - Skips inactive accounts.
 * - Full keyboard navigation (arrows / Enter / Escape) via cmdk.
 * - Debounced search input.
 */
export default function AccountCombobox({
  accounts,
  value,
  onSelect,
  onAddAccount,
  onAddContact,
  placeholder = "ابحث بالكود أو الاسم أو النوع...",
  className,
  disabled,
}: AccountComboboxProps) {
  const [open, setOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<number | null>(null);

  // Debounce search input (~120ms)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setQuery(rawQuery), 120);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [rawQuery]);

  // Active accounts only, sorted by code
  const active = useMemo(
    () =>
      (accounts || [])
        .filter((a) => a.is_active !== false)
        .slice()
        .sort((a, b) => a.account_code.localeCompare(b.account_code, "ar")),
    [accounts]
  );

  // Determine postable: an account is postable when no other account uses it as a parent prefix
  const postableSet = useMemo(() => {
    const codes = active.map((a) => a.account_code);
    const parents = new Set<string>();
    for (const code of codes) {
      for (const other of codes) {
        if (other.length > code.length && other.startsWith(code)) {
          parents.add(code);
          break;
        }
      }
    }
    return new Set(codes.filter((c) => !parents.has(c)));
  }, [active]);

  const filtered = useMemo(() => {
    if (!query.trim()) return active.slice(0, 60);
    return active
      .filter((a) =>
        multiWordMatchAny(
          query,
          a.account_code,
          a.account_name,
          a.account_type || ""
        )
      )
      .slice(0, 60);
  }, [active, query]);

  // Group filtered results by account_type for clearer scanning
  const grouped = useMemo(() => {
    const m = new Map<string, AccountOption[]>();
    filtered.forEach((a) => {
      const k = a.account_type || "أخرى";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    });
    return Array.from(m.entries());
  }, [filtered]);

  const selected = useMemo(
    () => active.find((a) => a.account_code === value),
    [active, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          dir="rtl"
          className={cn(
            "flex items-center gap-1.5 h-9 w-full bg-secondary/50 rounded-lg px-2 cursor-pointer border border-border/40 hover:border-primary/40 transition-colors text-right",
            "focus:outline-none focus:ring-1 focus:ring-primary/40",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
        >
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate text-xs">
            {selected ? (
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">
                  {selected.account_code}
                </span>
                <span className="text-foreground">{selected.account_name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[380px] max-w-[92vw] z-[100]"
        dir="rtl"
        onOpenAutoFocus={(e) => {
          // Let cmdk autofocus the input
          e.preventDefault();
        }}
      >
        <Command shouldFilter={false} dir="rtl">
          <CommandInput
            value={rawQuery}
            onValueChange={setRawQuery}
            placeholder={placeholder}
            className="text-xs"
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">لا توجد حسابات مطابقة</span>
            </CommandEmpty>

            {grouped.map(([type, list]) => (
              <CommandGroup
                key={type}
                heading={type}
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:font-bold"
              >
                {list.map((a) => {
                  const postable = postableSet.has(a.account_code);
                  return (
                    <CommandItem
                      key={a.id || a.account_code}
                      value={`${a.account_code} ${a.account_name} ${a.account_type || ""}`}
                      onSelect={() => {
                        onSelect(a);
                        setOpen(false);
                        setRawQuery("");
                      }}
                      disabled={!postable}
                      className={cn(
                        "flex items-center gap-2 text-xs",
                        !postable && "opacity-60"
                      )}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {a.account_code}
                      </span>
                      <span className="flex-1 truncate text-foreground">{a.account_name}</span>
                      {a.account_type && (
                        <span className="text-[10px] text-muted-foreground/80 shrink-0">
                          {a.account_type}
                        </span>
                      )}
                      {postable ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[9px] text-primary shrink-0"
                          title="قابل للترحيل"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          قابل للترحيل
                        </span>
                      ) : (
                        <span
                          className="text-[9px] text-muted-foreground/70 shrink-0"
                          title="حساب أب — غير قابل للترحيل المباشر"
                        >
                          حساب أب
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}

            {(onAddAccount || onAddContact) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {onAddAccount && (
                    <CommandItem
                      value="__add_account__"
                      onSelect={() => {
                        onAddAccount();
                        setOpen(false);
                      }}
                      className="text-xs text-primary font-medium gap-2"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      إضافة حساب جديد
                    </CommandItem>
                  )}
                  {onAddContact && (
                    <>
                      <CommandItem
                        value="__add_customer__"
                        onSelect={() => {
                          onAddContact("customer");
                          setOpen(false);
                        }}
                        className="text-xs text-primary font-medium gap-2"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        إضافة زبون جديد
                      </CommandItem>
                      <CommandItem
                        value="__add_supplier__"
                        onSelect={() => {
                          onAddContact("supplier");
                          setOpen(false);
                        }}
                        className="text-xs text-primary font-medium gap-2"
                      >
                        <Building2 className="h-3.5 w-3.5" />
                        إضافة مورد جديد
                      </CommandItem>
                    </>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
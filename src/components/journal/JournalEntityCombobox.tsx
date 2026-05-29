import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, BookOpen, User, Building2, Users, UserPlus } from "lucide-react";
import { multiWordMatchAny } from "@/lib/utils";

interface Account {
  account_code: string;
  account_name: string;
  account_type?: string;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  current_balance?: number;
}

type AccountSelection = { kind: "account"; account_code: string; account_name: string };
type ContactSelection = { kind: "contact"; contact: Contact; autoAccountCode: string };

interface Props {
  lineId: string;
  selectedAccountCode?: string;
  selectedAccountName?: string;
  selectedContactId?: string;
  selectedContactName?: string;
  accounts: Account[];
  contacts: Contact[];
  invalid?: boolean;
  onSelect: (sel: AccountSelection | ContactSelection) => void;
  onClear: () => void;
  onQuickAdd?: () => void;
}

const isCustomer = (c: Contact) => ["customer", "عميل", "زبون", "عميل ومورد"].includes(c.contact_type);
const isSupplier = (c: Contact) => ["supplier", "مورد", "عميل ومورد"].includes(c.contact_type);
const isEmployee = (c: Contact) => ["employee", "موظف"].includes(c.contact_type);

const MIN_CHARS = 3;
const MAX_PER_GROUP = 20;

function formatAmount(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function JournalEntityCombobox({
  lineId,
  selectedAccountCode,
  selectedAccountName,
  selectedContactId,
  selectedContactName,
  accounts,
  contacts,
  invalid,
  onSelect,
  onClear,
  onQuickAdd,
}: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasSelection = !!(selectedAccountCode || selectedContactId);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Filter results once we have >= MIN_CHARS
  const { accountResults, customerResults, supplierResults, employeeResults, flatItems } = useMemo(() => {
    const empty = { accountResults: [] as Account[], customerResults: [] as Contact[], supplierResults: [] as Contact[], employeeResults: [] as Contact[], flatItems: [] as Array<AccountSelection | ContactSelection> };
    if (debounced.length < MIN_CHARS) return empty;
    const ar = accounts
      .filter(a => multiWordMatchAny(debounced, a.account_code, a.account_name))
      .slice(0, MAX_PER_GROUP);
    const cust = contacts.filter(c => isCustomer(c) && multiWordMatchAny(debounced, c.contact_name)).slice(0, MAX_PER_GROUP);
    const sup = contacts.filter(c => isSupplier(c) && !isCustomer(c) && multiWordMatchAny(debounced, c.contact_name)).slice(0, MAX_PER_GROUP);
    // Customers list above already includes "عميل ومورد"; suppliers list excludes them to avoid duplicates
    const emp = contacts.filter(c => isEmployee(c) && multiWordMatchAny(debounced, c.contact_name)).slice(0, MAX_PER_GROUP);
    const flat: Array<AccountSelection | ContactSelection> = [
      ...ar.map(a => ({ kind: "account" as const, account_code: a.account_code, account_name: a.account_name })),
      ...cust.map(c => ({ kind: "contact" as const, contact: c, autoAccountCode: "1130" })),
      ...sup.map(c => ({ kind: "contact" as const, contact: c, autoAccountCode: "2110" })),
      ...emp.map(c => ({ kind: "contact" as const, contact: c, autoAccountCode: "2180" })),
    ];
    return { accountResults: ar, customerResults: cust, supplierResults: sup, employeeResults: emp, flatItems: flat };
  }, [debounced, accounts, contacts]);

  // Reset active index on new results
  useEffect(() => { setActiveIndex(0); }, [debounced]);

  // Decide open direction
  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 280 && rect.top > 280);
  }, [open, flatItems.length]);

  // Click outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Scroll active into view
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-jrow="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function commit(item: AccountSelection | ContactSelection) {
    onSelect(item);
    setQuery("");
    setOpen(false);
    // Move focus to debit cell
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-journal-debit="${lineId}"]`)?.focus();
    }, 30);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex(i => Math.min(i + 1, Math.max(0, flatItems.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (open && flatItems[activeIndex]) {
        e.preventDefault();
        commit(flatItems[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && hasSelection) {
      e.preventDefault();
      onClear();
    }
  }

  // Display badge when selection exists
  if (hasSelection) {
    return (
      <div ref={wrapRef} className={`h-11 flex items-center gap-2 px-2 rounded-md border bg-background ${invalid ? "border-destructive/60 ring-1 ring-destructive/40" : "border-input"}`}>
        <div className="flex-1 min-w-0 flex items-center gap-2 truncate">
          {selectedContactId ? (
            <>
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">
                <User className="h-2.5 w-2.5" />
                جهة
              </span>
              <span className="text-sm font-medium truncate">{selectedContactName}</span>
              {selectedAccountCode && (
                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">{selectedAccountCode}</span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 bg-secondary text-foreground px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">
                <BookOpen className="h-2.5 w-2.5" /> حساب
              </span>
              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">{selectedAccountCode}</span>
              <span className="text-sm truncate">{selectedAccountName}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => { onClear(); setTimeout(() => inputRef.current?.focus(), 30); }}
          className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0"
          title="مسح"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const showEmptyState = open && debounced.length >= MIN_CHARS && flatItems.length === 0;
  const showHint = open && debounced.length > 0 && debounced.length < MIN_CHARS;
  const showResults = open && flatItems.length > 0;

  // Build sectional render with running indices to match flatItems
  let runningIndex = -1;
  const renderRow = (label: string, isSelected: boolean, badge: React.ReactNode, onClick: () => void) => {
    runningIndex += 1;
    const idx = runningIndex;
    return (
      <button
        key={`row-${idx}`}
        data-jrow={idx}
        type="button"
        onMouseEnter={() => setActiveIndex(idx)}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 ${idx === activeIndex ? "bg-primary/10" : "hover:bg-secondary/40"}`}
      >
        {badge}
        <span className="truncate flex-1">{label}</span>
      </button>
    );
  };

  return (
    <div ref={wrapRef} className="relative" dir="rtl">
      <div className={`h-11 flex items-center gap-1.5 px-2 rounded-md border bg-background ${invalid ? "border-destructive/60 ring-1 ring-destructive/40" : "border-input focus-within:ring-1 focus-within:ring-ring"}`}>
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          data-journal-code={lineId}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب اسم/رقم الحساب أو الجهة..."
          className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground"
        />
      </div>

      {(showHint || showEmptyState || showResults) && (
        <div
          className={`absolute z-50 left-0 right-0 ${openUp ? "bottom-full mb-1" : "top-full mt-1"} bg-popover border border-border rounded-md shadow-lg overflow-hidden`}
        >
          {showHint && (
            <div className="px-3 py-2 text-xs text-muted-foreground">اكتب {MIN_CHARS} أحرف على الأقل للبحث</div>
          )}
          {showEmptyState && (
            <div className="p-2 space-y-1">
              <div className="px-3 py-2 text-xs text-muted-foreground">لا توجد نتائج</div>
              {onQuickAdd && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onQuickAdd(); setOpen(false); }}
                  className="w-full text-right px-3 py-2 text-sm flex items-center gap-2 text-primary hover:bg-primary/10 rounded"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  إضافة زبون / مورد جديد
                </button>
              )}
            </div>
          )}
          {showResults && (
            <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
              {accountResults.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-secondary/30">
                    <BookOpen className="h-3 w-3" /> الحسابات
                  </div>
                  {accountResults.map(a => renderRow(
                    a.account_name,
                    false,
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{a.account_code}</span>,
                    () => commit({ kind: "account", account_code: a.account_code, account_name: a.account_name }),
                  ))}
                </>
              )}
              {customerResults.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-secondary/30">
                    <User className="h-3 w-3" /> زبائن
                  </div>
                  {customerResults.map(c => renderRow(
                    c.contact_name,
                    false,
                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">زبون</span>,
                    () => commit({ kind: "contact", contact: c, autoAccountCode: "1130" }),
                  ))}
                </>
              )}
              {supplierResults.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-secondary/30">
                    <Building2 className="h-3 w-3" /> موردين
                  </div>
                  {supplierResults.map(c => renderRow(
                    c.contact_name,
                    false,
                    <span className="inline-flex items-center gap-1 bg-orange-500/10 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">مورد</span>,
                    () => commit({ kind: "contact", contact: c, autoAccountCode: "2110" }),
                  ))}
                </>
              )}
              {employeeResults.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-secondary/30">
                    <Users className="h-3 w-3" /> موظفين
                  </div>
                  {employeeResults.map(c => renderRow(
                    c.contact_name,
                    false,
                    <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">موظف</span>,
                    () => commit({ kind: "contact", contact: c, autoAccountCode: "2180" }),
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

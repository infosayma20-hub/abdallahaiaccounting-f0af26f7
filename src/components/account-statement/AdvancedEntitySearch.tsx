import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X, Users, UserCheck, LayoutGrid } from "lucide-react";
import { cn, multiWordMatchAny } from "@/lib/utils";

type EntityTab = "contacts" | "employees" | "accounts";
type EntitySubType = "customers" | "suppliers" | "employees" | "accounts";

interface SearchEntity {
  id: string;
  name: string;
  subtitle?: string;
  balance: number;
  accountCode?: string;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone: string | null;
  linked_account_code: string | null;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface Employee {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  account_code: string | null;
}

interface Props {
  entityList: SearchEntity[];
  allContacts: Contact[];
  allAccounts: Account[];
  allEmployees: Employee[];
  accountBalances: Record<string, number>;
  contactBalances: Record<string, number>;
  employeeBalances: Record<string, number>;
  accountTxCounts?: Record<string, number>;
  contactTxCounts?: Record<string, number>;
  employeeTxCounts?: Record<string, number>;
  selectedEntityId: string;
  activeTab: string;
  onSelect: (id: string, tab?: string) => void;
  onClear: () => void;
  onTabFilter: (tab: string) => void;
  loading: boolean;
}

const fmtBal = (n: number, txCount: number) => {
  if (n === 0) {
    return txCount > 0 ? "✓ مسدّد" : "لا توجد حركات";
  }
  const symbol = "₪";
  return `${symbol}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const balColor = (n: number, txCount: number) => {
  if (n === 0) return txCount > 0 ? "text-emerald-600" : "text-muted-foreground";
  return n > 0 ? "text-emerald-600" : "text-red-600";
};

const balLabel = (n: number) => {
  if (n === 0) return "";
  return n > 0 ? "مدين" : "دائن";
};


export default function AdvancedEntitySearch({
  allContacts, allAccounts, allEmployees,
  accountBalances, contactBalances, employeeBalances,
  accountTxCounts = {}, contactTxCounts = {}, employeeTxCounts = {},
  selectedEntityId, activeTab, onSelect, onClear, onTabFilter, loading,
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Map legacy tabs
  const normalizedTab: EntityTab = (activeTab === "customers" || activeTab === "suppliers") ? "contacts" : activeTab as EntityTab;

  // Auto-focus on mount
  useEffect(() => {
    if (!selectedEntityId) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build grouped results
  const groupedResults = useMemo(() => {
    const q = search.trim();
    if (!q) return [];

    const groups: { key: string; label: string; emoji: string; items: { id: string; name: string; code: string; balance: number; txCount: number; tab: EntitySubType }[] }[] = [];

    // Accounts
    const accs = allAccounts.filter(a => multiWordMatchAny(q, a.account_name, a.account_code));
    if (accs.length > 0) {
      groups.push({
        key: "accounts", label: "الحسابات", emoji: "📊",
        items: accs.slice(0, 10).map(a => ({
          id: a.id, name: a.account_name, code: a.account_code,
          balance: accountBalances[a.id] || 0, txCount: accountTxCounts[a.id] || 0, tab: "accounts",
        })),
      });
    }

    // Hybrid type sets — include dual customer/supplier classifications
    const CUSTOMER_TYPES = new Set(["عميل", "عميل ومورد"]);
    const SUPPLIER_TYPES = new Set(["مورد", "عميل ومورد"]);

    // Customers (includes hybrid "زبون ومورد")
    const custs = allContacts.filter(c => CUSTOMER_TYPES.has(c.contact_type) && multiWordMatchAny(q, c.contact_name, c.phone));
    if (custs.length > 0) {
      groups.push({
        key: "customers", label: "الزبائن", emoji: "👤",
        items: custs.slice(0, 10).map(c => ({
          id: c.id, name: c.contact_name, code: c.linked_account_code || "",
          balance: contactBalances[c.id] || 0, txCount: contactTxCounts[c.id] || 0, tab: "customers",
        })),
      });
    }

    // Suppliers (includes hybrid "زبون ومورد")
    const sups = allContacts.filter(c => SUPPLIER_TYPES.has(c.contact_type) && multiWordMatchAny(q, c.contact_name, c.phone));
    if (sups.length > 0) {
      groups.push({
        key: "suppliers", label: "الموردين", emoji: "🚚",
        items: sups.slice(0, 10).map(c => ({
          id: c.id, name: c.contact_name, code: c.linked_account_code || "",
          balance: contactBalances[c.id] || 0, txCount: contactTxCounts[c.id] || 0, tab: "suppliers",
        })),
      });
    }

    // Employees
    const emps = allEmployees.filter(e => multiWordMatchAny(q, e.full_name, e.department));
    if (emps.length > 0) {
      groups.push({
        key: "employees", label: "الموظفين", emoji: "👨‍💼",
        items: emps.slice(0, 8).map(e => ({
          id: e.id, name: e.full_name, code: e.account_code || "",
          balance: employeeBalances[e.id] || 0, txCount: employeeTxCounts[e.id] || 0, tab: "employees",
        })),
      });
    }

    return groups;
  }, [search, normalizedTab, allAccounts, allContacts, allEmployees, accountBalances, contactBalances, employeeBalances, accountTxCounts, contactTxCounts, employeeTxCounts]);

  const flatResults = useMemo(() => groupedResults.flatMap(g => g.items), [groupedResults]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, flatResults.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    }
    if (e.key === "Enter" && highlightIdx >= 0 && highlightIdx < flatResults.length) {
      e.preventDefault();
      const item = flatResults[highlightIdx];
      onSelect(item.id, item.tab);
      setOpen(false);
      setSearch("");
    }
  }, [flatResults, highlightIdx, onSelect]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  // Selected entity info
  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    const acc = allAccounts.find(a => a.id === selectedEntityId);
    if (acc) return { name: acc.account_name, code: acc.account_code, emoji: "📊" };
    const con = allContacts.find(c => c.id === selectedEntityId);
    if (con) return { name: con.contact_name, code: con.linked_account_code || "", emoji: con.contact_type === "عميل" ? "👤" : "🚚" };
    const emp = allEmployees.find(e => e.id === selectedEntityId);
    if (emp) return { name: emp.full_name, code: emp.account_code || "", emoji: "👨‍💼" };
    return null;
  }, [selectedEntityId, allAccounts, allContacts, allEmployees]);

  // If entity is selected, show selected state
  if (selectedEntity) {
    return (
      <div
        className="flex items-center justify-between rounded-xl px-5 py-3 border-2 transition-all"
        style={{ background: "#EEF2FF", borderColor: "#0D1B2E" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{selectedEntity.emoji}</span>
          <span className="font-bold text-foreground text-base">{selectedEntity.name}</span>
          {selectedEntity.code && (
            <span className="text-sm text-muted-foreground">— {selectedEntity.code}</span>
          )}
        </div>
        <button
          onClick={() => { onClear(); setTimeout(() => inputRef.current?.focus(), 100); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-1.5 rounded-lg hover:bg-destructive/10"
        >
          <X className="w-3.5 h-3.5" />
          تغيير
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">

      {/* Search input */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl px-5 py-3.5 border-2 bg-card transition-all",
          open ? "border-[#1B3A5C] shadow-lg" : "border-[#0D1B2E] shadow-md"
        )}
        style={{
          boxShadow: open ? "0 4px 24px rgba(13,27,46,0.18)" : "0 4px 16px rgba(13,27,46,0.10)",
        }}
      >
        <Search className="w-5 h-5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); setHighlightIdx(-1); }}
          onFocus={() => { if (search.trim()) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="ابحث عن حساب، زبون، مورد، موظف..."
          className="flex-1 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Dropdown results */}
      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-b-xl shadow-xl max-h-[400px] overflow-y-auto"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.10)", marginTop: -2 }}
        >
          {loading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">جاري التحميل...</div>
          ) : groupedResults.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد نتائج للبحث</div>
          ) : (
            (() => {
              let idx = 0;
              return groupedResults.map(group => (
                <div key={group.key}>
                  {/* Group header */}
                  <div className="px-5 py-2 text-[11px] font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                    {group.emoji} {group.label}
                  </div>
                  {group.items.map(item => {
                    const currentIdx = idx++;
                    const isHighlighted = currentIdx === highlightIdx;
                    return (
                      <button
                        key={item.id}
                        data-idx={currentIdx}
                        onClick={() => { onSelect(item.id, item.tab); setOpen(false); setSearch(""); }}
                        className={cn(
                          "w-full flex items-center justify-between px-5 py-2.5 text-right transition-colors border-b border-border/20 last:border-0",
                          isHighlighted ? "bg-primary/5" : "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                          {item.code && (
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">{item.code}</span>
                          )}
                        </div>
                        <span className={cn(
                          "text-xs font-bold tabular-nums shrink-0 mr-3",
                          balColor(item.balance, item.txCount)
                        )}>
                          {fmtBal(item.balance, item.txCount)}
                          {item.balance !== 0 && (
                            <span className="text-[10px] font-normal text-muted-foreground mr-1">{balLabel(item.balance)}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
      )}
    </div>
  );
}

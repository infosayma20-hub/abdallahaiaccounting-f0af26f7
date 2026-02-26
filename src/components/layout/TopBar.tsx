import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Bell, Settings, HelpCircle, LogOut, User, Menu, Sun, Moon, FileText, Wallet, Users, X, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
  onOpenHelpGuide?: () => void;
}

/* ═══ Reusable Icon Button ═══ */
const IconButton = ({
  icon: Icon, badge, onClick, title, className,
}: {
  icon: React.ElementType; badge?: boolean; onClick?: () => void; title?: string; className?: string;
}) => (
  <button
    onClick={onClick}
    title={title}
    className={cn(
      "relative w-9 h-9 rounded-lg flex items-center justify-center",
      "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      "transition-all duration-200 cursor-pointer hover:scale-105",
      className
    )}
  >
    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
    {badge && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />}
  </button>
);

/* ═══ Search Result Types ═══ */
interface SearchResult {
  id: string;
  type: "transaction" | "account" | "contact";
  title: string;
  subtitle: string;
  path?: string;
  icon: React.ElementType;
}

/* ═══ Global Search Bar ═══ */
const GlobalSearchBar = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [cachedTx, setCachedTx] = useState<any[]>([]);
  const [cachedAccounts, setCachedAccounts] = useState<any[]>([]);
  const [cachedContacts, setCachedContacts] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load data once on first focus
  const loadData = useCallback(async () => {
    if (dataLoaded || !user) return;
    setLoading(true);
    try {
      const [txRes, accRes, contactsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
      ]);
      const [txData, accData, contactsData] = await Promise.all([
        txRes.ok ? txRes.json() : { records: [] },
        accRes.ok ? accRes.json() : { records: [] },
        contactsRes.ok ? contactsRes.json() : { records: [] },
      ]);
      setCachedTx(txData?.records || []);
      setCachedAccounts(accData?.records || []);
      setCachedContacts(contactsData?.records || []);
      setDataLoaded(true);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [user, dataLoaded]);

  // Search locally
  useEffect(() => {
    if (!query.trim() || !dataLoaded) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase().trim();
    const found: SearchResult[] = [];

    // Search transactions
    for (const tx of cachedTx) {
      if (found.length >= 20) break;
      const f = tx.fields || {};
      if (f.Deleted) continue;
      const searchable = [
        f.Description || "",
        f["Debit Account Name"] || "",
        f["Credit Account Name"] || "",
        f["Transaction Type"] || "",
        f.Reference || "",
        f.Date || "",
        String(f.Amount || ""),
      ].join(" ").toLowerCase();

      if (searchable.includes(q)) {
        found.push({
          id: tx.id,
          type: "transaction",
          title: f.Description || f["Transaction Type"] || "معاملة",
          subtitle: `${f.Date || ""} • ₪${(f.Amount || 0).toLocaleString()} • ${f["Transaction Type"] || ""}`,
          path: "/transactions",
          icon: FileText,
        });
      }
    }

    // Search accounts
    for (const acc of cachedAccounts) {
      if (found.length >= 25) break;
      const name = acc.fields?.["Account Name"] || "";
      const type = acc.fields?.["Account Type"] || "";
      if (name.toLowerCase().includes(q) || type.toLowerCase().includes(q)) {
        found.push({
          id: acc.id,
          type: "account",
          title: name,
          subtitle: type,
          path: "/accounts",
          icon: Wallet,
        });
      }
    }

    // Search contacts
    for (const c of cachedContacts) {
      if (found.length >= 30) break;
      const name = c.fields?.["Contact Name"] || c.fields?.["Name"] || "";
      const type = c.fields?.["Type"] || "";
      const phone = c.fields?.["Phone"] || "";
      const searchable = [name, type, phone].join(" ").toLowerCase();
      if (searchable.includes(q)) {
        found.push({
          id: c.id,
          type: "contact",
          title: name,
          subtitle: type === "Supplier" ? "مورد" : type === "Customer" ? "زبون" : type,
          path: "/contacts",
          icon: Users,
        });
      }
    }

    setResults(found);
  }, [query, dataLoaded, cachedTx, cachedAccounts, cachedContacts]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFocus = () => {
    setShowResults(true);
    loadData();
  };

  const handleSelect = (result: SearchResult) => {
    setShowResults(false);
    setQuery("");
    if (result.path) navigate(result.path);
  };

  if (collapsed) {
    return <IconButton icon={Search} onClick={onToggle} title="بحث" />;
  }

  const typeLabel: Record<string, string> = {
    transaction: "معاملات",
    account: "حسابات",
    contact: "جهات اتصال",
  };

  const typeColor: Record<string, string> = {
    transaction: "bg-primary/10 text-primary",
    account: "bg-warning/10 text-warning",
    contact: "bg-accent text-accent-foreground",
  };

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className="relative w-full max-w-[560px]">
      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none z-10" strokeWidth={2} />
      {loading && <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin z-10" />}
      {query && !loading && (
        <button
          onClick={() => { setQuery(""); setResults([]); }}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        placeholder="ابحث عن معاملة، عميل، مورد، حساب..."
        className={cn(
          "w-full h-10 pr-10 pl-10 rounded-full",
          "bg-muted/60 border border-transparent",
          "text-sm text-foreground placeholder:text-muted-foreground/50",
          "focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 focus:bg-background",
          "hover:bg-muted/80",
          "transition-all duration-200"
        )}
      />

      {/* Results Dropdown */}
      {showResults && query.trim().length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-card border border-border/60 rounded-xl shadow-xl z-50 max-h-[420px] overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="py-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد نتائج لـ "{query}"</p>
            </div>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-2 flex items-center gap-2 sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border/30">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${typeColor[type] || ""}`}>
                    {typeLabel[type] || type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{items.length} نتيجة</span>
                </div>
                {items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-right"
                  >
                    <div className={`p-1.5 rounded-lg ${typeColor[r.type] || "bg-muted"}`}>
                      <r.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/* ═══ Profile Dropdown ═══ */
const ProfileDropdown = ({
  displayName, email, initials, onNavigate, onSignOut,
}: {
  displayName: string; email: string; initials: string; onNavigate: (path: string) => void; onSignOut: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={cn(
        "flex items-center gap-2 h-9 px-2.5 rounded-full",
        "bg-muted/50 hover:bg-muted",
        "transition-all duration-200 cursor-pointer",
        "border border-transparent hover:border-border/50"
      )}>
        <span className="text-[13px] font-medium text-foreground hidden md:block max-w-[140px] truncate">{displayName}</span>
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-bold text-white leading-none">{initials}</span>
        </div>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56 rounded-xl shadow-lg z-50">
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">{displayName}</p>
        <p className="text-xs text-muted-foreground">{email}</p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onNavigate("/profile")} className="gap-2.5 cursor-pointer rounded-lg mx-1">
        <User className="h-4 w-4" strokeWidth={1.8} />
        الملف الشخصي
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onNavigate("/settings")} className="gap-2.5 cursor-pointer rounded-lg mx-1">
        <Settings className="h-4 w-4" strokeWidth={1.8} />
        الإعدادات
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onSignOut} className="gap-2.5 cursor-pointer text-destructive rounded-lg mx-1">
        <LogOut className="h-4 w-4" strokeWidth={1.8} />
        تسجيل الخروج
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

/* ═══ Logo ═══ */
const AppLogo = () => (
  <div className="flex items-center gap-2.5 flex-shrink-0 cursor-default select-none">
    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.2)" />
      </svg>
    </div>
    <span className="text-lg font-semibold text-foreground hidden sm:block whitespace-nowrap">عبدالله AI للمحاسبة</span>
  </div>
);

/* ═══ MAIN HEADER ═══ */
const TopBar = ({ onMenuClick, sidebarCollapsed, onOpenHelpGuide }: TopBarProps) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("display_name, company_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfileName(data?.display_name || data?.company_name || null);
      });
  }, [user?.id]);

  const displayName = profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "المستخدم";
  const initials = displayName.split(" ").slice(0, 2).map((w: string) => w[0]).join("");

  return (
    <header className="sticky top-0 z-40 bg-background border-b border-border/40" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
      <div className="h-16 flex items-center gap-4 px-4 sm:px-6">
        <button onClick={onMenuClick} className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors">
          <Menu className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
        </button>

        <AppLogo />

        {/* Center: Search */}
        <div className="flex-1 flex justify-center px-4">
          <div className="hidden md:block w-full max-w-[560px]">
            <GlobalSearchBar collapsed={false} onToggle={() => {}} />
          </div>
          <div className="md:hidden">
            {mobileSearchOpen ? (
              <GlobalSearchBar collapsed={false} onToggle={() => setMobileSearchOpen(false)} />
            ) : (
              <IconButton icon={Search} onClick={() => setMobileSearchOpen(true)} title="بحث" />
            )}
          </div>
        </div>

        {/* Left icons */}
        <div className="flex items-center gap-1">
          <IconButton icon={theme === "dark" ? Moon : Sun} onClick={toggleTheme} title={theme === "dark" ? "وضع فاتح" : "وضع داكن"} />
          <IconButton icon={Bell} badge title="الإشعارات" />
          <IconButton icon={Settings} onClick={() => navigate("/settings")} title="الإعدادات" className="hidden sm:flex" />
          <IconButton icon={HelpCircle} onClick={onOpenHelpGuide} title="دليل الاستخدام" className="hidden sm:flex" />
          <div className="w-px h-6 bg-border/60 mx-1.5 hidden sm:block" />
          <ProfileDropdown displayName={displayName} email={user?.email || ""} initials={initials} onNavigate={navigate} onSignOut={signOut} />
        </div>
      </div>
    </header>
  );
};

export default TopBar;

import { useState, useEffect, useRef } from "react";
import { Search, Bell, Settings, LogOut, User, Menu, Sun, Moon, FileText, Wallet, Users, X, Keyboard, Zap, Landmark, ClipboardList, Store, BarChart3, Banknote, Package, BookOpen, CreditCard, TrendingUp, Calculator, Receipt, ShoppingCart, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompanyContext";
import { NotificationsPanel, useNotifications } from "@/components/NotificationsPanel";
import { FinixLogo } from "@/components/ui/FinixLogo";
import { useLockedModules } from "@/hooks/useLockedModules";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import ShortcutsTip from "./ShortcutsTip";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import QuickCalculator from "./QuickCalculator";

interface TopBarProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
  onOpenHelpGuide?: () => void;
}

const IconButton = ({
  icon: Icon, badge, onClick, title, className,
}: {
  icon: React.ElementType; badge?: boolean; onClick?: () => void; title?: string; className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        className={cn(
          "relative flex items-center justify-center",
          "transition-all duration-150 cursor-pointer",
          className
        )}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} style={{ color: "rgba(255,255,255,0.6)" }} />
        {badge && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" style={{ boxShadow: "0 0 0 2px #0D1B2E" }} />}
      </button>
    </TooltipTrigger>
    {title && <TooltipContent side="bottom"><p>{title}</p></TooltipContent>}
  </Tooltip>
);

interface SearchResult {
  id: string;
  type: "transaction" | "account" | "contact";
  title: string;
  subtitle: string;
  path?: string;
  icon: React.ElementType;
}

const GlobalSearchBar = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim() || !user) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();
      const found: SearchResult[] = [];
      try {
        const [txRes, accRes, contactsRes] = await Promise.all([
          supabase.from('transactions').select('id, description, transaction_date, amount, transaction_type, reference, debit_account_code, credit_account_code').eq('user_id', user.id).or(`description.ilike.%${q}%,reference.ilike.%${q}%,transaction_type.ilike.%${q}%`).order('transaction_date', { ascending: false }).limit(8),
          supabase.from('accounts').select('id, account_name, account_code, account_type').eq('user_id', user.id).or(`account_name.ilike.%${q}%,account_code.ilike.%${q}%,account_type.ilike.%${q}%`).limit(8),
          supabase.from('contacts').select('id, contact_name, contact_type, phone').eq('user_id', user.id).or(`contact_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8),
        ]);
        (txRes.data || []).forEach(tx => { found.push({ id: tx.id, type: "transaction", title: tx.description || tx.transaction_type || "معاملة", subtitle: `${tx.transaction_date || ""} • ₪${(tx.amount || 0).toLocaleString()} • ${tx.transaction_type || ""}`, path: `/transactions?search=${encodeURIComponent(tx.description || tx.reference || "")}`, icon: FileText }); });
        (accRes.data || []).forEach(acc => { found.push({ id: acc.id, type: "account", title: `${acc.account_code} - ${acc.account_name}`, subtitle: acc.account_type, path: `/accounts?search=${encodeURIComponent(acc.account_name)}`, icon: Wallet }); });
        (contactsRes.data || []).forEach(c => { found.push({ id: c.id, type: "contact", title: c.contact_name, subtitle: c.contact_type || "", path: `/contacts?search=${encodeURIComponent(c.contact_name)}`, icon: Users }); });
      } catch { /* silent */ }
      setResults(found);
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowResults(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (result: SearchResult) => { setShowResults(false); setQuery(""); if (result.path) navigate(result.path); };

  if (collapsed) return <IconButton icon={Search} onClick={onToggle} title="بحث" />;

  const typeLabel: Record<string, string> = { transaction: "معاملات", account: "حسابات", contact: "جهات اتصال" };
  const typeColor: Record<string, string> = { transaction: "bg-accent/10 text-accent", account: "bg-warning/10 text-warning", contact: "bg-primary/10 text-primary" };
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => { (acc[r.type] = acc[r.type] || []).push(r); return acc; }, {});

  return (
    <div ref={containerRef} className="relative w-full max-w-[340px]">
      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none z-10" strokeWidth={2} style={{ color: "rgba(255,255,255,0.4)" }} />
      {loading && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10"><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /></div>}
      {query && !loading && <button onClick={() => { setQuery(""); setResults([]); }} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 hover:text-white" style={{ color: "rgba(255,255,255,0.5)" }}><X className="h-4 w-4" /></button>}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setShowResults(true)}
        placeholder="ابحث عن معاملة، عميل..."
        style={{
          width: "100%",
          height: 36,
          paddingRight: 40,
          paddingLeft: 40,
          borderRadius: 8,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff",
          fontSize: 13,
          outline: "none",
        }}
        onFocusCapture={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
        onBlurCapture={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
      />
      {showResults && query.trim().length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-elevated z-50 max-h-[420px] overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="py-8 text-center"><Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">لا توجد نتائج لـ "{query}"</p></div>
          ) : loading && results.length === 0 ? (
            <div className="py-8 text-center"><div className="h-6 w-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin mx-auto mb-2" /><p className="text-sm text-muted-foreground">جارٍ البحث...</p></div>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-2 flex items-center gap-2 sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border/30">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${typeColor[type] || ""}`}>{typeLabel[type] || type}</span>
                  <span className="text-[10px] text-muted-foreground">{items.length} نتيجة</span>
                </div>
                {items.map((r) => (
                  <button key={r.id} onClick={() => handleSelect(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors text-right">
                    <div className={`p-1.5 rounded-lg ${typeColor[r.type] || "bg-secondary"}`}><r.icon className="h-3.5 w-3.5" /></div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{r.title}</p><p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p></div>
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

const ProfileDropdown = ({
  displayName, email, initials, avatarUrl, onNavigate, onSignOut,
}: {
  displayName: string; email: string; initials: string; avatarUrl: string | null; onNavigate: (path: string) => void; onSignOut: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button aria-label="الملف الشخصي" className="flex items-center gap-2 h-9 px-1.5 sm:px-2.5 rounded-lg transition-all duration-150 cursor-pointer flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
      >
        <span className="text-[13px] font-medium hidden md:block max-w-[140px] truncate" style={{ color: "rgba(255,255,255,0.9)" }}>{displayName}</span>
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover flex-shrink-0 border-2 border-white/20" />
        ) : (
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>
            <span className="text-[11px] font-bold text-white leading-none">{initials}</span>
          </div>
        )}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="w-[min(14rem,calc(100vw-1.5rem))] rounded-xl shadow-elevated z-[80]">
      <div className="px-3 py-2.5"><p className="text-sm font-semibold text-foreground">{displayName}</p><p className="text-xs text-muted-foreground">{email}</p></div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onNavigate("/profile")} className="gap-2.5 cursor-pointer rounded-lg mx-1"><User className="h-4 w-4" strokeWidth={1.8} />الملف الشخصي</DropdownMenuItem>
      <DropdownMenuItem onClick={() => onNavigate("/settings")} className="gap-2.5 cursor-pointer rounded-lg mx-1"><Settings className="h-4 w-4" strokeWidth={1.8} />الإعدادات</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onSignOut} className="gap-2.5 cursor-pointer text-destructive rounded-lg mx-1"><LogOut className="h-4 w-4" strokeWidth={1.8} />تسجيل الخروج</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const QUICK_ITEMS = [
  { label: "فاتورة جديدة", icon: FileText, shortcut: "Alt+I", path: "/invoices/new" },
  { label: "سند قبض", icon: Landmark, shortcut: "Alt+R", path: "/finance/receipt/new" },
  { label: "سند صرف", icon: Wallet, shortcut: "Alt+E", path: "/finance/payment/new" },
  { label: "سند قيد", icon: ClipboardList, shortcut: "Alt+J", path: "/finance/journal/new" },
  { label: "زبائن", icon: Users, shortcut: "Alt+C", path: "/contacts?type=customer" },
  { label: "موردين", icon: Store, shortcut: "Alt+M", path: "/contacts?type=supplier" },
  { label: "كشف حساب", icon: BarChart3, shortcut: "Alt+K", path: "/account-statement" },
  { label: "صناديق", icon: Banknote, shortcut: "Alt+S", path: "/finance/cash-boxes" },
  { label: "المخزون", icon: Package, shortcut: "Alt+I", path: "/inventory" },
  { label: "الشيكات", icon: CreditCard, shortcut: "Alt+Q", path: "/finance/cheques" },
  { label: "نقطة البيع", icon: ShoppingCart, shortcut: "Alt+P", path: "/pos" },
  { label: "ميزان المراجعة", icon: TrendingUp, shortcut: "Alt+T", path: "/trial-balance" },
];

const QuickAccessButton = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isRouteLocked, getLockedModuleName } = useLockedModules();

  const handleNavigate = (path: string) => {
    if (isRouteLocked(path)) {
      toast({ title: "🔒 موديل مقفل", description: `${getLockedModuleName(path)} غير متاح في حسابك الحالي`, variant: "destructive" });
      setOpen(false);
      return;
    }
    navigate(path);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center justify-center transition-all duration-150 flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: open ? "rgba(74,158,232,0.25)" : "rgba(74,158,232,0.15)",
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(74,158,232,0.25)"; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "rgba(74,158,232,0.15)"; }}
        >
          <Zap className="h-[18px] w-[18px]" strokeWidth={1.8} style={{ color: "#4A9EE8" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        dir="rtl"
        className="p-0"
        style={{
          width: 480,
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          padding: 16,
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1B3A5C", marginBottom: 12 }}>
          ⚡ وصول سريع
        </p>
        <div className="grid grid-cols-2 gap-1">
          {QUICK_ITEMS.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className="flex items-center gap-2.5 text-right transition-colors group"
              style={{ padding: "10px 12px", borderRadius: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F8F9FA"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <item.icon className="flex-shrink-0" style={{ width: 18, height: 18, color: "#1B3A5C" }} strokeWidth={1.6} />
              <span className="flex-1 whitespace-nowrap" style={{ fontSize: 13, fontWeight: 500, color: "#1B3A5C" }}>{item.label}</span>
              {item.shortcut && (
                <kbd style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  background: "#F3F4F6",
                  color: "#6B7280",
                  borderRadius: 4,
                  padding: "2px 6px",
                }} className="flex-shrink-0">{item.shortcut}</kbd>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const AppLogo = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/apps")}
      className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-secondary/60 transition-all duration-150 flex-shrink-0 cursor-pointer"
    >
      <img src="/logos/amwali-mark-white-bg.png" alt="أموالي" className="w-11 h-11 object-contain" />
    </button>
  );
};

const TopBar = ({ onMenuClick, sidebarCollapsed, onOpenHelpGuide }: TopBarProps) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutsTipOpen, setShortcutsTipOpen] = useState(false);
  const { unreadCount } = useNotifications();

  useGlobalShortcuts({
    onShowShortcuts: () => setShortcutsOpen(true),
  });

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("display_name, company_name, avatar_url").eq("user_id", user.id).maybeSingle().then(({ data }: any) => {
      setProfileName(data?.display_name || data?.company_name || null);
      setUserAvatarUrl(data?.avatar_url || null);
    });
  }, [user?.id]);

  const displayName = profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "المستخدم";
  const initials = displayName.split(" ").slice(0, 2).map((w: string) => w[0]).join("");

  return (
    <header className="sticky top-0 z-50" style={{ height: 52, background: "#0D1B2E", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="h-full flex items-center gap-2 sm:gap-4 px-2 sm:px-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onMenuClick} className="lg:hidden flex items-center justify-center transition-colors" style={{ width: 36, height: 36, borderRadius: 8 }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Menu className="h-5 w-5" strokeWidth={1.8} style={{ color: "rgba(255,255,255,0.6)" }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>القائمة</p></TooltipContent>
        </Tooltip>
        <AppLogo />
        <div className="hidden sm:block"><QuickAccessButton /></div>
        <div className="flex-1 flex justify-center px-1 sm:px-4 min-w-0">
          <div className="hidden md:block w-full max-w-[560px]"><GlobalSearchBar collapsed={false} onToggle={() => {}} /></div>
          <div className="md:hidden">
            {mobileSearchOpen ? <GlobalSearchBar collapsed={false} onToggle={() => setMobileSearchOpen(false)} /> : <IconButton icon={Search} onClick={() => setMobileSearchOpen(true)} title="بحث" />}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:block"><QuickCalculator /></div>
          <div className="relative hidden sm:block">
            <IconButton icon={Keyboard} onClick={() => setShortcutsOpen(true)} title="اختصارات لوحة المفاتيح (Ctrl+/)" />
            <ShortcutsTip visible={shortcutsTipOpen} onClose={() => setShortcutsTipOpen(false)} onShowShortcuts={() => { setShortcutsTipOpen(false); setShortcutsOpen(true); }} />
          </div>
          <IconButton icon={theme === "dark" ? Moon : Sun} onClick={toggleTheme} title={theme === "dark" ? "وضع فاتح" : "وضع داكن"} className="hidden sm:flex" />
          <div className="relative">
            <IconButton icon={Bell} badge={unreadCount > 0} onClick={() => setNotificationsOpen(!notificationsOpen)} title="الإشعارات" />
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center px-1 pointer-events-none">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
          </div>
          <IconButton icon={Settings} onClick={() => navigate("/settings")} title="الإعدادات" className="hidden sm:flex" />
          <div className="w-px h-5 mx-1.5 hidden sm:block" style={{ background: "rgba(255,255,255,0.15)" }} />
          <ProfileDropdown displayName={displayName} email={user?.email || ""} initials={initials} avatarUrl={userAvatarUrl} onNavigate={navigate} onSignOut={signOut} />
        </div>
      </div>
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </header>
  );
};

export default TopBar;

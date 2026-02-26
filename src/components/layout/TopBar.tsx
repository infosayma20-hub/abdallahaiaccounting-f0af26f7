import { useState, useEffect, useRef } from "react";
import { Search, Bell, Settings, HelpCircle, ChevronDown, LogOut, User, Menu, Sun, Moon } from "lucide-react";
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
}

/* ═══ Reusable Icon Button ═══ */
const IconButton = ({
  icon: Icon,
  badge,
  onClick,
  title,
  className,
}: {
  icon: React.ElementType;
  badge?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
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
    {badge && (
      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
    )}
  </button>
);

/* ═══ Search Bar Component ═══ */
const SearchBar = ({
  value,
  onChange,
  collapsed,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  if (collapsed) {
    return (
      <IconButton icon={Search} onClick={onToggle} title="بحث" />
    );
  }

  return (
    <div className="relative w-full max-w-[560px]">
      <Search
        className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none"
        strokeWidth={2}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ابحث عن معاملة، عميل، مورد، تقرير..."
        className={cn(
          "w-full h-10 pr-10 pl-4 rounded-full",
          "bg-muted/60 border border-transparent",
          "text-sm text-foreground placeholder:text-muted-foreground/50",
          "focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 focus:bg-background",
          "hover:bg-muted/80",
          "transition-all duration-200"
        )}
      />
    </div>
  );
};

/* ═══ Profile Dropdown ═══ */
const ProfileDropdown = ({
  displayName,
  email,
  initials,
  onNavigate,
  onSignOut,
}: {
  displayName: string;
  email: string;
  initials: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        className={cn(
          "flex items-center gap-2 h-9 px-2.5 rounded-full",
          "bg-muted/50 hover:bg-muted",
          "transition-all duration-200 cursor-pointer",
          "border border-transparent hover:border-border/50"
        )}
      >
        <span className="text-[13px] font-medium text-foreground hidden md:block max-w-[140px] truncate">
          {displayName}
        </span>
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
    {/* Green AI circle icon */}
    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
          fill="rgba(255,255,255,0.2)"
        />
      </svg>
    </div>
    <span className="text-lg font-semibold text-foreground hidden sm:block whitespace-nowrap">
      عبدالله AI للمحاسبة
    </span>
  </div>
);

/* ═══════════════════════════════════════════════ */
/* ═══ MAIN HEADER COMPONENT ═══ */
/* ═══════════════════════════════════════════════ */
const TopBar = ({ onMenuClick, sidebarCollapsed }: TopBarProps) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
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

  const displayName =
    profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "المستخدم";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("");

  return (
    <header
      className="sticky top-0 z-40 bg-background border-b border-border/40"
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
    >
      <div className="h-16 flex items-center gap-4 px-4 sm:px-6">
        {/* ── Mobile menu button ── */}
        <button
          onClick={onMenuClick}
          className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors"
        >
          <Menu className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
        </button>

        {/* ── Logo (RIGHT in RTL) ── */}
        <AppLogo />

        {/* ── Center: Search Bar ── */}
        <div className="flex-1 flex justify-center px-4">
          {/* Desktop */}
          <div className="hidden md:block w-full max-w-[560px]">
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              collapsed={false}
              onToggle={() => {}}
            />
          </div>
          {/* Mobile: icon toggle */}
          <div className="md:hidden">
            {mobileSearchOpen ? (
              <SearchBar
                value={searchValue}
                onChange={setSearchValue}
                collapsed={false}
                onToggle={() => setMobileSearchOpen(false)}
              />
            ) : (
              <IconButton
                icon={Search}
                onClick={() => setMobileSearchOpen(true)}
                title="بحث"
              />
            )}
          </div>
        </div>

        {/* ── Left section (in RTL): icons + profile ── */}
        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <IconButton
            icon={theme === "dark" ? Moon : Sun}
            onClick={toggleTheme}
            title={theme === "dark" ? "وضع فاتح" : "وضع داكن"}
          />

          <IconButton icon={Bell} badge title="الإشعارات" />

          <IconButton
            icon={Settings}
            onClick={() => navigate("/settings")}
            title="الإعدادات"
            className="hidden sm:flex"
          />

          <IconButton
            icon={HelpCircle}
            title="المساعدة"
            className="hidden sm:flex"
          />

          {/* Divider */}
          <div className="w-px h-6 bg-border/60 mx-1.5 hidden sm:block" />

          {/* Profile */}
          <ProfileDropdown
            displayName={displayName}
            email={user?.email || ""}
            initials={initials}
            onNavigate={navigate}
            onSignOut={signOut}
          />
        </div>
      </div>
    </header>
  );
};

export default TopBar;

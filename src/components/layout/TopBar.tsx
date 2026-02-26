import { useState } from "react";
import { Search, Bell, Sun, Moon, Menu, ChevronDown, LogOut, User, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopBarProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

const TopBar = ({ onMenuClick, sidebarCollapsed }: TopBarProps) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  const displayName = user?.user_metadata?.company_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "المستخدم";
  const initials = displayName.split(" ").slice(0, 2).map((w: string) => w[0]).join("");

  return (
    <header className="h-14 border-b border-border/50 bg-card/80 backdrop-blur-md flex items-center gap-4 px-5 flex-shrink-0">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
      >
        <Menu className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
      </button>

      {/* Global Search */}
      <div className="flex-1 max-w-lg">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" strokeWidth={1.8} />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="ابحث عن معاملة، عميل، مورد، تقرير…"
            className="w-full h-9 pr-10 pl-4 rounded-xl bg-secondary/60 border-0 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-secondary transition-all"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
        >
          {theme === "dark" ? (
            <Moon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />
          ) : (
            <Sun className="h-[18px] w-[18px] text-warning" strokeWidth={1.8} />
          )}
        </button>

        {/* Notifications */}
        <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors relative">
          <Bell className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-2 rounded-xl hover:bg-secondary transition-colors mr-1">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">{initials}</span>
              </div>
              <span className="text-[13px] font-medium text-foreground hidden md:block max-w-[120px] truncate">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 rounded-xl bg-popover border-border shadow-elevated z-50">
            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2.5 cursor-pointer rounded-lg mx-1">
              <User className="h-4 w-4" strokeWidth={1.8} />
              الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2.5 cursor-pointer rounded-lg mx-1">
              <Settings className="h-4 w-4" strokeWidth={1.8} />
              الإعدادات
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="gap-2.5 cursor-pointer text-destructive rounded-lg mx-1">
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;

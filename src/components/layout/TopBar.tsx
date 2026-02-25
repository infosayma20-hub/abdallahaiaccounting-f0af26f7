import { useState } from "react";
import { Search, Bell, Sun, Moon, Menu, HelpCircle, ChevronDown, LogOut, User, Settings } from "lucide-react";
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
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center gap-3 px-4 flex-shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
      >
        <Menu className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Global Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="ابحث عن معاملة، عميل، مورد، تقرير…"
            className="w-full h-9 pr-10 pl-4 rounded-lg bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Help */}
        <button className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors">
          <HelpCircle className="h-[18px] w-[18px] text-muted-foreground" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
        >
          {theme === "dark" ? (
            <Moon className="h-[18px] w-[18px] text-muted-foreground" />
          ) : (
            <Sun className="h-[18px] w-[18px] text-warning" />
          )}
        </button>

        {/* Notifications */}
        <button className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors relative">
          <Bell className="h-[18px] w-[18px] text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-secondary transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{initials}</span>
              </div>
              <span className="text-sm font-medium text-foreground hidden md:block max-w-[120px] truncate">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2 cursor-pointer">
              <User className="h-4 w-4" />
              الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer">
              <Settings className="h-4 w-4" />
              الإعدادات
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="gap-2 cursor-pointer text-destructive">
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;

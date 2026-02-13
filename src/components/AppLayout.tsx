import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Menu, Plus, FileText, Receipt, BookOpen, Users, BarChart3, MoreHorizontal, Mic, Landmark, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface AppLayoutProps {
  children: React.ReactNode;
}

const quickActions = [
  { icon: FileText, label: "فاتورة", color: "text-primary" },
  { icon: Receipt, label: "مصروف", color: "text-destructive" },
  { icon: BookOpen, label: "قيد محاسبي", color: "text-accent-foreground" },
  { icon: Users, label: "عميل", color: "text-primary" },
  { icon: UserPlus, label: "مورد", color: "text-warning" },
  { icon: Landmark, label: "إيداع بنكي", color: "text-muted-foreground" },
];

const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-background relative">
      {/* Main Content */}
      <main className="flex-1 pb-24 overflow-y-auto">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-md mx-auto bg-card border-t border-border shadow-lg">
          <div className="flex items-center justify-around h-16 px-4">
            {/* الرئيسية */}
            <button
              onClick={() => navigate("/")}
              className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                isActive("/") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Home className="h-5 w-5" />
              <span className="text-xs font-medium">الرئيسية</span>
            </button>

            {/* زر الإضافة العائم */}
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center justify-center w-14 h-14 -mt-8 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-all active:scale-95"
            >
              <Plus className="h-7 w-7" />
            </button>

            {/* القائمة */}
            <button
              onClick={() => navigate("/menu")}
              className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                isActive("/menu") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Menu className="h-5 w-5" />
              <span className="text-xs font-medium">القائمة</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Bottom Sheet - إضافة سريعة */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-center text-lg font-bold">إضافة جديدة</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => setSheetOpen(false)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-secondary hover:bg-accent transition-colors active:scale-95"
              >
                <action.icon className={`h-6 w-6 ${action.color}`} />
                <span className="text-xs font-medium text-foreground">{action.label}</span>
              </button>
            ))}
          </div>
          {/* زر الإدخال الصوتي */}
          <button
            onClick={() => { setSheetOpen(false); navigate("/voice"); }}
            className="mt-4 w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors active:scale-[0.98]"
          >
            <Mic className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold text-primary">إدخال بالصوت 🎙️</span>
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AppLayout;

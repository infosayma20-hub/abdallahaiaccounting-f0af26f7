import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Briefcase, Truck, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function ChooseWorkspacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const choose = (path: "/employee" | "/rep") => {
    try {
      if (user?.id) sessionStorage.setItem(`workspace-choice:${user.id}`, path);
    } catch {}
    navigate(path, { replace: true });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">اختر مساحة العمل</h1>
          <p className="text-muted-foreground text-sm">عندك صلاحية الدخول لأكثر من واجهة. اختر اللي تبغى تشتغل عليها الحين.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/rep")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/rep")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Truck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">شاشة المندوب</h2>
            <p className="text-sm text-muted-foreground">طلبيات، تحصيلات، مصاريف اليوم</p>
            <Button className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/rep"); }}>
              دخول كمندوب
            </Button>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("/employee")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose("/employee")}
            className="p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-accent-foreground" />
            </div>
            <h2 className="text-lg font-semibold">شاشة الموظف</h2>
            <p className="text-sm text-muted-foreground">دوام، إجازات، قسائم راتب</p>
            <Button variant="secondary" className="w-full mt-2" onClick={(e) => { e.stopPropagation(); choose("/employee"); }}>
              دخول كموظف
            </Button>
          </Card>
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            تسجيل خروج
          </Button>
        </div>
      </div>
    </div>
  );
}

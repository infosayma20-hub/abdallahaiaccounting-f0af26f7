import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (password.length < 8) {
        toast({ title: "خطأ", description: "كلمة المرور يجب أن تكون 8 أحرف على الأقل", variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (error) throw error;
      // Force the user to log back in with the new password — never leave
      // them inside the short-lived recovery session.
      try { await supabase.auth.signOut(); } catch { /* best-effort */ }
      toast({
        title: "تم تغيير كلمة المرور بنجاح",
        description: "يرجى تسجيل الدخول من جديد",
      });
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">تعيين كلمة مرور جديدة</h1>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <form onSubmit={handleReset} className="space-y-4">
              <Input
                type="password"
                placeholder="كلمة المرور الجديدة"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                dir="ltr"
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ كلمة المرور
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

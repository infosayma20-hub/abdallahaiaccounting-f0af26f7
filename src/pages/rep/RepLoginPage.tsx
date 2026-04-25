import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Truck, Loader2 } from "lucide-react";

export default function RepLoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      // verify rep
      (async () => {
        const { data } = await (supabase as any)
          .from("sales_representatives")
          .select("id, is_active")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (data && data.is_active) {
          navigate("/rep", { replace: true });
        }
      })();
    }
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;

      // verify rep
      const { data: rep } = await (supabase as any)
        .from("sales_representatives")
        .select("id, is_active, full_name")
        .eq("auth_user_id", data.user!.id)
        .maybeSingle();

      if (!rep) {
        await supabase.auth.signOut();
        toast({ title: "غير مصرح", description: "هذا الحساب غير مرتبط بمندوب مبيعات", variant: "destructive" });
        return;
      }
      if (!rep.is_active) {
        await supabase.auth.signOut();
        toast({ title: "حساب موقوف", description: "تواصل مع الإدارة", variant: "destructive" });
        return;
      }

      toast({ title: `مرحباً ${rep.full_name}` });
      navigate("/rep", { replace: true });
    } catch (err: any) {
      toast({ title: "فشل تسجيل الدخول", description: err.message || "تحقق من البيانات", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">دخول المندوب</h1>
            <p className="text-sm text-muted-foreground">سجّل دخولك لإدارة طلبات اليوم</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="rep@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "دخول"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, ShieldCheck } from "lucide-react";

const SuperAdminLoginPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (!data.user) throw new Error("فشل تسجيل الدخول");

      // Verify super_admin role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "super_admin");

      if (!roles || roles.length === 0) {
        await supabase.auth.signOut();
        toast({
          title: "غير مصرح",
          description: "هذا الحساب لا يملك صلاحية الدخول للوحة الإدارة",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      navigate("/super-admin/dashboard");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      dir="rtl"
      style={{ background: "#F0F2F5" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 space-y-6"
        style={{
          background: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo / Icon */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "#1B3A5C" }}
          >
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-xl font-bold"
            style={{ color: "#1B3A5C", fontFamily: "Tajawal, sans-serif" }}
          >
            لوحة التحكم
          </h1>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>
            Admin Panel
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="pr-10 h-12 text-base"
              dir="ltr"
              style={{ textAlign: "right" }}
            />
          </div>

          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10 h-12 text-base"
              dir="ltr"
              style={{ textAlign: "right" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-lg text-base font-bold text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            style={{
              background: "#1B3A5C",
              fontFamily: "Tajawal, sans-serif",
            }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            تسجيل الدخول
          </button>
        </form>

        {/* Back link */}
        <div className="text-center">
          <a
            href="/auth"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: "Tajawal, sans-serif" }}
          >
            ← العودة للموقع
          </a>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLoginPage;

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface ManagerOverrideDialogProps {
  open: boolean;
  onClose: () => void;
  onApproved: (managerName: string) => void;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

export default function ManagerOverrideDialog({
  open, onClose, onApproved, title, description, variant = "default",
}: ManagerOverrideDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setError("");
    }
  }, [open]);

  const handleVerify = async () => {
    if (!email.trim() || !password.trim()) {
      setError("أدخل البريد الإلكتروني وكلمة المرور");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // Save current session
      const { data: currentSession } = await supabase.auth.getSession();
      const currentToken = currentSession.session?.refresh_token;

      // Try to sign in with manager credentials
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("بيانات الدخول غير صحيحة");
        // Restore original session
        if (currentToken) {
          await supabase.auth.refreshSession({ refresh_token: currentToken });
        }
        setLoading(false);
        return;
      }

      const managerId = signInData.user?.id;
      if (!managerId) {
        setError("خطأ في التحقق");
        if (currentToken) {
          await supabase.auth.refreshSession({ refresh_token: currentToken });
        }
        setLoading(false);
        return;
      }

      // Check if this user has admin or manager role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", managerId);

      const isAdmin = roles?.some(r => 
        r.role === "admin" || r.role === "super_admin"
      );

      // Get manager name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", managerId)
        .maybeSingle();

      // Restore cashier session
      if (currentToken) {
        await supabase.auth.refreshSession({ refresh_token: currentToken });
      }

      if (!isAdmin) {
        setError("هذا الحساب ليس لديه صلاحية مدير");
        setLoading(false);
        return;
      }

      const managerName = profile?.display_name || email;
      onApproved(managerName);
    } catch (err) {
      setError("حدث خطأ أثناء التحقق");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isDestructive = variant === "destructive";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm z-[1200]" dir="rtl">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isDestructive ? "text-destructive" : ""}`}>
            <Lock className={`h-5 w-5 ${isDestructive ? "text-destructive" : "text-amber-500"}`} />
            {title || "يتطلب موافقة المدير"}
          </DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-4">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">البريد الإلكتروني للمدير</label>
              <Input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="manager@company.com"
                className="h-11 text-sm"
                dir="ltr"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">كلمة المرور</label>
              <Input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                className="h-11 text-sm"
                dir="ltr"
                onKeyDown={e => e.key === "Enter" && handleVerify()}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleVerify}
            disabled={loading || !email.trim() || !password.trim()}
            variant={isDestructive ? "destructive" : "default"}
            className={!isDestructive ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                جاري التحقق...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                تحقق وموافقة
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

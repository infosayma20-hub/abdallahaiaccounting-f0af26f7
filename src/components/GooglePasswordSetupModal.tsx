import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface GooglePasswordSetupModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function GooglePasswordSetupModal({ open, onComplete, onSkip }: GooglePasswordSetupModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const isValid = password.length >= 1 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "تم حفظ كلمة المرور ✅", description: "يمكنك الآن تسجيل الدخول بالبريد وكلمة المرور أيضاً" });
      onComplete();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 pb-2 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-xl font-bold text-foreground">أضف كلمة مرور للدخول السريع</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              يمكنك لاحقاً تسجيل الدخول بإيميلك وكلمة المرور بدون الحاجة لجوجل
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">كلمة المرور الجديدة</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="8 أحرف على الأقل"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  className="pr-10 pl-10"
                  dir="ltr"
                  style={{ textAlign: "left" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs text-destructive">كلمة المرور يجب أن تكون 8 أحرف على الأقل</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">تأكيد كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="أعد كتابة كلمة المرور"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                  dir="ltr"
                  style={{ textAlign: "left" }}
                />
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-xs text-destructive">كلمتا المرور غير متطابقتين</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!isValid || loading}
              className="w-full h-12 text-base font-bold"
              style={{
                background: "linear-gradient(135deg, #E8A020, #F45E0C)",
                color: "white",
              }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              حفظ وإكمال
            </Button>

            <button
              type="button"
              onClick={onSkip}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              تخطي الآن
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

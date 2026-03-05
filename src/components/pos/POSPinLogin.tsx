import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, User, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface POSPinLoginProps {
  companyId: string;
  companyName: string;
  onLogin: (data: {
    posUser: { id: string; name: string; role: string; avatar_url: string | null; company_id: string };
    permissions: Record<string, boolean | number>;
    deviceId: string;
    existingSession: { id: string } | null;
  }) => void;
  onAccountLogin?: (user: { id: string; email: string }) => void;
  onBack: () => void;
}

export default function POSPinLogin({ companyName, onAccountLogin, onBack }: POSPinLoginProps) {
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountLoggingIn, setAccountLoggingIn] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const dateStr = now.toLocaleDateString("ar", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });

  const handleAccountLogin = async () => {
    if (!accountEmail || !accountPassword) {
      setError("أدخل البريد وكلمة المرور");
      return;
    }
    setAccountLoggingIn(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password: accountPassword,
      });
      if (error) throw error;
      if (data.user) {
        // Check if user has cashier role
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);
        
        const userRoles = (roles || []).map(r => r.role);
        const isCashier = userRoles.includes("cashier") || userRoles.includes("admin");
        
        if (!isCashier) {
          await supabase.auth.signOut();
          setError("هذا الحساب ليس لديه صلاحية الدخول لنقطة البيع");
          return;
        }

        if (onAccountLogin) {
          onAccountLogin({ id: data.user.id, email: data.user.email || "" });
        } else {
          window.location.reload();
        }
      }
    } catch (e: any) {
      setError(e.message === "Invalid login credentials" ? "بريد أو كلمة مرور خاطئة" : e.message);
    } finally {
      setAccountLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center z-50 p-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">{companyName}</h1>
        <p className="text-slate-400">{dateStr} • {timeStr}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm space-y-4"
      >
        <div className="bg-slate-800/80 rounded-2xl p-6 space-y-4 border border-slate-700">
          <div className="text-center mb-2">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
              <User className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-white">تسجيل دخول الموظف</h2>
            <p className="text-xs text-slate-400 mt-1">البريد الإلكتروني + كلمة المرور</p>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              placeholder="البريد الإلكتروني"
              value={accountEmail}
              onChange={e => setAccountEmail(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
              dir="ltr"
            />
            <Input
              type="password"
              placeholder="كلمة المرور"
              value={accountPassword}
              onChange={e => setAccountPassword(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
              dir="ltr"
              onKeyDown={e => e.key === "Enter" && handleAccountLogin()}
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-red-400 text-xs flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3" />
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <Button
            onClick={handleAccountLogin}
            disabled={accountLoggingIn}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {accountLoggingIn ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <ArrowRight className="w-4 h-4 ml-2" />}
            تسجيل الدخول
          </Button>
        </div>

        <button
          onClick={onBack}
          className="w-full text-slate-500 hover:text-white text-sm transition-colors py-2"
        >
          رجوع
        </button>
      </motion.div>
    </div>
  );
}

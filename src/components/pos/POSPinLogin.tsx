import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Delete, AlertTriangle, Fingerprint, Loader2, User, Mail, KeyRound, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface POSUser {
  id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  is_locked: boolean;
}

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

export default function POSPinLogin({ companyId, companyName, onLogin, onAccountLogin, onBack }: POSPinLoginProps) {
  const [users, setUsers] = useState<POSUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<POSUser | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [deviceNotRegistered, setDeviceNotRegistered] = useState(false);

  // Full account login state
  const [loginMode, setLoginMode] = useState<"pin" | "account">("pin");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountLoggingIn, setAccountLoggingIn] = useState(false);

  useEffect(() => {
    (async () => {
      const fp = await getDeviceFingerprint();
      setDeviceFingerprint(fp);
      await loadUsers(fp);
    })();
  }, [companyId]);

  const loadUsers = async (fp: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pos-pin-auth", {
        body: { action: "get_device_users", device_fingerprint: fp, company_id: companyId },
      });

      if (error) throw error;
      if (data.error) {
        if (data.unregistered) {
          setDeviceNotRegistered(true);
        } else {
          toast.error(data.error);
        }
        setUsers([]);
      } else {
        setUsers(data.users || []);
      }
    } catch (e: any) {
      toast.error("فشل تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  };

  const handlePinDigit = useCallback((digit: string) => {
    if (verifying) return;
    setError("");
    const newPin = pin + digit;
    setPin(newPin);

    if (newPin.length === 4) {
      verifyPin(newPin);
    }
  }, [pin, verifying, selectedUser]);

  const handleBackspace = () => {
    if (verifying) return;
    setPin(p => p.slice(0, -1));
    setError("");
  };

  const verifyPin = async (enteredPin: string) => {
    if (!selectedUser) return;
    setVerifying(true);
    setError("");

    try {
      const { data, error } = await supabase.functions.invoke("pos-pin-auth", {
        body: {
          action: "verify_pin",
          pos_user_id: selectedUser.id,
          pin: enteredPin,
          device_fingerprint: deviceFingerprint,
        },
      });

      if (error) throw error;

      if (data.success) {
        onLogin({
          posUser: data.pos_user,
          permissions: data.permissions,
          deviceId: data.device_id,
          existingSession: data.existing_session,
        });
      } else {
        setShake(true);
        setError(data.error || "رمز خاطئ");
        setPin("");
        setTimeout(() => setShake(false), 600);

        if (data.locked) {
          await loadUsers(deviceFingerprint);
          setSelectedUser(null);
        }
      }
    } catch (e: any) {
      setError("خطأ في الاتصال");
      setPin("");
    } finally {
      setVerifying(false);
    }
  };

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
          // Reload page to trigger role redirect
          window.location.reload();
        }
      }
    } catch (e: any) {
      setError(e.message === "Invalid login credentials" ? "بريد أو كلمة مرور خاطئة" : e.message);
    } finally {
      setAccountLoggingIn(false);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  const now = new Date();
  const dateStr = now.toLocaleDateString("ar", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });

  // Device not registered screen
  if (deviceNotRegistered) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 p-8"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
            <Fingerprint className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">جهاز غير مسجل</h2>
          <p className="text-slate-400 max-w-sm">
            هذا الجهاز غير مسجل في النظام. يرجى التواصل مع المسؤول لتسجيل الجهاز من لوحة الإدارة.
          </p>
          <p className="text-xs text-slate-600 font-mono break-all max-w-sm">
            بصمة الجهاز: {deviceFingerprint.substring(0, 16)}...
          </p>

          {/* Still allow full account login even if device not registered */}
          <div className="border-t border-slate-700 pt-4 mt-4">
            <button
              onClick={() => { setDeviceNotRegistered(false); setLoginMode("account"); }}
              className="text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
            >
              أو سجل دخول بحساب كامل ←
            </button>
          </div>

          <button
            onClick={onBack}
            className="px-6 py-3 rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors"
          >
            رجوع
          </button>
        </motion.div>
      </div>
    );
  }

  // Loading screen
  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-50">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
      </div>
    );
  }

  // Full Account Login mode
  if (loginMode === "account") {
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
              <h2 className="text-lg font-bold text-white">تسجيل دخول بحساب كامل</h2>
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

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-slate-700" />
            <span className="text-xs text-slate-500">أو</span>
            <div className="flex-1 border-t border-slate-700" />
          </div>

          <button
            onClick={() => { setLoginMode("pin"); setError(""); }}
            className="w-full py-3 rounded-xl bg-slate-800/60 text-slate-300 hover:bg-slate-700 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            دخول سريع بـ PIN
          </button>

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

  // User selection grid (PIN mode)
  if (!selectedUser) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center z-50 p-4" dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl font-bold text-white mb-2">{companyName}</h1>
          <p className="text-slate-400 mb-1">{dateStr}</p>
          <p className="text-slate-500 text-sm">🔢 اختر حسابك للدخول بـ PIN</p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-2xl w-full">
          {users.map((user, i) => (
            <motion.button
              key={user.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => {
                if (user.is_locked) {
                  toast.error("هذا الحساب مقفل مؤقتاً");
                  return;
                }
                setSelectedUser(user);
                setPin("");
                setError("");
              }}
              disabled={user.is_locked}
              className={`relative flex flex-col items-center gap-3 p-6 rounded-2xl transition-all duration-200 
                ${user.is_locked
                  ? "bg-slate-800/50 opacity-50 cursor-not-allowed"
                  : "bg-slate-800/80 hover:bg-slate-700 hover:scale-105 cursor-pointer hover:ring-2 hover:ring-emerald-400/50"
                }`}
            >
              {user.is_locked && (
                <div className="absolute top-2 left-2">
                  <Lock className="w-4 h-4 text-red-400" />
                </div>
              )}
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-xl">{user.name[0]}</span>
                )}
              </div>
              <span className="text-white font-medium text-sm">{user.name}</span>
              <span className="text-xs text-slate-500">
                {user.role === "pos_admin" ? "مدير" : user.role === "pos_manager" ? "مشرف" : "كاشير"}
              </span>
            </motion.button>
          ))}
        </div>

        {users.length === 0 && (
          <div className="text-center text-slate-500 mt-8">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
            <p>لا يوجد مستخدمون مسجلون على هذا الجهاز</p>
          </div>
        )}

        {/* Divider + Full Account Login */}
        <div className="mt-8 w-full max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 border-t border-slate-700" />
            <span className="text-xs text-slate-500">أو</span>
            <div className="flex-1 border-t border-slate-700" />
          </div>
          <button
            onClick={() => { setLoginMode("account"); setError(""); }}
            className="w-full py-3 rounded-xl bg-slate-800/60 text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <User className="w-4 h-4" />
            تسجيل دخول بحساب كامل (بريد + كلمة مرور)
          </button>
        </div>

        <button
          onClick={onBack}
          className="mt-4 px-6 py-2 rounded-xl text-slate-400 hover:text-white transition-colors"
        >
          رجوع
        </button>
      </div>
    );
  }

  // PIN entry screen
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center z-50 p-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <button
          onClick={() => { setSelectedUser(null); setPin(""); setError(""); }}
          className="mb-4 text-slate-400 hover:text-white text-sm transition-colors"
        >
          ← تغيير المستخدم
        </button>
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center overflow-hidden mb-4">
          {selectedUser.avatar_url ? (
            <img src={selectedUser.avatar_url} alt={selectedUser.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-bold text-2xl">{selectedUser.name[0]}</span>
          )}
        </div>
        <h2 className="text-2xl font-bold text-white">{selectedUser.name}</h2>
        <p className="text-slate-400 mt-1">أدخل رمز PIN</p>
      </motion.div>

      {/* PIN dots */}
      <motion.div
        animate={shake ? { x: [0, -15, 15, -10, 10, -5, 5, 0] } : {}}
        transition={{ duration: 0.5 }}
        className="flex gap-4 mb-6"
      >
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            animate={pin.length > i ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.2 }}
            className={`w-4 h-4 rounded-full transition-all duration-200 ${
              pin.length > i ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-slate-600"
            }`}
          />
        ))}
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-sm mb-4 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Verifying indicator */}
      {verifying && (
        <div className="mb-4 flex items-center gap-2 text-emerald-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">جاري التحقق...</span>
        </div>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 max-w-[280px] w-full">
        {digits.map((d, i) => {
          if (d === "") return <div key={i} />;
          if (d === "⌫") {
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.9 }}
                onClick={handleBackspace}
                disabled={verifying}
                className="h-16 rounded-2xl bg-slate-700/50 text-white flex items-center justify-center hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                <Delete className="w-6 h-6" />
              </motion.button>
            );
          }
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.9 }}
              onClick={() => handlePinDigit(d)}
              disabled={verifying || pin.length >= 4}
              className="h-16 rounded-2xl bg-slate-800/80 text-white text-2xl font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 active:bg-emerald-600/30"
            >
              {d}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Lock, LogOut, ShieldCheck } from "lucide-react";
import { FinixLogo } from "@/components/ui/FinixLogo";

const INACTIVITY_EVENTS = [
  "mousedown", "mousemove", "keydown", "scroll", "touchstart", "click", "pointermove",
] as const;

const STORAGE_KEY = "session_timeout_settings";

interface SessionSettings {
  timeout: number; // minutes, 0 = disabled
  warning: number; // minutes before timeout to warn (0 = no warning)
}

function loadSettings(): SessionSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { timeout: 30, warning: 2 };
}

/**
 * SessionManager — detects inactivity, shows warning modal, and locks screen on timeout.
 * Settings are synced from company_settings via localStorage.
 */
const SessionManager = () => {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [settings, setSettings] = useState<SessionSettings>(loadSettings);

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  // Sync settings from DB
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("company_settings")
      .select("security_session_timeout, security_warning_minutes")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          const s: SessionSettings = {
            timeout: data.security_session_timeout ?? 30,
            warning: data.security_warning_minutes ?? 2,
          };
          setSettings(s);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        }
      });
  }, [user?.id]);

  // Listen to storage changes from settings page
  useEffect(() => {
    const handler = () => setSettings(loadSettings());
    window.addEventListener("storage", handler);
    window.addEventListener("session_settings_updated", handler as EventListener);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("session_settings_updated", handler as EventListener);
    };
  }, []);

  const handleAutoLogout = useCallback(() => {
    setShowWarning(false);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Real sign-out: clear Supabase session + localStorage/sessionStorage so refresh cannot restore it.
    (async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn("[SessionManager] signOut failed:", e);
      }
      try {
        // Clear all Supabase auth tokens (sb-*-auth-token, etc.) and known session keys.
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (
            k.startsWith("sb-") ||
            k.startsWith("supabase.") ||
            k === "task_session" ||
            k === "portal_session" ||
            k === "malaki_session" ||
            k.startsWith("amwali_draft_")
          ) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
      } catch {}

      // Show the lock screen briefly, then hard-redirect so React state is fully reset.
      setShowLocked(true);
      setTimeout(() => {
        window.location.replace("/auth?reason=session_expired");
      }, 50);
    })();
  }, []);

  const resetTimer = useCallback(() => {
    clearTimeout(inactivityTimerRef.current);
    clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowWarning(false);

    const { timeout, warning } = settings;
    if (timeout === 0 || !user) return;

    const timeoutMs = timeout * 60 * 1000;

    // Warning timer
    if (warning > 0 && warning < timeout) {
      const warningMs = (timeout - warning) * 60 * 1000;
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
        setCountdown(warning * 60);
        countdownRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownRef.current!);
              handleAutoLogout();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, warningMs);
    }

    // Logout timer
    inactivityTimerRef.current = setTimeout(() => {
      handleAutoLogout();
    }, timeoutMs);
  }, [settings, user, handleAutoLogout]);

  // Set up event listeners
  useEffect(() => {
    if (!user || settings.timeout === 0) return;

    const handler = () => {
      if (!showLocked) resetTimer();
    };

    INACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, handler, { passive: true })
    );

    resetTimer();

    return () => {
      INACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, handler)
      );
      clearTimeout(inactivityTimerRef.current);
      clearTimeout(warningTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [user, settings.timeout, resetTimer, showLocked]);

  const handleStayLoggedIn = () => {
    setShowWarning(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
    resetTimer();
  };

  const handleLogoutNow = async () => {
    setShowWarning(false);
    setShowLocked(false);
    await signOut();
  };

  const handleReLogin = () => {
    // Session is already terminated by handleAutoLogout; just navigate.
    setShowLocked(false);
    window.location.replace("/auth?reason=session_expired");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!user) return null;

  return (
    <>
      {/* Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" dir="rtl">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-md mx-4 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
                <Lock className="h-8 w-8 text-accent" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">هل لا تزال هنا؟</h3>
                <p className="text-sm text-muted-foreground">
                  سيتم تسجيل خروجك تلقائياً خلال:
                </p>
              </div>
              <div className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-accent/10 border border-accent/20">
                <span className="text-3xl font-mono font-bold text-accent tracking-wider">
                  {formatTime(countdown)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">لحماية بياناتك المالية</p>
              <div className="flex gap-3">
                <button
                  onClick={handleLogoutNow}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج الآن
                </button>
                <button
                  onClick={handleStayLoggedIn}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  أنا هنا! ابقَ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Expired / Locked Screen */}
      {showLocked && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background" dir="rtl">
          <div className="w-full max-w-md mx-4 text-center space-y-6">
            <FinixLogo variant="full" size="md" />
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="h-10 w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">انتهت جلستك تلقائياً</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                تم قفل الشاشة بعد {settings.timeout} دقيقة من عدم النشاط
                <br />
                لحماية بياناتك المالية
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3 text-right">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary-foreground">
                    {(user?.email?.[0] || "U").toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{user?.user_metadata?.full_name || user?.email?.split("@")[0]}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleReLogin}
              className="w-full px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-all shadow-lg"
            >
              تسجيل الدخول مرة أخرى
            </button>
            <p className="text-xs text-muted-foreground">
              يمكنك تعديل مدة الجلسة من الإعدادات → الأمان
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default SessionManager;

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, KeyRound, Eye, EyeOff, Loader2, Check, X, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ───────── Password policy (matches realistic backend strength check) ───────── */

type PolicyCheck = {
  key: string;
  label: string;
  test: (pwd: string, ctx: { email?: string; name?: string }) => boolean;
};

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "qwerty", "qwerty123", "123456",
  "12345678", "123456789", "1234567890", "admin", "admin123", "letmein",
  "welcome", "welcome1", "iloveyou", "abc123", "111111", "000000",
  "enter", "enter123", "test1234", "p@ssw0rd",
]);

const hasRepeatingPattern = (s: string) =>
  /(.)\1{3,}/.test(s) || /(012|123|234|345|456|567|678|789|890|abc|qwerty|asdf)/i.test(s);

const containsAccountInfo = (pwd: string, ctx: { email?: string; name?: string }) => {
  const lower = pwd.toLowerCase();
  const parts: string[] = [];
  if (ctx.email) parts.push(ctx.email.split("@")[0].toLowerCase());
  if (ctx.name) parts.push(...ctx.name.toLowerCase().split(/\s+/).filter(p => p.length >= 3));
  return parts.some(p => p && p.length >= 3 && lower.includes(p));
};

const POLICY: PolicyCheck[] = [
  { key: "length",  label: "8 أحرف على الأقل",        test: (p) => p.length >= 8 },
  { key: "upper",   label: "حرف كبير (A-Z)",          test: (p) => /[A-Z]/.test(p) },
  { key: "lower",   label: "حرف صغير (a-z)",          test: (p) => /[a-z]/.test(p) },
  { key: "digit",   label: "رقم (0-9)",                test: (p) => /[0-9]/.test(p) },
  { key: "symbol",  label: "رمز خاص (!@#$%…)",        test: (p) => /[^A-Za-z0-9]/.test(p) },
  { key: "common",  label: "ليست كلمة شائعة",          test: (p) => p.length === 0 || !COMMON_PASSWORDS.has(p.toLowerCase()) },
  { key: "pattern", label: "بدون نمط متكرر أو متسلسل", test: (p) => p.length === 0 || !hasRepeatingPattern(p) },
  { key: "account", label: "لا تشبه بريدك أو اسمك",   test: (p, c) => p.length === 0 || !containsAccountInfo(p, c) },
];

function evaluateStrength(pwd: string, ctx: { email?: string; name?: string }) {
  const passed = POLICY.filter(r => r.test(pwd, ctx));
  const score = passed.length; // 0..8
  let level: "empty" | "weak" | "fair" | "good" | "strong" = "empty";
  if (pwd.length === 0) level = "empty";
  else if (score <= 3) level = "weak";
  else if (score <= 5) level = "fair";
  else if (score <= 7) level = "good";
  else level = "strong";
  return { score, level, passed: new Set(passed.map(p => p.key)) };
}

const STRENGTH_META: Record<string, { label: string; barClass: string; textClass: string; bars: number }> = {
  empty:  { label: "—",        barClass: "bg-muted",        textClass: "text-muted-foreground", bars: 0 },
  weak:   { label: "ضعيفة",    barClass: "bg-destructive",  textClass: "text-destructive",      bars: 1 },
  fair:   { label: "مقبولة",   barClass: "bg-amber-500",    textClass: "text-amber-600",        bars: 2 },
  good:   { label: "جيدة",     barClass: "bg-blue-500",     textClass: "text-blue-600",         bars: 3 },
  strong: { label: "قوية",     barClass: "bg-emerald-500",  textClass: "text-emerald-600",      bars: 4 },
};

/* Translate common Supabase auth errors into clear Arabic messages */
function translateAuthError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("weak") || m.includes("pwned") || m.includes("known")) {
    return "كلمة المرور ضعيفة أو مكشوفة في تسريبات سابقة. اختر كلمة مرور أقوى وأكثر تعقيداً.";
  }
  if (m.includes("same as") || m.includes("same_password")) {
    return "كلمة المرور الجديدة مطابقة للحالية. الرجاء اختيار كلمة مرور مختلفة.";
  }
  if (m.includes("invalid") && m.includes("credential")) {
    return "كلمة المرور الحالية غير صحيحة.";
  }
  if (m.includes("password should be at least")) {
    return "كلمة المرور قصيرة جداً.";
  }
  return msg || "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

/* ───────── Component ───────── */

type Mode = "loading" | "add" | "change";

const PasswordManagementSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("loading");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Detect account type → which section to show
  useEffect(() => {
    if (!user) {
      setMode("loading");
      return;
    }
    const identities = user.identities || [];
    const hasEmail = identities.some((i) => i.provider === "email");
    setMode(hasEmail ? "change" : "add");
  }, [user]);

  const ctx = useMemo(
    () => ({
      email: user?.email,
      name: (user?.user_metadata as any)?.full_name || (user?.user_metadata as any)?.display_name,
    }),
    [user],
  );

  const strength = useMemo(() => evaluateStrength(newPwd, ctx), [newPwd, ctx]);
  const meta = STRENGTH_META[strength.level];

  const matches = confirmPwd.length > 0 && newPwd === confirmPwd;
  const policyOk = strength.score === POLICY.length;
  const canSubmit =
    !saving &&
    policyOk &&
    matches &&
    (mode === "add" ? true : currentPwd.length > 0);

  const reset = () => {
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setSaving(true);
    try {
      // For "change" mode → re-verify current password first (defense in depth)
      if (mode === "change") {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: currentPwd,
        });
        if (verifyErr) {
          throw new Error("invalid_credentials");
        }
      }

      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;

      reset();
      toast({
        title: mode === "add" ? "تمت إضافة كلمة المرور بنجاح" : "تم تغيير كلمة المرور بنجاح",
        description:
          mode === "add"
            ? "يمكنك الآن تسجيل الدخول بالبريد وكلمة المرور إلى جانب Google."
            : "ستحتاج إلى استخدام كلمة المرور الجديدة في عمليات تسجيل الدخول القادمة.",
      });

      // After "add" succeeds, the account now has email identity → switch to "change"
      if (mode === "add") setMode("change");
    } catch (err: any) {
      const raw = err?.message === "invalid_credentials" ? "invalid credentials" : err?.message;
      toast({
        title: "تعذر حفظ كلمة المرور",
        description: translateAuthError(raw || ""),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (mode === "loading") return null;

  const isAdd = mode === "add";

  return (
    <div className="px-2" dir="rtl">
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                isAdd ? "bg-accent/10" : "bg-primary/10",
              )}
            >
              {isAdd ? (
                <ShieldCheck className="h-5 w-5 text-accent" />
              ) : (
                <KeyRound className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-base sm:text-lg font-bold text-foreground"
                style={{ fontFamily: "Tajawal, sans-serif" }}
              >
                {isAdd ? "إضافة كلمة مرور" : "تغيير كلمة المرور"}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                {isAdd
                  ? "حسابك يستخدم تسجيل الدخول عبر Google فقط. يمكنك إضافة كلمة مرور لتسجيل الدخول مباشرةً بالبريد الإلكتروني أيضاً."
                  : "اختر كلمة مرور قوية يصعب تخمينها. سيتم تطبيقها فوراً على حسابك."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current password (change mode only) */}
            {!isAdd && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">كلمة المرور الحالية</label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    placeholder="أدخل كلمة المرور الحالية"
                    autoComplete="current-password"
                    dir="ltr"
                    className="h-11 pl-10 text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {isAdd ? "كلمة المرور" : "كلمة المرور الجديدة"}
              </label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="اختر كلمة مرور قوية"
                  autoComplete="new-password"
                  dir="ltr"
                  className="h-11 pl-10 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength meter */}
              <div className="pt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">قوة كلمة المرور</span>
                  <span className={cn("text-[11px] font-semibold", meta.textClass)}>{meta.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        i <= meta.bars ? meta.barClass : "bg-muted",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">تأكيد كلمة المرور</label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  autoComplete="new-password"
                  dir="ltr"
                  className="h-11 pl-10 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPwd.length > 0 && !matches && (
                <p className="text-xs text-destructive">كلمتا المرور غير متطابقتين.</p>
              )}
            </div>

            {/* Live policy checklist */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <p className="text-xs font-semibold text-foreground mb-2">يجب أن تستوفي كلمة المرور:</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {POLICY.map((rule) => {
                  const ok = strength.passed.has(rule.key);
                  return (
                    <li key={rule.key} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                          ok ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-60" />}
                      </span>
                      <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>
                        {rule.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={!canSubmit} className="h-11 px-6 gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAdd ? (
                  <ShieldCheck className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {isAdd ? "حفظ كلمة المرور" : "تحديث كلمة المرور"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PasswordManagementSection;
import { useState, useEffect, useMemo } from "react";
import { Wallet, Mic, Send, Loader2, Bell, Sparkles, Database, FileText, Package, TrendingUp, ArrowLeft } from "lucide-react";
import MentionInput from "@/components/MentionInput";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCountUp } from "@/hooks/useCountUp";
import { useRotatingPlaceholder } from "@/hooks/useRotatingPlaceholder";
import PasskeyOnboarding from "@/components/PasskeyOnboarding";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";
import OnboardingFlow from "@/components/OnboardingFlow";
import SetupWizard from "@/components/SetupWizard";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

interface TransactionRecord {
  id: string;
  fields: {
    Amount?: number;
    Currency?: string;
    "Transaction Type"?: string;
    "Credit Account Rollup"?: string;
    "Debit Account Rollup"?: string;
    Description?: string;
    Date?: string;
    Client?: string;
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [dbCommand, setDbCommand] = useState("");
  const [dbSending, setDbSending] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showPasskeyOnboarding, setShowPasskeyOnboarding] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [profileData, setProfileData] = useState<{ display_name?: string; company_name?: string; setup_completed?: boolean } | null>(null);
  const [tipDismissed, setTipDismissed] = useState(() => localStorage.getItem("tip_dismissed") === "true");
  const rotatingPlaceholder = useRotatingPlaceholder();

  // Fetch profile from DB + check setup status
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, company_name, setup_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setProfileData(data);
        if (!data.setup_completed) {
          setShowSetupWizard(true);
        }
      }
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("passkey_onboarding_done");
    if (!done && browserSupportsWebAuthn()) {
      setShowPasskeyOnboarding(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("onboarding_completed");
    if (!done) {
      setShowOnboarding(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const profileCompleted = localStorage.getItem(`profile_completed_${user.id}`);
    const alreadySynced = localStorage.getItem(`airtable_synced_${user.id}`);
    if (profileCompleted || alreadySynced) return;
    const meta = user.user_metadata;
    if (meta?.phone || meta?.company_name) {
      localStorage.setItem(`profile_completed_${user.id}`, "true");
      localStorage.setItem(`airtable_synced_${user.id}`, "true");
      return;
    }
    const isOAuth = user.app_metadata?.provider !== "email";
    if (isOAuth) {
      setShowProfileDialog(true);
    }
  }, [user]);

  useEffect(() => {
    const ensureAirtableClient = async () => {
      if (!user || localStorage.getItem(`airtable_synced_${user.id}`)) return;
      try {
        await supabase.functions.invoke("airtable-create-client", {
          body: {
            clientName: user.id,
            contactEmail: user.email || "",
            phoneNumber: user.user_metadata?.phone || "",
            companyName: user.user_metadata?.company_name || "",
            address: user.user_metadata?.address || "",
            country: user.user_metadata?.country || "",
            workField: user.user_metadata?.work_field || "",
          },
        });
        localStorage.setItem(`airtable_synced_${user.id}`, "true");
      } catch (err) {
        console.error("Failed to sync user to Airtable:", err);
      }
    };
    ensureAirtableClient();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoadingTx(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!res.ok) throw new Error("Failed to fetch transactions");
        const result = await res.json();
        setTransactions(result.records || []);
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setLoadingTx(false);
      }
    };
    fetchTx();
  }, [user]);

  // Compute summary
  const revenue = transactions
    .filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const expenses = transactions
    .filter((tx) => tx.fields["Debit Account Rollup"] === "Expenses")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalIncome = transactions
    .filter((tx) => tx.fields["Transaction Type"] === "سند قبض")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalOutcome = transactions
    .filter((tx) => tx.fields["Transaction Type"] === "سند صرف")
    .reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const cashBalance = totalIncome - totalOutcome;
  const netProfit = revenue - expenses;

  const animCash = useCountUp(cashBalance, 1200, !loadingTx);
  const animProfit = useCountUp(netProfit, 1200, !loadingTx);

  // AI Insight
  const aiInsight = useMemo(() => {
    if (transactions.length === 0) return "ابدأ بإضافة أول عملية لنقدّم لك تحليلات ذكية.";
    if (expenses > revenue && revenue > 0) {
      const pct = Math.round(((expenses - revenue) / revenue) * 100);
      return `⚠️ مصاريفك تتجاوز إيراداتك بنسبة ${pct}% — حاول تقليل النفقات`;
    }
    if (revenue > expenses && expenses > 0) {
      const margin = Math.round(((revenue - expenses) / revenue) * 100);
      return `✅ هامش ربحك ${margin}% — أداء مالي جيد، استمر!`;
    }
    if (expenses > 0 && revenue === 0) return "💡 لديك مصروفات فقط — سجّل إيراداتك لتحليل أفضل";
    return "تحصيلاتك جيدة — تابع التسجيل للحصول على رؤى أعمق 👌";
  }, [transactions, expenses, revenue]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const lines = inputValue.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setSending(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const line of lines) {
        try {
          const { error } = await supabase.functions.invoke("send-transaction", {
            body: { text: line, userId: user?.id, email: user?.email, companyName: user?.user_metadata?.company_name },
          });
          if (error) throw error;
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        toast({ title: `تم إرسال ${successCount > 1 ? successCount + " عمليات" : "العملية"} بنجاح ✅`, description: "جاري المعالجة بالذكاء الاصطناعي" });
      } else {
        toast({ title: `تم إرسال ${successCount} من ${lines.length} عمليات`, description: `فشل ${failCount} عمليات`, variant: "destructive" });
      }
      setInputValue("");
    } catch (err: any) {
      toast({ title: "خطأ في الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDbCommand = async () => {
    if (!dbCommand.trim()) return;
    setDbSending(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-command`, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ command: dbCommand, clientId: user?.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل تنفيذ الأمر");
      if (data.action === 'need_info') {
        toast({ title: "📝 " + (data.message || "أحتاج تفاصيل إضافية"), description: (data.missing_fields || []).join("، ") });
      } else if (data.action === 'delete_blocked') {
        toast({ title: data.message || "لا يمكن الحذف", variant: "destructive" });
      } else if (data.success) {
        toast({ title: "✅ " + (data.message || "تم تنفيذ الأمر بنجاح") });
        setDbCommand("");
      } else {
        toast({ title: data.message || "لم أفهم الأمر", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDbSending(false);
    }
  };

  const displayName = profileData?.company_name || profileData?.display_name || user?.user_metadata?.company_name || user?.user_metadata?.full_name || "عميل";
  const hasTransactions = !loadingTx && transactions.length > 0;
  const isEmpty = !loadingTx && transactions.length === 0;

  const quickActions = [
    {
      icon: "📝",
      label: "فاتورة جديدة",
      gradient: "from-[hsl(152,76%,36%)] to-[hsl(160,84%,39%)]",
      path: "/invoices",
      primary: true,
    },
    {
      icon: "📦",
      label: "إضافة منتج",
      gradient: "from-[hsl(217,91%,60%)] to-[hsl(217,91%,48%)]",
      path: "/inventory",
    },
    {
      icon: "🎙️",
      label: "إدخال صوتي",
      gradient: "from-[hsl(38,92%,50%)] to-[hsl(28,80%,52%)]",
      path: "/voice",
    },
    {
      icon: "📊",
      label: "عرض التقارير",
      gradient: "from-[hsl(258,90%,66%)] to-[hsl(258,90%,54%)]",
      path: "/smart-report",
    },
  ];

  return (
    <div className="px-4 pt-3 pb-28 space-y-4" dir="rtl">
      {user && (
        <CompleteProfileDialog open={showProfileDialog} onClose={() => setShowProfileDialog(false)} user={user} />
      )}

      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between h-[56px]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/profile")}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            <span className="text-sm font-bold text-primary">
              {displayName.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
            </span>
          </button>
          <h1 className="text-lg font-bold text-foreground">
            أهلاً {displayName.split(' ')[0]} 👋
          </h1>
        </div>
        <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Loading */}
      {loadingTx && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loadingTx && (
        <>
          {/* ── Hero Smart Input ── */}
          <div
            className="relative rounded-[20px] p-[2px] animate-fade-in"
            style={{
              background: "linear-gradient(135deg, hsl(152,76%,36%), hsl(160,84%,60%))",
              boxShadow: "0 8px 24px hsla(152,76%,36%,0.15)",
            }}
          >
            <div className="bg-card rounded-[18px] p-4 space-y-3">
              {/* Header inside input */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-foreground">مساعدك المالي الذكي</span>
                </div>
                <span className="text-base">✨</span>
              </div>

              {/* Shortcut Chips */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: "💰 قبضت", value: "قبضت" },
                  { label: "💸 دفعت", value: "دفعت" },
                  { label: "🛒 اشتريت", value: "اشتريت" },
                  { label: "🧾 صرفت", value: "صرفت" },
                ].map((action) => (
                  <button
                    key={action.value}
                    onClick={() => setInputValue((prev) => prev.trim() ? prev.trim() + " " + action.value + " " : action.value + " ")}
                    className="px-2.5 py-1 rounded-full bg-secondary text-[11px] font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Input Row */}
              <div id="smart-input-bar" className="flex items-end gap-2 min-h-[48px] bg-secondary/40 rounded-2xl px-2 py-1.5" dir="rtl">
                <button
                  onClick={handleSend}
                  disabled={sending || !inputValue.trim()}
                  className="flex-shrink-0 w-11 h-11 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-primary/25"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 text-primary-foreground" />
                  )}
                </button>
                <MentionInput
                  value={inputValue}
                  onChange={setInputValue}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder='جرّب: "دفعت 500 شيكل لأحمد" أو اسأل عن أرباحك 💬'
                  className="flex-1 min-w-0 h-11 bg-transparent rounded-xl px-2 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none"
                  userId={user?.id}
                />
                <button
                  onClick={() => navigate("/voice")}
                  className="flex-shrink-0 w-11 h-11 rounded-full bg-[hsl(217,91%,60%)]/10 flex items-center justify-center hover:bg-[hsl(217,91%,60%)]/20 transition-colors active:scale-95"
                >
                  <Mic className="h-5 w-5 text-[hsl(217,91%,60%)]" />
                </button>
              </div>
            </div>
          </div>

          {/* ── 2×2 Quick Actions Grid ── */}
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className={`relative flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-gradient-to-br ${action.gradient} text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-[0.98] ${action.primary ? "scale-[1.03]" : ""}`}
                style={{ minHeight: "100px" }}
              >
                <span className="text-3xl">{action.icon}</span>
                <span className="text-sm font-semibold">{action.label}</span>
                <ArrowLeft className="absolute bottom-3 left-3 h-4 w-4 opacity-60" />
              </button>
            ))}
          </div>

          {/* ── Motivational Tip (empty state) ── */}
          {isEmpty && !tipDismissed && (
            <button
              onClick={() => {
                setTipDismissed(true);
                localStorage.setItem("tip_dismissed", "true");
              }}
              className="w-full text-right rounded-xl border border-dashed border-warning p-4 flex items-start gap-3 transition-all hover:bg-warning/5 active:scale-[0.99]"
              style={{ backgroundColor: "hsl(48,100%,97%)" }}
            >
              <span className="text-xl flex-shrink-0">💡</span>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(32,81%,29%)" }}>
                ابدأ بإضافة أول عملية وسيُبنى دفترك المحاسبي تلقائياً!
              </p>
            </button>
          )}

          {/* ═══════════════════════════════════════ */}
          {/*  ACTIVE STATE                           */}
          {/* ═══════════════════════════════════════ */}
          {hasTransactions && (
            <div className="space-y-5">
              {/* Compact Summary - 2 cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardContent className="p-4 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <Wallet className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">💰 الرصيد الحالي</p>
                    <p className="text-lg font-bold text-foreground tabular-nums">₪{animCash.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardContent className="p-4 text-center bg-gradient-to-br from-accent/20 via-accent/10 to-transparent">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 rounded-xl bg-accent">
                        <TrendingUp className="h-4 w-4 text-accent-foreground" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">📈 صافي هذا الشهر</p>
                    <p className={`text-lg font-bold tabular-nums ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                      ₪{animProfit.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Last 3 Transactions */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">آخر النشاط</h2>
                  <button
                    onClick={() => navigate("/transactions")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    عرض كل النشاط
                  </button>
                </div>
                <div className="space-y-1.5">
                  {transactions.slice(0, 3).map((tx) => {
                    const isIncome = tx.fields["Transaction Type"] === "سند قبض";
                    const isExpense = tx.fields["Transaction Type"] === "سند صرف";
                    return (
                      <div key={tx.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-card shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isIncome ? "bg-primary/10" : isExpense ? "bg-destructive/10" : "bg-secondary"}`}>
                            <span className="text-xs">{isIncome ? "💰" : isExpense ? "💸" : "📄"}</span>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              {tx.fields.Description || tx.fields["Transaction Type"] || "عملية"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{tx.fields.Date || ""}</p>
                          </div>
                        </div>
                        <p className={`text-xs font-bold tabular-nums ${isIncome ? "text-primary" : isExpense ? "text-destructive" : "text-foreground"}`}>
                          {isIncome ? "+" : isExpense ? "-" : ""}₪{(tx.fields.Amount || 0).toLocaleString()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Insight Card */}
              <Card className="border-0 shadow-sm bg-gradient-to-l from-primary/5 via-background to-accent/10">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-primary mb-0.5">💡 ملاحظة اليوم</p>
                    <p className="text-xs text-foreground leading-relaxed">{aiInsight}</p>
                  </div>
                </CardContent>
              </Card>

              {/* AI Smart Report CTA */}
              <button
                onClick={() => navigate("/smart-report")}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-primary/15 via-primary/10 to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="text-right flex-1">
                  <p className="text-sm font-bold text-foreground">اسأل الذكاء الاصطناعي عن وضعك المالي</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">تقارير وتحليلات فورية بلغتك</p>
                </div>
              </button>

              {/* Database Command Section */}
              <div id="database-command-section" className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-accent-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">إدارة البيانات</h2>
                </div>
                <Card className="border-0 shadow-sm bg-gradient-to-l from-accent/20 to-background">
                  <CardContent className="p-2.5">
                    <div className="flex items-center gap-2" dir="ltr">
                      <button
                        onClick={() => navigate("/voice")}
                        className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent flex items-center justify-center hover:opacity-80 transition-colors active:scale-95"
                      >
                        <Mic className="h-4 w-4 text-accent-foreground" />
                      </button>
                      <input
                        type="text"
                        value={dbCommand}
                        onChange={(e) => setDbCommand(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleDbCommand()}
                        placeholder="أضف زبون، احذف حساب، عدّل اسم..."
                        className="flex-1 h-9 bg-secondary/60 rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-accent/40"
                        dir="rtl"
                      />
                      <button
                        onClick={handleDbCommand}
                        disabled={dbSending || !dbCommand.trim()}
                        className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {dbSending ? (
                          <Loader2 className="h-4 w-4 text-accent-foreground animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 text-accent-foreground" />
                        )}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Smart Reports */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">التقارير الذكية</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { emoji: "👤", label: "كشف حساب زبون", query: "أعطني كشف حساب" },
                    { emoji: "📊", label: "أرباح وخسائر", query: "كم إجمالي أرباحي وخسائري؟" },
                    { emoji: "📦", label: "مخزون وكميات", query: "أعطني تقرير المخزون والكميات المتوفرة" },
                    { emoji: "💰", label: "مصاريف اليوم", query: "كشف المعاملات اليومية مصاريف ومقبوضات" },
                  ].map((report) => (
                    <button
                      key={report.label}
                      onClick={() => navigate(`/smart-report?q=${encodeURIComponent(report.query)}`)}
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/10 text-right hover:bg-primary/10 hover:border-primary/20 transition-all active:scale-[0.98]"
                    >
                      <span className="text-base">{report.emoji}</span>
                      <span className="text-[11px] font-medium text-foreground leading-tight">{report.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showSetupWizard && user && !showPasskeyOnboarding && (
        <SetupWizard
          userId={user.id}
          onComplete={() => {
            setShowSetupWizard(false);
            setProfileData(prev => prev ? { ...prev, setup_completed: true } : prev);
          }}
        />
      )}

      {showPasskeyOnboarding && (
        <PasskeyOnboarding onComplete={() => setShowPasskeyOnboarding(false)} />
      )}

      {showOnboarding && !showPasskeyOnboarding && !showSetupWizard && (
        <OnboardingFlow
          onComplete={() => setShowOnboarding(false)}
          onFocusInput={() => {
            const input = document.querySelector<HTMLInputElement>("#smart-input-bar input");
            input?.focus();
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;

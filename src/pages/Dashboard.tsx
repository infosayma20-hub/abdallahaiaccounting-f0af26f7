import { useState, useEffect, useMemo } from "react";
import { Wallet, Mic, Send, Loader2, Bell, Sparkles, Database, FileText, Package, TrendingUp, TrendingDown, ArrowLeft, ChevronDown, DollarSign, CreditCard, PiggyBank, Users, UserPlus, Plus, Paperclip, BarChart3, Clock, AlertTriangle } from "lucide-react";
import MentionInput from "@/components/MentionInput";
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
import MiniSparkline from "@/components/MiniSparkline";
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
  const rotatingPlaceholder = useRotatingPlaceholder();

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
        if (!data.setup_completed) setShowSetupWizard(true);
      }
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("passkey_onboarding_done");
    if (!done && browserSupportsWebAuthn()) setShowPasskeyOnboarding(true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("onboarding_completed");
    if (!done) setShowOnboarding(true);
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
    if (isOAuth) setShowProfileDialog(true);
  }, [user]);

  useEffect(() => {
    const ensureAirtableClient = async () => {
      if (!user || localStorage.getItem(`airtable_synced_${user.id}`)) return;
      try {
        await supabase.functions.invoke("airtable-create-client", {
          body: { clientName: user.id, contactEmail: user.email || "", phoneNumber: user.user_metadata?.phone || "", companyName: user.user_metadata?.company_name || "", address: user.user_metadata?.address || "", country: user.user_metadata?.country || "", workField: user.user_metadata?.work_field || "" },
        });
        localStorage.setItem(`airtable_synced_${user.id}`, "true");
      } catch (err) { console.error("Failed to sync user to Airtable:", err); }
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
      } catch (err) { console.error("Error fetching transactions:", err); }
      finally { setLoadingTx(false); }
    };
    fetchTx();
  }, [user]);

  const revenue = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const expenses = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Expenses").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalIncome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند قبض").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalOutcome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند صرف").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const cashBalance = totalIncome - totalOutcome;
  const netProfit = revenue - expenses;
  const receivables = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const payables = transactions.filter((tx) => tx.fields["Credit Account Rollup"] === "Liability").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  const animCash = useCountUp(cashBalance, 1200, !loadingTx);
  const animProfit = useCountUp(netProfit, 1200, !loadingTx);
  const animReceivables = useCountUp(receivables, 1200, !loadingTx);
  const animPayables = useCountUp(payables, 1200, !loadingTx);

  const aiInsight = useMemo(() => {
    if (transactions.length === 0) return { text: "ابدأ بإضافة أول عملية لنقدّم لك تحليلات ذكية.", score: 0, efficiency: 0 };
    const collectionRate = totalIncome > 0 && receivables > 0 ? Math.round((totalIncome / (totalIncome + receivables)) * 100) : 0;
    let text = "";
    if (expenses > revenue && revenue > 0) {
      const pct = Math.round(((expenses - revenue) / revenue) * 100);
      text = `⚠️ مصاريفك تتجاوز إيراداتك بنسبة ${pct}% — حاول تقليل النفقات`;
    } else if (revenue > expenses && expenses > 0) {
      const margin = Math.round(((revenue - expenses) / revenue) * 100);
      text = `📊 نسبة تحصيل الذمم هذا الشهر ${collectionRate}%.\n⚠️ يوجد ذمم مدينة بحاجة متابعة.\n💡 تحسين التحصيل سيرفع التدفق النقدي بنسبة ${margin}%.`;
    } else if (expenses > 0 && revenue === 0) {
      text = "💡 لديك مصروفات فقط — سجّل إيراداتك لتحليل أفضل";
    } else {
      text = "تحصيلاتك جيدة — تابع التسجيل للحصول على رؤى أعمق 👌";
    }
    return { text, score: Math.min(collectionRate + 20, 100), efficiency: collectionRate };
  }, [transactions, expenses, revenue, totalIncome, receivables]);

  const sparkData = useMemo(() => {
    const base = [30, 45, 35, 60, 50, 70, 65];
    return {
      receivables: base.map((v) => v + Math.random() * 20),
      payables: base.map((v) => v * 0.6 + Math.random() * 15),
      cash: base.map((v) => v * 1.2 + Math.random() * 25),
      profit: base.map((v) => v * 0.8 + Math.random() * 30),
    };
  }, []);

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
        } catch { failCount++; }
      }
      if (failCount === 0) {
        toast({ title: `تم إرسال ${successCount > 1 ? successCount + " عمليات" : "العملية"} بنجاح ✅`, description: "جاري المعالجة بالذكاء الاصطناعي" });
      } else {
        toast({ title: `تم إرسال ${successCount} من ${lines.length} عمليات`, description: `فشل ${failCount} عمليات`, variant: "destructive" });
      }
      setInputValue("");
    } catch (err: any) {
      toast({ title: "خطأ في الإرسال", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
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
    } finally { setDbSending(false); }
  };

  const displayName = profileData?.company_name || profileData?.display_name || user?.user_metadata?.company_name || user?.user_metadata?.full_name || "عبدالله";
  const hasTransactions = !loadingTx && transactions.length > 0;

  const kpiCards = [
    { label: "إجمالي الذمم المدينة", value: animReceivables, trend: "+8%", positive: true, icon: TrendingUp, sparkline: sparkData.receivables },
    { label: "إجمالي الذمم الدائنة", value: animPayables, trend: "-3%", positive: false, icon: CreditCard, sparkline: sparkData.payables },
    { label: "النقد المتوفر", value: animCash, trend: "+12%", positive: true, icon: PiggyBank, sparkline: sparkData.cash },
    { label: "صافي الربح الحالي", value: animProfit, trend: netProfit >= 0 ? "+5%" : "-5%", positive: netProfit >= 0, icon: DollarSign, sparkline: sparkData.profit },
  ];

  const quickActions = [
    { icon: Users, label: "إضافة زبون", desc: "اسم + جوال + حد ائتماني", path: "/contacts" },
    { icon: UserPlus, label: "إضافة مورد", desc: "بيانات المورد", path: "/contacts" },
    { icon: Package, label: "إضافة منتج", desc: "سعر شراء – بيع – كمية", path: "/inventory" },
    { icon: Database, label: "إضافة حساب", desc: "حسابات منظمة تلقائياً", path: "/accounts" },
  ];

  return (
    <div className="px-4 pt-3 pb-28 space-y-5" dir="rtl">
      {user && <CompleteProfileDialog open={showProfileDialog} onClose={() => setShowProfileDialog(false)} user={user} />}

      {/* ═══ 1. HEADER ═══ */}
      <div className="flex items-center justify-between h-[56px]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/profile")} className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{displayName.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}</span>
          </button>
          <div>
            <div className="flex items-center gap-1">
              <h1 className="text-base font-bold text-foreground">أهلاً {displayName.split(' ')[0]} 👋</h1>
            </div>
            <p className="text-[10px] text-muted-foreground">وضعك المالي اليوم جاهز للتحليل</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors">
            <Bell className="h-4.5 w-4.5 text-muted-foreground" />
          </button>
          <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary text-xs text-muted-foreground hover:bg-muted transition-colors">
            <ChevronDown className="h-3 w-3" />
            <span>شركتي</span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {loadingTx && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loadingTx && (
        <>
          {/* ═══ 2. KPI CARDS ═══ */}
          <div className="grid grid-cols-2 gap-3">
            {kpiCards.map((kpi) => (
              <div key={kpi.label} className="premium-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <kpi.icon className={`h-4 w-4 ${kpi.positive ? "text-primary" : "text-destructive"}`} />
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${kpi.positive ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                    {kpi.trend}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className={`text-lg font-bold tabular-nums ${kpi.positive ? "glow-green" : "text-destructive"}`}>
                  ₪{kpi.value.toLocaleString()}
                </p>
                <MiniSparkline data={kpi.sparkline} color={kpi.positive ? "hsl(152, 72%, 40%)" : "hsl(0, 72%, 51%)"} />
              </div>
            ))}
          </div>

          {/* ═══ 3. AI FINANCIAL ANALYSIS BOX ═══ */}
          <div className="relative rounded-[18px] p-[1.5px]" style={{ background: "linear-gradient(135deg, hsl(152,72%,40%), hsl(168,76%,42%))" }}>
            <div className="bg-card rounded-[17px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse-glow" />
                  <span className="text-sm font-bold text-foreground">تحليل المركز المالي</span>
                </div>
                <span className="text-[10px] text-muted-foreground">AI</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{aiInsight.text}</p>
              
              {/* Score & Efficiency bars */}
              {hasTransactions && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">انضباط الدفع</span>
                    <span className="text-primary font-bold">{aiInsight.score}/100</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${aiInsight.score}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">كفاءة التحصيل</span>
                    <span className="text-accent font-bold">{aiInsight.efficiency}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-1000" style={{ width: `${aiInsight.efficiency}%` }} />
                  </div>
                </div>
              )}

              <button
                onClick={() => navigate("/smart-report?q=" + encodeURIComponent("اقترح خطة تحصيل للذمم المتأخرة"))}
                className="w-full py-2.5 rounded-xl neon-border bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-all active:scale-[0.98]"
              >
                ✨ اقترح خطة تحصيل
              </button>
            </div>
          </div>

          {/* ═══ 4. SMART ASSISTANT BOX ═══ */}
          <div className="premium-card p-4 space-y-3 glow-border">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">المساعد المالي الذكي</span>
            </div>

            {/* Input */}
            <div id="smart-input-bar" className="flex items-end gap-2 min-h-[52px] bg-secondary/60 rounded-2xl px-2.5 py-2" dir="rtl">
              <button onClick={handleSend} disabled={sending || !inputValue.trim()} className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-40">
                {sending ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
              </button>
              <MentionInput
                value={inputValue}
                onChange={setInputValue}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder='شو صار معك اليوم مالياً؟ سجل عملياتك بكلامك…'
                className="flex-1 min-w-0 h-10 bg-transparent rounded-xl px-2 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none"
                userId={user?.id}
              />
              <button onClick={() => navigate("/voice")} className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95">
                <Mic className="h-5 w-5 text-primary" />
              </button>
            </div>

            {/* Suggestion chips */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                "قبضت من أحمد 5000 شيكل",
                "دفعت إيجار المكتب",
                "سجل فاتورة مبيعات",
                "كشف حساب عميل",
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => setInputValue(chip)}
                  className="px-2.5 py-1.5 rounded-full bg-secondary text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 neon-border"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* ═══ 5. QUICK ACTIONS – اطلب وتمنى ═══ */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">اطلب وتمنى ✨</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  className="premium-card p-4 text-right space-y-1.5 neon-border hover:bg-secondary/50 transition-all active:scale-[0.98]"
                >
                  <action.icon className="h-5 w-5 text-primary mb-1" />
                  <p className="text-xs font-semibold text-foreground">{action.label}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ═══ 6. LAST TRANSACTIONS ═══ */}
          {hasTransactions && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">آخر النشاط</h2>
                <button onClick={() => navigate("/transactions")} className="text-[10px] font-medium text-primary hover:underline">عرض الكل</button>
              </div>
              <div className="space-y-1.5">
                {transactions.slice(0, 3).map((tx) => {
                  const isIncome = tx.fields["Transaction Type"] === "سند قبض";
                  const isExpense = tx.fields["Transaction Type"] === "سند صرف";
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-3 px-3 premium-card">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isIncome ? "bg-primary/15" : isExpense ? "bg-destructive/15" : "bg-secondary"}`}>
                          <span className="text-xs">{isIncome ? "💰" : isExpense ? "💸" : "📄"}</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground line-clamp-1">{tx.fields.Description || tx.fields["Transaction Type"] || "عملية"}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.fields.Date || ""}</p>
                        </div>
                      </div>
                      <p className={`text-xs font-bold tabular-nums ${isIncome ? "text-primary glow-green" : isExpense ? "text-destructive" : "text-foreground"}`}>
                        {isIncome ? "+" : isExpense ? "-" : ""}₪{(tx.fields.Amount || 0).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ 7. SMART REPORTS ═══ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">التقارير الذكية</h2>
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
                  className="flex items-center gap-2 p-3 premium-card neon-border text-right hover:bg-secondary/50 transition-all active:scale-[0.98]"
                >
                  <span className="text-base">{report.emoji}</span>
                  <span className="text-[11px] font-medium text-foreground leading-tight">{report.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ═══ AI CTA ═══ */}
          <button
            onClick={() => navigate("/smart-report")}
            className="w-full flex items-center gap-3 p-4 rounded-[18px] glow-border neon-border bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary animate-pulse-glow" />
            </div>
            <div className="text-right flex-1">
              <p className="text-sm font-bold text-foreground">اسأل AI عن وضعك المالي</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">تقارير وتحليلات فورية بلغتك</p>
            </div>
          </button>
        </>
      )}

      {/* ── Dialogs & Wizards ── */}
      {showSetupWizard && user && !showPasskeyOnboarding && (
        <SetupWizard userId={user.id} onComplete={() => { setShowSetupWizard(false); setProfileData(prev => prev ? { ...prev, setup_completed: true } : prev); }} />
      )}
      {showPasskeyOnboarding && <PasskeyOnboarding onComplete={() => setShowPasskeyOnboarding(false)} />}
      {showOnboarding && !showPasskeyOnboarding && !showSetupWizard && (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} onFocusInput={() => { const input = document.querySelector<HTMLInputElement>("#smart-input-bar input"); input?.focus(); }} />
      )}
    </div>
  );
};

export default Dashboard;

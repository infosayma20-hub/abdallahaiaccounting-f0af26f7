import { useState, useEffect } from "react";
import { FileText, Wallet, Mic, Send, Loader2, LogOut, Sparkles, Database, BookOpen, Receipt, Users, Package, PlusCircle, BookOpenCheck } from "lucide-react";
import MentionInput from "@/components/MentionInput";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCountUp } from "@/hooks/useCountUp";
import { useRotatingPlaceholder } from "@/hooks/useRotatingPlaceholder";
import PasskeyOnboarding from "@/components/PasskeyOnboarding";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";
import OnboardingFlow from "@/components/OnboardingFlow";
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
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const rotatingPlaceholder = useRotatingPlaceholder();

  // Show passkey onboarding on first login
  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("passkey_onboarding_done");
    if (!done && browserSupportsWebAuthn()) {
      setShowPasskeyOnboarding(true);
    }
  }, [user]);

  // Show onboarding for first-time users
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

  // Sync user to Airtable
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

  // Fetch transactions
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

  // Count-up animations
  const animCash = useCountUp(cashBalance, 1200, !loadingTx);
  const animProfit = useCountUp(netProfit, 1200, !loadingTx);

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

  const displayName = user?.user_metadata?.company_name || user?.user_metadata?.full_name || "عميل";
  const hasTransactions = !loadingTx && transactions.length > 0;
  const isEmpty = !loadingTx && transactions.length === 0;

  return (
    <div className="px-4 pt-6 pb-28 space-y-6" dir="rtl">
      {user && (
        <CompleteProfileDialog open={showProfileDialog} onClose={() => setShowProfileDialog(false)} user={user} />
      )}

      {/* Hero Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
            <span className="text-base font-bold text-primary">
              {displayName.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              مرحباً {displayName} 👋
            </h1>
            <p className="text-xs text-muted-foreground">
              {isEmpty ? "لنبدأ بإضافة أول عملية مالية" : "ملخصك المالي اليوم"}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
          title="تسجيل الخروج"
        >
          <LogOut className="h-4 w-4 text-destructive" />
        </button>
      </div>

      {/* Loading State */}
      {loadingTx && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* EMPTY STATE */}
      {/* ═══════════════════════════════════════ */}
      {isEmpty && (
        <div className="space-y-8">
          {/* Hero Illustration */}
          <div className="flex flex-col items-center text-center pt-4 space-y-4">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/15 to-accent/20 flex items-center justify-center">
              <BookOpenCheck className="h-12 w-12 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">لا توجد حركات حتى الآن</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                أضف أول عملية وسيبدأ نظامك المحاسبي بالعمل فوراً
              </p>
            </div>
          </div>

          {/* Main CTA */}
          <Button
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>("#smart-input-bar input, #smart-input-bar textarea");
              if (input) {
                input.focus();
                input.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
            className="w-full h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/25 gap-2"
            size="lg"
          >
            <PlusCircle className="h-5 w-5" />
            إضافة أول عملية
          </Button>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => navigate("/voice")}
              className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-all active:scale-[0.97]"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-foreground">إدخال صوتي</span>
            </button>
            <button
              onClick={() => navigate("/invoices")}
              className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-warning/5 border border-warning/10 hover:bg-warning/10 transition-all active:scale-[0.97]"
            >
              <div className="w-11 h-11 rounded-xl bg-warning/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-warning" />
              </div>
              <span className="text-xs font-medium text-foreground">إنشاء فاتورة</span>
            </button>
            <button
              onClick={() => navigate("/inventory")}
              className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-accent/50 border border-accent hover:bg-accent transition-all active:scale-[0.97]"
            >
              <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center">
                <Package className="h-5 w-5 text-accent-foreground" />
              </div>
              <span className="text-xs font-medium text-foreground">إضافة منتج</span>
            </button>
          </div>

          {/* Smart Input for Empty State */}
          <div className="space-y-3">
            <Card id="smart-input-bar" className="border-0 shadow-lg bg-gradient-to-l from-primary/5 to-background">
              <CardContent className="px-3 py-2.5">
                <div className="flex items-end gap-2 min-h-[44px]" dir="rtl">
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
                    placeholder={rotatingPlaceholder}
                    className="flex-1 min-w-0 h-11 bg-secondary/60 rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    userId={user?.id}
                  />
                  <button
                    onClick={() => navigate("/voice")}
                    className="flex-shrink-0 w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95"
                  >
                    <Mic className="h-5 w-5 text-primary" />
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Subtle hint */}
          <p className="text-center text-xs text-muted-foreground">
            💡 يمكنك دائماً استخدام الذكاء الاصطناعي لكتابة العملية بلغتك
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* ACTIVE STATE */}
      {/* ═══════════════════════════════════════ */}
      {hasTransactions && (
        <div className="space-y-6">
          {/* Summary Cards - Only 2 */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-4 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
                <div className="flex justify-center mb-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Wallet className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  ₪{animCash.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">محدّث الآن</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-4 text-center bg-gradient-to-br from-accent/20 via-accent/10 to-transparent">
                <div className="flex justify-center mb-3">
                  <div className="p-2.5 rounded-xl bg-accent">
                    <Sparkles className="h-4 w-4 text-accent-foreground" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">صافي الربح هذا الشهر</p>
                <p className={`text-lg font-bold tabular-nums ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  ₪{animProfit.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">{netProfit >= 0 ? "أداء إيجابي ✅" : "خسارة ⚠️"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions - Last 5 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">آخر العمليات</h2>
              <button
                onClick={() => navigate("/transactions")}
                className="text-xs font-medium text-primary hover:underline"
              >
                عرض الكل
              </button>
            </div>
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => {
                const isIncome = tx.fields["Transaction Type"] === "سند قبض";
                const isExpense = tx.fields["Transaction Type"] === "سند صرف";
                return (
                  <Card key={tx.id} className="border-0 shadow-sm">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isIncome ? "bg-primary/10" : isExpense ? "bg-destructive/10" : "bg-secondary"}`}>
                          <span className="text-sm">
                            {isIncome ? "💰" : isExpense ? "💸" : "📄"}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground line-clamp-1">
                            {tx.fields.Description || tx.fields["Transaction Type"] || "عملية"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {tx.fields.Date || ""}
                          </p>
                        </div>
                      </div>
                      <p className={`text-sm font-bold tabular-nums ${isIncome ? "text-primary" : isExpense ? "text-destructive" : "text-foreground"}`}>
                        {isIncome ? "+" : isExpense ? "-" : ""}₪{(tx.fields.Amount || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* AI CTA Button */}
          <button
            onClick={() => navigate("/smart-report")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-primary/15 via-primary/10 to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="text-right flex-1">
              <p className="text-sm font-bold text-foreground">اسأل الذكاء الاصطناعي عن وضعك المالي</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">تقارير وتحليلات فورية بلغتك</p>
            </div>
          </button>

          {/* Quick Entry Section */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-foreground text-right">سجّل عملية</h2>

            {/* Shortcut Chips */}
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "💰 قبضت", value: "قبضت" },
                { label: "💸 دفعت", value: "دفعت" },
                { label: "🛒 اشتريت", value: "اشتريت" },
                { label: "🧾 صرفت", value: "صرفت" },
                { label: "🏧 سحبت", value: "سحبت" },
              ].map((action) => (
                <button
                  key={action.value}
                  onClick={() => setInputValue((prev) => prev.trim() ? prev.trim() + " " + action.value + " " : action.value + " ")}
                  className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-transparent hover:border-primary/20"
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Input Card */}
            <Card id="smart-input-bar" className="border-0 shadow-lg bg-gradient-to-l from-primary/5 to-background">
              <CardContent className="px-3 py-2.5">
                <div className="flex items-end gap-2 min-h-[44px]" dir="rtl">
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
                    placeholder={rotatingPlaceholder}
                    className="flex-1 min-w-0 h-11 bg-secondary/60 rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    userId={user?.id}
                  />
                  <button
                    onClick={() => navigate("/voice")}
                    className="flex-shrink-0 w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95"
                  >
                    <Mic className="h-5 w-5 text-primary" />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Smart Transaction Suggestions */}
            {(() => {
              const txSuggestions = [
                { emoji: "💰", text: "استلمت 1200 شيكل من الزبون @سالم يوسف إلى البنك" },
                { emoji: "🛒", text: "اشتريت بضاعة بقيمة 1500 شيكل ودفعنا نقداً" },
                { emoji: "🔄", text: "حولت 2000 شيكل من الصندوق إلى بنك فلسطين" },
              ];
              return (
                <div className="flex flex-wrap gap-1.5">
                  {txSuggestions.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => setInputValue(s.text)}
                      className="px-2.5 py-1 rounded-lg bg-primary/5 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-primary/10"
                    >
                      {s.emoji} {s.text}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Database Command Section */}
          <div id="database-command-section" className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-accent-foreground" />
              <h2 className="text-base font-semibold text-foreground">إدارة البيانات</h2>
            </div>

            <Card className="border-0 shadow-lg bg-gradient-to-l from-accent/30 to-background">
              <CardContent className="p-3">
                <div className="flex items-center gap-2" dir="ltr">
                  <button
                    onClick={() => navigate("/voice")}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent flex items-center justify-center hover:opacity-80 transition-colors active:scale-95"
                  >
                    <Mic className="h-5 w-5 text-accent-foreground" />
                  </button>
                  <input
                    type="text"
                    value={dbCommand}
                    onChange={(e) => setDbCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleDbCommand()}
                    placeholder="أضف زبون، احذف حساب، عدّل اسم..."
                    className="flex-1 h-10 bg-secondary/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-accent/40"
                    dir="rtl"
                  />
                  <button
                    onClick={handleDbCommand}
                    disabled={dbSending || !dbCommand.trim()}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
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

          {/* Smart Reports Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">التقارير الذكية</h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { emoji: "👤", label: "كشف حساب زبون أو مورد", query: "أعطني كشف حساب" },
                { emoji: "📊", label: "كشف أرباح وخسائر", query: "كم إجمالي أرباحي وخسائري؟" },
                { emoji: "📦", label: "كشف مخزون وكميات", query: "أعطني تقرير المخزون والكميات المتوفرة" },
                { emoji: "💰", label: "مصاريف ومقبوضات اليوم", query: "كشف المعاملات اليومية مصاريف ومقبوضات" },
              ].map((report) => (
                <button
                  key={report.label}
                  onClick={() => navigate(`/smart-report?q=${encodeURIComponent(report.query)}`)}
                  className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10 text-right hover:bg-primary/10 hover:border-primary/20 transition-all active:scale-[0.98]"
                >
                  <span className="text-lg">{report.emoji}</span>
                  <span className="text-xs font-medium text-foreground leading-tight">{report.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPasskeyOnboarding && (
        <PasskeyOnboarding onComplete={() => setShowPasskeyOnboarding(false)} />
      )}

      {showOnboarding && !showPasskeyOnboarding && (
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

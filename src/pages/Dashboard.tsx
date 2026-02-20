import { useState, useEffect, useMemo } from "react";
import { FileText, TrendingUp, TrendingDown, Wallet, Mic, ChevronLeft, Send, Loader2, BookOpen, Receipt, LogOut, Users, Sparkles, Database } from "lucide-react";
import MentionInput from "@/components/MentionInput";
import SmartInsightCard from "@/components/SmartInsightCard";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

const cardGradients = [
  "from-blue-500/10 via-blue-400/5 to-transparent",    // الفواتير
  "from-emerald-500/10 via-emerald-400/5 to-transparent", // الرصيد
  "from-teal-500/10 via-teal-400/5 to-transparent",     // الإيرادات
  "from-red-400/10 via-red-300/5 to-transparent",        // المصروفات
];

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
  const unpaidInvoices = transactions.filter((tx) => tx.fields["Transaction Type"] === "فاتورة مبيعات");
  const invoiceTotal = unpaidInvoices.reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  // Count-up animations
  const animInvoice = useCountUp(invoiceTotal, 1200, !loadingTx);
  const animCash = useCountUp(cashBalance, 1200, !loadingTx);
  const animRevenue = useCountUp(revenue, 1200, !loadingTx);
  const animExpenses = useCountUp(expenses, 1200, !loadingTx);

  const summaryCards = [
    {
      title: "الفواتير",
      value: animInvoice,
      subtitle: `${unpaidInvoices.length} فاتورة`,
      icon: FileText,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      progress: unpaidInvoices.length > 0 ? 65 : 0,
      gradient: cardGradients[0],
    },
    {
      title: "الرصيد النقدي",
      value: animCash,
      subtitle: "محدّث الآن",
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      progress: null,
      gradient: cardGradients[1],
    },
    {
      title: "الإيرادات",
      value: animRevenue,
      subtitle: "إجمالي",
      icon: TrendingUp,
      iconBg: "bg-teal-500/10",
      iconColor: "text-teal-600",
      progress: null,
      gradient: cardGradients[2],
    },
    {
      title: "المصروفات",
      value: animExpenses,
      subtitle: "إجمالي",
      icon: TrendingDown,
      iconBg: "bg-red-400/10",
      iconColor: "text-red-500",
      progress: null,
      gradient: cardGradients[3],
    },
  ];

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-transaction", {
        body: { text: inputValue, userId: user?.id, email: user?.email, companyName: user?.user_metadata?.company_name },
      });
      if (error) throw error;
      toast({ title: "تم الإرسال بنجاح ✅", description: "جاري معالجة العملية بالذكاء الاصطناعي" });
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
            <p className="text-xs text-muted-foreground">ملخصك المالي اليوم</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {loadingTx ? (
          <div className="col-span-2 flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          summaryCards.map((card) => (
            <Card
              key={card.title}
              className="border-0 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
            >
              <CardContent className={`p-4 text-center bg-gradient-to-br ${card.gradient}`}>
                <div className="flex justify-center mb-3">
                  <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                    <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{card.title}</p>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  ₪{card.value.toLocaleString()}
                </p>
                {card.progress !== null && card.progress !== undefined && (
                  <div className="mt-2">
                    <Progress value={card.progress} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground mt-1">{card.subtitle}</p>
                  </div>
                )}
                {!card.progress && card.progress !== 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">{card.subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Smart Insight */}
      {!loadingTx && (
        <SmartInsightCard expenses={expenses} revenue={revenue} transactionCount={transactions.length} />
      )}

      {/* Quick Links */}
      <div id="quick-links-section" className="grid grid-cols-3 gap-3">
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          onClick={() => navigate("/transactions")}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-xl bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <p className="text-xs font-semibold text-foreground">المعاملات</p>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          onClick={() => navigate("/accounts")}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-xl bg-accent">
              <BookOpen className="h-5 w-5 text-accent-foreground" />
            </div>
            <p className="text-xs font-semibold text-foreground">الحسابات</p>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          onClick={() => navigate("/contacts")}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-xl bg-warning/10">
              <Users className="h-5 w-5 text-warning" />
            </div>
            <p className="text-xs font-semibold text-foreground">العملاء</p>
          </CardContent>
        </Card>
      </div>

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
            { emoji: "💰", text: "قبضت 1000 شيكل من الزبون @علي حجاج نقداً" },
            { emoji: "💸", text: "دفعت 500 شيكل للمورد @أحمد نصار من الصندوق" },
            { emoji: "🔄", text: "حولت 2000 شيكل من الصندوق إلى بنك فلسطين" },
            { emoji: "💳", text: "سددت 750 شيكل للمورد @خالد حسين عبر البنك" },
            { emoji: "💰", text: "استلمت 1200 شيكل من الزبون @سالم يوسف إلى البنك" },
            { emoji: "⚡", text: "دفعت مصاريف كهرباء 300 شيكل من البنك" },
            { emoji: "🏧", text: "سحبت 400 شيكل من البنك إلى الصندوق" },
            { emoji: "🛒", text: "اشتريت بضاعة بقيمة 1500 شيكل ودفعنا نقداً" },
            { emoji: "🧾", text: "صرفت 200 شيكل بنزين من الصندوق" },
            { emoji: "💸", text: "دفعت إيجار المحل 1500 شيكل من البنك" },
          ];
          const minute = Math.floor(new Date().getMinutes() / 10);
          const shuffled = [...txSuggestions].sort((a, b) => {
            const hA = (a.text.charCodeAt(5) * 7 + minute) % 50;
            const hB = (b.text.charCodeAt(5) * 7 + minute) % 50;
            return hA - hB;
          });
          return (
            <div className="flex flex-wrap gap-1.5">
              {shuffled.slice(0, 3).map((s) => (
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

        {/* Suggested Amounts */}
        <div className="flex gap-1.5 flex-wrap">
          {[10, 20, 30, 50, 100, 200, 500, 1000].map((amount) => (
            <button
              key={amount}
              onClick={() => setInputValue((prev) => {
                const match = prev.match(/(\d+)/);
                const currentNum = match ? parseInt(match[1]) : 0;
                const textPart = prev.replace(/\d+/g, '').trim();
                return textPart + ` ${currentNum + amount}`;
              })}
              className="px-2 py-1 rounded-lg bg-secondary text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
            >
              {amount.toLocaleString()}
            </button>
          ))}
        </div>

        {/* Currency Buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {["شيكل", "دولار", "دينار", "يورو", "جنيه مصري", "جنيه استرليني"].map((currency) => (
            <button
              key={currency}
              onClick={() => setInputValue((prev) => prev.trim() + ` ${currency}`)}
              className="px-2.5 py-1 rounded-lg bg-muted/50 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
            >
              {currency}
            </button>
          ))}
        </div>

        {/* Suggested Expense Names */}
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">مصاريف يومية</p>
          <div className="flex flex-wrap gap-1.5">
            {["بنزين", "مواصلات", "أكل", "ضيافة", "قرطاسية", "تنظيف", "صيانة", "بضاعة"].map((name) => (
              <button
                key={name}
                onClick={() => setInputValue((prev) => prev.trim() + ` ${name}`)}
                className="px-2.5 py-1 rounded-lg bg-muted/50 text-[11px] text-muted-foreground hover:bg-warning/10 hover:text-warning transition-all active:scale-95"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
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

        {(() => {
          const dbSuggestions = [
            // Contacts
            { emoji: "👥", text: "أضف زبون باسم علي حجاج ورقم 0599311885", cat: "contact" },
            { emoji: "👥", text: "أضف مورد باسم أحمد نصار", cat: "contact" },
            { emoji: "👥", text: "أضف جهة اتصال شركة القدس للتجارة", cat: "contact" },
            { emoji: "🗑️", text: "احذف جهة الاتصال محمد عبد الرحمن", cat: "contact" },
            // Accounts
            { emoji: "🏦", text: "أضف حساب بنك فلسطين ضمن الأصول", cat: "account" },
            { emoji: "🏦", text: "أنشئ حساب صندوق رئيسي", cat: "account" },
            { emoji: "🏦", text: "أضف حساب مصاريف تسويق", cat: "account" },
            { emoji: "✏️", text: "عدّل اسم حساب صندوق إلى صندوق الفرع", cat: "account" },
            { emoji: "🗑️", text: "احذف حساب غير مستخدم", cat: "account" },
            // Products
            { emoji: "📦", text: "أضف صنف طحين 50 كيلو بسعر 120 شيكل", cat: "product" },
            { emoji: "📦", text: "أضف منتج كفر موبايل بسعر 35 شيكل", cat: "product" },
            { emoji: "📦", text: "عدل سعر منتج طحين إلى 130 شيكل", cat: "product" },
            { emoji: "📦", text: "حدّث كمية منتج كرتونة مياه إلى 40", cat: "product" },
            { emoji: "🧸", text: "أضف صنف لعبة أطفال تصنيف ألعاب سعر شراء 80 شيكل وسعر بيع 120 شيكل", cat: "product" },
          ];
          // Pick 1 from each category + 1 random
          const cats = ["contact", "account", "product"];
          const minute = Math.floor(new Date().getMinutes() / 5);
          const picked: typeof dbSuggestions = [];
          cats.forEach((cat) => {
            const items = dbSuggestions.filter((s) => s.cat === cat);
            const idx = (minute * cat.charCodeAt(0)) % items.length;
            picked.push(items[idx]);
          });
          // Add one more random
          const remaining = dbSuggestions.filter((s) => !picked.includes(s));
          const extraIdx = (minute * 13) % remaining.length;
          picked.push(remaining[extraIdx]);
          return (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((s) => (
                <button
                  key={s.text}
                  onClick={() => setDbCommand(s.text)}
                  className="px-2.5 py-1 rounded-lg bg-muted/50 text-[11px] text-muted-foreground hover:bg-accent/20 hover:text-accent-foreground transition-all active:scale-95"
                >
                  {s.emoji} {s.text}
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* P&L Quick Link */}
      <Card
        id="profit-loss-card"
        className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
        onClick={() => navigate("/profit-loss")}
      >
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">الأرباح والخسائر</p>
              <p className="text-xs text-muted-foreground">عرض التقرير الشهري</p>
            </div>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>

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

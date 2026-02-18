import { useState, useEffect, useMemo } from "react";
import { FileText, TrendingUp, TrendingDown, Wallet, Mic, ChevronLeft, Send, Loader2, BookOpen, Receipt, LogOut, Users, Sparkles, Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import EnablePasskey from "@/components/EnablePasskey";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";

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
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);

  // Check if OAuth user needs to complete profile
  useEffect(() => {
    if (!user) return;
    const profileCompleted = localStorage.getItem(`profile_completed_${user.id}`);
    const alreadySynced = localStorage.getItem(`airtable_synced_${user.id}`);
    if (!profileCompleted && !alreadySynced) {
      const isOAuth = user.app_metadata?.provider !== "email";
      if (isOAuth) {
        setShowProfileDialog(true);
      }
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

  // Fetch transactions for this client
  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoadingTx(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
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

  // Compute summary from transactions
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

  const unpaidInvoices = transactions.filter(
    (tx) => tx.fields["Transaction Type"] === "فاتورة مبيعات"
  );

  const invoiceTotal = unpaidInvoices.reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  const summaryCards = [
    {
      title: "الفواتير",
      value: `₪${invoiceTotal.toLocaleString()}`,
      subtitle: `${unpaidInvoices.length} فاتورة`,
      icon: FileText,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      progress: unpaidInvoices.length > 0 ? 65 : 0,
    },
    {
      title: "الرصيد النقدي",
      value: `₪${cashBalance.toLocaleString()}`,
      subtitle: "محدّث الآن",
      icon: Wallet,
      iconBg: "bg-accent",
      iconColor: "text-accent-foreground",
      progress: null,
    },
    {
      title: "الإيرادات",
      value: `₪${revenue.toLocaleString()}`,
      subtitle: "إجمالي",
      icon: TrendingUp,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      trend: null,
      trendUp: true,
    },
    {
      title: "المصروفات",
      value: `₪${expenses.toLocaleString()}`,
      subtitle: "إجمالي",
      icon: TrendingDown,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      trend: null,
      trendUp: false,
    },
  ];

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-transaction", {
        body: {
          text: inputValue,
          userId: user?.id,
          email: user?.email,
          companyName: user?.user_metadata?.company_name,
        },
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
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-command`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ command: dbCommand, clientId: user?.id }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل تنفيذ الأمر");
      if (data.success) {
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

  return (
    <div className="px-4 pt-6 space-y-6" dir="rtl">
      {user && (
        <CompleteProfileDialog
          open={showProfileDialog}
          onClose={() => setShowProfileDialog(false)}
          user={user}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">
              {user?.user_metadata?.company_name
                ? user.user_metadata.company_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')
                : user?.email?.[0]?.toUpperCase() || 'ع'}
            </span>
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">
              {user?.user_metadata?.company_name || 'عميل'}
            </h1>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
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
            <Card key={card.title} className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="flex justify-center mb-3">
                  <div className={`p-2 rounded-lg ${card.iconBg}`}>
                    <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{card.title}</p>
                <p className="text-lg font-bold text-foreground">{card.value}</p>
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

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-3">
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/transactions")}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <p className="text-xs font-semibold text-foreground">المعاملات</p>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/accounts")}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-accent">
              <BookOpen className="h-5 w-5 text-accent-foreground" />
            </div>
            <p className="text-xs font-semibold text-foreground">الحسابات</p>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/contacts")}
        >
          <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-warning/10">
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
        <Card className="border-0 shadow-md bg-gradient-to-l from-primary/5 to-background">
          <CardContent className="p-3">
            <div className="flex items-center gap-2" dir="ltr">
              <button
                onClick={() => navigate("/voice")}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95"
              >
                <Mic className="h-5 w-5 text-primary" />
              </button>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="اكتب أو تكلم… مثال: قبضت 500 من أحمد"
                className="flex-1 h-10 bg-secondary/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20"
                dir="rtl"
              />
              <button
                onClick={handleSend}
                disabled={sending || !inputValue.trim()}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                ) : (
                  <Send className="h-4 w-4 text-primary-foreground" />
                )}
              </button>
            </div>
          </CardContent>
        </Card>

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
              className="px-2 py-1 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
            >
              {amount.toLocaleString()}₪
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
                className="px-2.5 py-1 rounded-md bg-muted/50 text-[11px] text-muted-foreground hover:bg-warning/10 hover:text-warning transition-all active:scale-95"
              >
                {name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">مصاريف شهرية</p>
          <div className="flex flex-wrap gap-1.5">
            {["إيجار", "كهرباء", "مياه", "إنترنت", "هاتف", "رواتب", "تأمين", "إعلان"].map((name) => (
              <button
                key={name}
                onClick={() => setInputValue((prev) => prev.trim() + ` ${name}`)}
                className="px-2.5 py-1 rounded-md bg-muted/50 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Examples */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-[11px] text-muted-foreground">أمثلة سريعة</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "قبضت 500 من أحمد",
              "دفعت كهرباء 100",
              "اشتريت بضاعة 1500",
              "صرفت بنزين 50",
            ].map((example) => (
              <button
                key={example}
                onClick={() => setInputValue(example)}
                className="px-2.5 py-1 rounded-md bg-muted/50 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Database Command Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-accent-foreground" />
          <h2 className="text-base font-semibold text-foreground">إدارة البيانات</h2>
        </div>

        <Card className="border-0 shadow-md bg-gradient-to-l from-accent/30 to-background">
          <CardContent className="p-3">
            <div className="flex items-center gap-2" dir="ltr">
              <button
                onClick={() => navigate("/voice")}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-accent flex items-center justify-center hover:opacity-80 transition-colors active:scale-95"
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
                className="flex-shrink-0 w-10 h-10 rounded-full bg-accent flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
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

        {/* Command Examples */}
        <div className="flex flex-wrap gap-1.5">
          {[
            "أضف الزبون علي حجاج",
            "أضف حساب بنك فلسطين",
            "احذف الزبون محمد",
            "عدّل اسم الحساب صندوق",
          ].map((example) => (
            <button
              key={example}
              onClick={() => setDbCommand(example)}
              className="px-2.5 py-1 rounded-md bg-muted/50 text-[11px] text-muted-foreground hover:bg-accent/20 hover:text-accent-foreground transition-all active:scale-95"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* P&L Quick Link */}
      <Card
        className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => navigate("/profit-loss")}
      >
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
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

      {/* Face ID */}
      <EnablePasskey />
    </div>
  );
};

export default Dashboard;

import { useState } from "react";
import { FileText, TrendingUp, TrendingDown, Wallet, Mic, ChevronLeft, Send, Loader2, BookOpen, Receipt, LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const summaryCards = [
  {
    title: "الفواتير",
    value: "₪12,500",
    subtitle: "3 غير مدفوعة",
    icon: FileText,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    progress: 65,
  },
  {
    title: "الرصيد النقدي",
    value: "₪34,200",
    subtitle: "محدّث اليوم",
    icon: Wallet,
    iconBg: "bg-accent",
    iconColor: "text-accent-foreground",
    progress: null,
  },
  {
    title: "الإيرادات",
    value: "₪48,000",
    subtitle: "هذا الشهر",
    icon: TrendingUp,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    trend: "+12%",
    trendUp: true,
  },
  {
    title: "المصروفات",
    value: "₪22,300",
    subtitle: "هذا الشهر",
    icon: TrendingDown,
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    trend: "-5%",
    trendUp: false,
  },
];

const WEBHOOK_STORAGE_KEY = "makecom_webhook_url";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem(WEBHOOK_STORAGE_KEY) || "");
  const [showWebhookInput, setShowWebhookInput] = useState(false);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    
    if (!webhookUrl) {
      setShowWebhookInput(true);
      toast({ title: "أدخل رابط Webhook أولاً", description: "اضغط على أيقونة الإعدادات بجانب حقل الإدخال" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-transaction", {
        body: { text: inputValue, webhookUrl },
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

  const saveWebhookUrl = () => {
    localStorage.setItem(WEBHOOK_STORAGE_KEY, webhookUrl);
    setShowWebhookInput(false);
    toast({ title: "تم حفظ رابط Webhook ✅" });
  };

  return (
    <div className="px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">عبدالله AI للمحاسبة</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
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
        {summaryCards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${card.iconBg}`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
                {card.trend && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    card.trendUp ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                  }`}>
                    {card.trend}
                  </span>
                )}
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
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/transactions")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">المعاملات</p>
              <p className="text-[10px] text-muted-foreground">عرض من Airtable</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/accounts")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <BookOpen className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">الحسابات</p>
              <p className="text-[10px] text-muted-foreground">شجرة الحسابات</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhook URL Input */}
      {showWebhookInput && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">رابط Make.com Webhook</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hook.eu2.make.com/..."
                className="flex-1 h-9 bg-secondary rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20"
                dir="ltr"
              />
              <button onClick={saveWebhookUrl} className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium">حفظ</button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shortcut Buttons */}
      <div className="flex flex-wrap gap-2 justify-end">
        {["قبضت", "دفعت", "اشتريت", "صرفت"].map((action) => (
          <button
            key={action}
            onClick={() => setInputValue((prev) => (prev ? prev + " " : "") + action)}
            className="px-4 py-2 rounded-full bg-secondary text-sm font-medium text-foreground hover:bg-accent transition-colors active:scale-95"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Input */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">ابدأ هنا</h2>
          <button
            onClick={() => setShowWebhookInput(!showWebhookInput)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ⚙️ إعدادات Webhook
          </button>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
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
                placeholder="اكتب عملية… مثال: دفعت 500 شيكل كهرباء"
                className="flex-1 h-10 bg-secondary rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20"
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
    </div>
  );
};

export default Dashboard;

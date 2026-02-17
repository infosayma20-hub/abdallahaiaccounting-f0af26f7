import { FileText, TrendingUp, TrendingDown, Wallet, Mic, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";

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

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">عبدالله AI للمحاسبة</h1>
          <p className="text-sm text-muted-foreground">شركة عبدالله التجارية</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-primary font-bold text-sm">ع</span>
        </div>
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

      {/* التغذية التجارية */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">النشاط الأخير</h2>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">لا يوجد نشاط جديد حتى الآن</p>
            <p className="text-xs text-muted-foreground mt-1">ستظهر هنا أحدث العمليات والفواتير</p>
          </CardContent>
        </Card>
      </div>

      {/* حقل الإدخال السريع */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">ابدأ هنا</h2>
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
                placeholder="اكتب عملية… مثال: دفعت 500 شيكل كهرباء"
                className="flex-1 h-10 bg-secondary rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20"
                dir="rtl"
              />
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

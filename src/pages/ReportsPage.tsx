import { ArrowRight, BarChart3, TrendingUp, Users, Package, Receipt, FileText, Sparkles, PieChart, Wallet, FileSpreadsheet, Scale, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const reports = [
  {
    icon: Sparkles,
    label: "التقرير الذكي",
    description: "اسأل بلغتك عن أي بيانات مالية",
    color: "bg-primary/10",
    iconColor: "text-primary",
    path: "/smart-report",
    featured: true,
  },
  {
    icon: Scale,
    label: "ميزان المراجعة",
    description: "جميع الحسابات مع أرصدة المدين والدائن",
    color: "bg-primary/10",
    iconColor: "text-primary",
    path: "/trial-balance",
  },
  {
    icon: BarChart3,
    label: "قائمة الدخل (الأرباح والخسائر)",
    description: "إيرادات ومصروفات وصافي الربح",
    color: "bg-warning/10",
    iconColor: "text-warning",
    path: "/profit-loss",
  },
  {
    icon: Landmark,
    label: "قائمة المركز المالي",
    description: "الأصول والالتزامات وحقوق الملكية",
    color: "bg-primary/10",
    iconColor: "text-primary",
    path: "/balance-sheet",
  },
  {
    icon: Receipt,
    label: "سجل المعاملات",
    description: "جميع القيود والعمليات المالية",
    color: "bg-destructive/10",
    iconColor: "text-destructive",
    path: "/transactions",
  },
  {
    icon: Users,
    label: "كشوف حسابات العملاء",
    description: "أرصدة الزبائن والموردين",
    color: "bg-primary/10",
    iconColor: "text-primary",
    path: "/contacts",
  },
  {
    icon: Package,
    label: "تقرير المخزون",
    description: "الكميات والقيم وحركات المنتجات",
    color: "bg-accent",
    iconColor: "text-accent-foreground",
    path: "/inventory",
  },
  {
    icon: PieChart,
    label: "دليل الحسابات",
    description: "شجرة الحسابات والأرصدة",
    color: "bg-secondary",
    iconColor: "text-secondary-foreground",
    path: "/accounts",
  },
  {
    icon: FileText,
    label: "سجل الفواتير",
    description: "فواتير المبيعات والمشتريات",
    color: "bg-warning/10",
    iconColor: "text-warning",
    path: "/invoices",
  },
  {
    icon: FileSpreadsheet,
    label: "تصدير Excel و PDF",
    description: "تصدير البيانات بصيغ متعددة",
    color: "bg-primary/10",
    iconColor: "text-primary",
    path: "/export",
  },
];

const ReportsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/")} className="w-9 h-9 rounded-full bg-muted/60 backdrop-blur-sm flex items-center justify-center hover:bg-muted transition-all duration-200 shadow-sm">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">التقارير</h1>
          <p className="text-xs text-muted-foreground">{reports.length} تقارير متاحة</p>
        </div>
      </div>

      {/* Featured - Smart Report */}
      {reports.filter(r => r.featured).map((report) => (
        <button
          key={report.label}
          onClick={() => navigate(report.path)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gradient-to-l from-primary/10 to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
        >
          <div className="p-2.5 rounded-lg bg-primary/10">
            <report.icon className="h-5 w-5 text-primary" />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{report.label}</p>
            <p className="text-[10px] text-muted-foreground">{report.description}</p>
          </div>
        </button>
      ))}

      {/* Reports Grid */}
      <div className="space-y-2.5">
        {reports.filter(r => !r.featured).map((report) => (
          <Card
            key={report.label}
            className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
            onClick={() => navigate(report.path)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${report.color}`}>
                <report.icon className={`h-5 w-5 ${report.iconColor}`} />
              </div>
              <div className="flex-1 text-right">
                <p className="text-sm font-semibold text-foreground">{report.label}</p>
                <p className="text-[10px] text-muted-foreground">{report.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 rotate-180" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ReportsPage;

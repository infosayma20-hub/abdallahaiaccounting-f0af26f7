import { useNavigate } from "react-router-dom";
import {
  Calculator,
  ShoppingCart,
  Users,
  Package,
  ShoppingBag,
  DollarSign,
  BarChart3,
  Store,
  Settings,
} from "lucide-react";

interface AppModule {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  path: string;
}

const appModules: AppModule[] = [
  {
    id: "ai-accountant",
    label: "المحاسب الذكي",
    description: "محاسبة تحليلية بالذكاء الاصطناعي",
    icon: Calculator,
    color: "text-primary",
    bgColor: "bg-primary/10",
    path: "/",
  },
  {
    id: "sales",
    label: "المبيعات",
    description: "فواتير، نقاط بيع، وعملاء",
    icon: ShoppingCart,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    path: "/invoices",
  },
  {
    id: "hr",
    label: "الموارد البشرية",
    description: "موظفون، حضور، ورواتب",
    icon: Users,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    path: "/employees",
  },
  {
    id: "inventory",
    label: "المخزون",
    description: "منتجات، حركات، وتقييم",
    icon: Package,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    path: "/inventory",
  },
  {
    id: "purchases",
    label: "المشتريات",
    description: "موردين وفواتير مشتريات",
    icon: ShoppingBag,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    path: "/bills",
  },
  {
    id: "finance",
    label: "المالية",
    description: "حسابات، قيود، وميزان مراجعة",
    icon: DollarSign,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    path: "/accounts",
  },
  {
    id: "reports",
    label: "التقارير",
    description: "تقارير مالية وتحليلات",
    icon: BarChart3,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    path: "/reports",
  },
  {
    id: "ecommerce",
    label: "المتجر الإلكتروني",
    description: "بنك الطلبيات ومتابعة الطلبات",
    icon: Store,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    path: "/orders",
  },
  {
    id: "settings",
    label: "الإعدادات",
    description: "إعدادات النظام والملف الشخصي",
    icon: Settings,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    path: "/settings",
  },
];

const AppsLauncher = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">عبدالله AI</h1>
            <p className="text-xs text-muted-foreground">اختر التطبيق للبدء</p>
          </div>
        </div>
      </div>

      {/* Apps Grid */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "serif" }}>
          التطبيقات
        </h2>
        <p className="text-sm text-muted-foreground mb-8">كل احتياج، تطبيق واحد.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {appModules.map((app) => (
            <button
              key={app.id}
              onClick={() => navigate(app.path)}
              className="flex items-center gap-4 p-5 rounded-2xl border border-border/60 bg-card hover:shadow-lg hover:border-border hover:-translate-y-0.5 transition-all duration-200 text-right group"
            >
              <div className={`p-3 rounded-xl ${app.bgColor} transition-transform group-hover:scale-110`}>
                <app.icon className={`h-6 w-6 ${app.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{app.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{app.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AppsLauncher;

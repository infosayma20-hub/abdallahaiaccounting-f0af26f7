import { BookOpen, FileSpreadsheet, Users, BarChart3, Sparkles, FileText, CreditCard, Package, Wrench, MessageCircle, PieChart, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { smartNavigate } from "@/lib/smartNavigate";

const sections = [
  {
    title: "العمليات اليومية",
    items: [
      { icon: FileText, label: "الفواتير", description: "مبيعات ومشتريات", color: "bg-warning/10", iconColor: "text-warning", path: "/invoices" },
      { icon: Receipt, label: "الشيكات", description: "واردة وصادرة", color: "bg-primary/10", iconColor: "text-primary", path: "/cheques" },
      { icon: Users, label: "الزبائن", description: "زبائن وموردين", color: "bg-primary/10", iconColor: "text-primary", path: "/contacts" },
      { icon: Package, label: "المخزون", description: "المنتجات والكميات", color: "bg-primary/10", iconColor: "text-primary", path: "/inventory" },
    ],
  },
  {
    title: "تحليل ومتابعة",
    items: [
      { icon: BarChart3, label: "الأرباح والخسائر", description: "تقارير مالية", color: "bg-warning/10", iconColor: "text-warning", path: "/profit-loss" },
      { icon: PieChart, label: "التقارير", description: "جميع التقارير المالية", color: "bg-destructive/10", iconColor: "text-destructive", path: "/reports" },
      { icon: BookOpen, label: "الحسابات", description: "الأرصدة والحركات", color: "bg-primary/10", iconColor: "text-primary", path: "/accounts" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { icon: BookOpen, label: "المعاملات", description: "القيود والعمليات المالية", color: "bg-primary/10", iconColor: "text-primary", path: "/transactions" },
      { icon: CreditCard, label: "الباقات", description: "الأسعار والاشتراك", color: "bg-secondary", iconColor: "text-secondary-foreground", path: "/pricing" },
      { icon: FileSpreadsheet, label: "تصدير", description: "PDF و Excel", color: "bg-accent", iconColor: "text-accent-foreground", path: "/export" },
    ],
  },
];

const MenuPage = () => {
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">القائمة</h1>
        <p className="text-sm text-muted-foreground">جميع الأدوات والخدمات</p>
      </div>

      {/* 🧠 الذكاء المالي - شريط عريض مستقل */}
      <button
        onClick={(e) => smartNavigate(e, "/smart-report", navigate)}
        className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-gradient-to-l from-primary/15 to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
      >
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div className="text-right flex-1">
          <p className="text-sm font-bold text-foreground">اسأل الذكاء عن وضعك المالي</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">تحليلات فورية بلغتك الطبيعية</p>
        </div>
      </button>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.title} className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground px-1">{section.title}</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {section.items.map((item) => (
              <Card
                key={item.label}
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow active:scale-[0.97]"
                onClick={(e) => smartNavigate(e, item.path, navigate)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                  <div className={`p-2.5 rounded-xl ${item.color}`}>
                    <item.icon className={`h-5 w-5 ${item.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground leading-tight">{item.label}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Custom Solution Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/5 via-primary/10 to-transparent p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">نظام مالي مخصص لقطاعك</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          هل تعمل في قطاع الذهب، التصنيع، المقاولات، أو أي مجال متخصص؟ نبني لك نظاماً مالياً مصمماً خصيصاً لطبيعة عملك — دليل حسابات، تقارير، وأوامر ذكية تناسب قطاعك.
        </p>
        <a
          href="https://wa.me/970000000000?text=%D8%A3%D8%B1%D9%8A%D8%AF%20%D9%86%D8%B8%D8%A7%D9%85%20%D9%85%D8%A7%D9%84%D9%8A%20%D9%85%D8%AE%D8%B5%D8%B5%20%D9%84%D9%82%D8%B7%D8%A7%D8%B9%D9%8A"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all active:scale-95"
        >
          <MessageCircle className="h-4 w-4" />
          تواصل معنا عبر واتساب
        </a>
      </div>
    </div>
  );
};

export default MenuPage;

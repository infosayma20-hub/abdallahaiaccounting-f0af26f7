import { BookOpen, Receipt, FileSpreadsheet, Users, BarChart3, Sparkles, FileText, CreditCard, Package, Wrench, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const menuItems = [
  { icon: BookOpen, label: "المحاسبة", description: "دفتر الأستاذ والقيود", color: "bg-primary/10", iconColor: "text-primary", path: "/accounts" },
  { icon: Receipt, label: "المصروفات", description: "تتبع المصاريف", color: "bg-destructive/10", iconColor: "text-destructive", path: "/transactions" },
  { icon: FileText, label: "الفواتير", description: "مبيعات ومشتريات", color: "bg-warning/10", iconColor: "text-warning", path: "/invoices" },
  { icon: Package, label: "المخزون", description: "تتبع المنتجات والكميات", color: "bg-primary/10", iconColor: "text-primary", path: "/inventory" },
  { icon: FileSpreadsheet, label: "تصدير", description: "Excel و PDF", color: "bg-accent", iconColor: "text-accent-foreground", path: "/export" },
  { icon: Users, label: "العملاء", description: "زبائن وموردين", color: "bg-primary/10", iconColor: "text-primary", path: "/contacts" },
  { icon: BarChart3, label: "الأرباح والخسائر", description: "تقارير مالية", color: "bg-warning/10", iconColor: "text-warning", path: "/profit-loss" },
  { icon: CreditCard, label: "الباقات", description: "الأسعار والاشتراك", color: "bg-secondary", iconColor: "text-secondary-foreground", path: "/pricing" },
];

const shortcuts = [
  { label: "✨ التقرير الذكي", emoji: "", path: "/smart-report" },
];

const MenuPage = () => {
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">القائمة</h1>
        <p className="text-sm text-muted-foreground">جميع الأدوات والخدمات</p>
      </div>

      {/* التقرير الذكي */}
      <button
        onClick={() => navigate("/smart-report")}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-l from-primary/10 to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
      >
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">التقرير الذكي</p>
          <p className="text-[10px] text-muted-foreground">اسأل عن بياناتك المالية بلغتك</p>
        </div>
      </button>

      {/* شبكة القائمة */}
      <div className="grid grid-cols-2 gap-3">
        {menuItems.map((item) => (
          <Card
            key={item.label}
            className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
            onClick={() => item.path && navigate(item.path)}
          >
            <CardContent className="p-5 flex flex-col items-center text-center gap-3">
              <div className={`p-3 rounded-xl ${item.color}`}>
                <item.icon className={`h-6 w-6 ${item.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

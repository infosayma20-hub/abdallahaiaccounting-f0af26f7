import { BookOpen, Receipt, ShoppingCart, Users, BarChart3, MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const menuItems = [
  { icon: BookOpen, label: "المحاسبة", description: "دفتر الأستاذ والقيود", color: "bg-primary/10", iconColor: "text-primary" },
  { icon: Receipt, label: "المصروفات", description: "تتبع المصاريف", color: "bg-destructive/10", iconColor: "text-destructive" },
  { icon: ShoppingCart, label: "المبيعات والتحصيل", description: "الفواتير والتحصيل", color: "bg-accent", iconColor: "text-accent-foreground" },
  { icon: Users, label: "العملاء", description: "إدارة العملاء", color: "bg-primary/10", iconColor: "text-primary" },
  { icon: BarChart3, label: "التقارير", description: "تقارير مالية", color: "bg-warning/10", iconColor: "text-warning" },
  { icon: MoreHorizontal, label: "المزيد", description: "إعدادات وخيارات", color: "bg-muted", iconColor: "text-muted-foreground" },
];

const shortcuts = [
  { label: "فاتورة جديدة", emoji: "📄" },
  { label: "مصروف جديد", emoji: "💸" },
  { label: "تقرير سريع", emoji: "📊" },
];

const MenuPage = () => {
  return (
    <div className="px-4 pt-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">القائمة</h1>
        <p className="text-sm text-muted-foreground">جميع الأدوات والخدمات</p>
      </div>

      {/* اختصارات */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">الأكثر استخداماً</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border shadow-sm whitespace-nowrap hover:bg-accent transition-colors active:scale-95"
            >
              <span>{s.emoji}</span>
              <span className="text-xs font-medium text-foreground">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* شبكة القائمة */}
      <div className="grid grid-cols-2 gap-3">
        {menuItems.map((item) => (
          <Card key={item.label} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]">
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
    </div>
  );
};

export default MenuPage;

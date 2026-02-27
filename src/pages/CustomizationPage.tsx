import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Building2, FileEdit, Headset, MessageCircle, Shield } from "lucide-react";

const WHATSAPP_NUMBER = "970000000000";

const sections = [
  {
    icon: Building2,
    label: "قوالب القطاعات",
    description: "إعدادات جاهزة حسب مجال عملك",
    path: "/customization/templates",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: FileEdit,
    label: "طلب تخصيص",
    description: "معالج خطوة بخطوة لطلب تعديلات",
    path: "/customization/request",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    icon: Headset,
    label: "تذاكر الدعم",
    description: "متابعة طلباتك وتذاكرك",
    path: "/support/tickets",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: Shield,
    label: "لوحة الإدارة",
    description: "إدارة جميع التذاكر (للمسؤولين)",
    path: "/support/admin",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
  },
];

const CustomizationPage = () => {
  const navigate = useNavigate();
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("مرحباً، أحتاج مساعدة في نظام عبدالله AI")}`;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">🧩 التخصيص والدعم الفني</h1>
        <p className="text-sm text-muted-foreground mt-1">خصّص النظام حسب قطاعك وتواصل مع فريق الدعم</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((s) => (
          <Card
            key={s.path}
            className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 border-border/60"
            onClick={() => navigate(s.path)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${s.bgColor}`}>
                <s.icon className={`h-6 w-6 ${s.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground rotate-180" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* WhatsApp Banner */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-5 rounded-2xl bg-gradient-to-l from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 hover:shadow-md transition-all"
      >
        <div className="p-3 rounded-xl bg-emerald-500/10">
          <MessageCircle className="h-6 w-6 text-emerald-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">تحدث مع فريق الدعم عبر واتساب</p>
          <p className="text-xs text-muted-foreground mt-0.5">ردود سريعة ومتابعة مباشرة</p>
        </div>
      </a>
    </div>
  );
};

export default CustomizationPage;

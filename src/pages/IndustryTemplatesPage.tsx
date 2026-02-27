import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, ShoppingCart, Package, Utensils, Briefcase, Heart, HardHat, Store, Edit3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SectorTemplate {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  modules: string[];
  chartOfAccounts: string;
  roles: string[];
  workflows: string[];
}

const sectors: SectorTemplate[] = [
  {
    id: "retail", label: "تجارة تجزئة", icon: ShoppingCart, color: "text-orange-500",
    modules: ["المبيعات", "نقاط البيع", "المخزون", "المالية", "التقارير"],
    chartOfAccounts: "دليل حسابات تجاري قياسي (إيرادات مبيعات، تكلفة بضاعة، مصاريف تشغيل)",
    roles: ["مدير", "كاشير", "أمين مخزن", "محاسب"],
    workflows: ["موافقات المشتريات", "جرد المخزون الدوري", "تسوية الصندوق اليومي"],
  },
  {
    id: "wholesale", label: "جملة", icon: Package, color: "text-teal-500",
    modules: ["المبيعات", "المشتريات", "المخزون", "المالية", "العملات", "التقارير"],
    chartOfAccounts: "دليل حسابات تجارة جملة (ذمم مدينة/دائنة، فروقات عملة، خصومات)",
    roles: ["مدير", "مندوب مبيعات", "محاسب", "أمين مخزن"],
    workflows: ["موافقات الائتمان", "شيكات آجلة", "تحويلات عملات"],
  },
  {
    id: "restaurant", label: "مطعم", icon: Utensils, color: "text-amber-500",
    modules: ["نقاط البيع", "المخزون", "الموارد البشرية", "المالية", "التقارير"],
    chartOfAccounts: "دليل حسابات مطاعم (مواد خام، تكاليف أغذية، مصاريف تشغيل)",
    roles: ["مدير", "كاشير", "شيف", "محاسب"],
    workflows: ["طلبات شراء مواد خام", "جرد يومي", "إدارة الورديات"],
  },
  {
    id: "services", label: "شركة خدمات", icon: Briefcase, color: "text-sky-500",
    modules: ["المبيعات", "الموارد البشرية", "المالية", "التقارير", "المحاسب الذكي"],
    chartOfAccounts: "دليل حسابات خدمات (إيرادات خدمات، مصاريف رواتب، مصاريف إدارية)",
    roles: ["مدير", "موظف", "محاسب"],
    workflows: ["موافقات فواتير", "متابعة التحصيل"],
  },
  {
    id: "clinic", label: "عيادة / مركز طبي", icon: Heart, color: "text-rose-500",
    modules: ["المبيعات", "الموارد البشرية", "المالية", "التقارير"],
    chartOfAccounts: "دليل حسابات طبي (إيرادات خدمات طبية، مستلزمات، رواتب أطباء)",
    roles: ["مدير", "طبيب", "استقبال", "محاسب"],
    workflows: ["موافقات مالية", "جدولة المواعيد"],
  },
  {
    id: "construction", label: "شركة مقاولات", icon: HardHat, color: "text-stone-600",
    modules: ["المشتريات", "المخزون", "الموارد البشرية", "المالية", "الأصول الثابتة", "التقارير"],
    chartOfAccounts: "دليل حسابات مقاولات (مشاريع تحت التنفيذ، مواد بناء، مقاولين باطن)",
    roles: ["مدير", "مهندس مشروع", "أمين مخزن", "محاسب"],
    workflows: ["موافقات مشتريات", "مستخلصات", "كفالات بنكية"],
  },
  {
    id: "ecommerce", label: "متجر إلكتروني", icon: Store, color: "text-indigo-500",
    modules: ["المبيعات", "المخزون", "المتجر الإلكتروني", "المالية", "العملات", "التقارير"],
    chartOfAccounts: "دليل حسابات تجارة إلكترونية (مبيعات أونلاين، شحن، بوابات دفع)",
    roles: ["مدير", "مدير متجر", "خدمة عملاء", "محاسب"],
    workflows: ["معالجة الطلبات", "إدارة المرتجعات", "تسوية بوابات الدفع"],
  },
];

const IndustryTemplatesPage = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [customSector, setCustomSector] = useState("");

  const selectedTemplate = sectors.find((s) => s.id === selected);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/customization")} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">قوالب القطاعات</h1>
          <p className="text-xs text-muted-foreground">اختر قطاعك للحصول على إعدادات مقترحة</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sectors.map((s) => (
          <Card
            key={s.id}
            className={`cursor-pointer transition-all hover:shadow-md ${selected === s.id ? "ring-2 ring-primary border-primary" : "border-border/60"}`}
            onClick={() => setSelected(s.id)}
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <s.icon className={`h-7 w-7 ${s.color}`} />
              <p className="text-xs font-bold text-foreground">{s.label}</p>
              {selected === s.id && <Check className="h-4 w-4 text-primary" />}
            </CardContent>
          </Card>
        ))}
        {/* Custom */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${selected === "other" ? "ring-2 ring-primary border-primary" : "border-border/60"}`}
          onClick={() => setSelected("other")}
        >
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <Edit3 className="h-7 w-7 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">أخرى</p>
            {selected === "other" && <Check className="h-4 w-4 text-primary" />}
          </CardContent>
        </Card>
      </div>

      {selected === "other" && (
        <Input
          value={customSector}
          onChange={(e) => setCustomSector(e.target.value)}
          placeholder="اكتب اسم القطاع..."
          className="max-w-sm"
        />
      )}

      {selectedTemplate && (
        <Card className="border-primary/20">
          <CardContent className="p-6 space-y-5">
            <h2 className="text-lg font-bold text-foreground">الإعداد المقترح: {selectedTemplate.label}</h2>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2">الموديولات المفعّلة</p>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.modules.map((m) => (
                  <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">دليل الحسابات المقترح</p>
              <p className="text-sm text-foreground">{selectedTemplate.chartOfAccounts}</p>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2">الأدوار والصلاحيات</p>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.roles.map((r) => (
                  <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2">سير العمل المقترح</p>
              <ul className="space-y-1">
                {selectedTemplate.workflows.map((w) => (
                  <li key={w} className="text-sm text-foreground flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" /> {w}
                  </li>
                ))}
              </ul>
            </div>

            <Button onClick={() => navigate("/customization/request")} className="w-full sm:w-auto">
              طلب تطبيق هذا الإعداد
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default IndustryTemplatesPage;

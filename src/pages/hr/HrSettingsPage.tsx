import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Settings2, Building2, Clock, CalendarDays, Banknote, Layers, UserCog } from "lucide-react";

const SECTIONS: { to: string; title: string; desc: string; Icon: any }[] = [
  { to: "/hr/definitions", title: "التعريفات", desc: "الفروع، الأقسام والمسميات الوظيفية", Icon: Building2 },
  { to: "/hr/shifts", title: "الشفتات (الورديات)", desc: "قوالب أوقات الدوام", Icon: Clock },
  { to: "/hr/day-types", title: "أنواع اليوم وأسبوع العمل", desc: "أيام العمل والعطل والاحتساب", Icon: CalendarDays },
  { to: "/payroll-settings", title: "سياسات الرواتب", desc: "البدلات، الخصومات وإعدادات الاحتساب", Icon: Banknote },
  { to: "/hr-deductions", title: "البدلات والخصومات", desc: "إدارة الخصومات الشهرية", Icon: Layers },
  { to: "/hr/policy-assignment", title: "ربط الموظفين بالسياسات", desc: "تعيين الفرع/الشفت/سياسة الراتب لكل موظف", Icon: UserCog },
];

export default function HrSettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إعدادات الموارد البشرية</h1>
          <p className="text-sm text-muted-foreground">مدخل موحّد لإدارة كل إعدادات HR.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="block">
            <Card className="hover:shadow-md hover:border-primary/40 transition cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <s.Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm mb-1">{s.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{s.desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

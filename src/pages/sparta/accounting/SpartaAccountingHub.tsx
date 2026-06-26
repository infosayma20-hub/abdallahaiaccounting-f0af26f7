import { Link } from "react-router-dom";
import { BookOpen, ListTree, FileText, BarChart3, Receipt, Landmark, Clock, TrendingUp, Calendar, Target, ArrowUpCircle } from "lucide-react";

const TILES = [
  { to: "/sparta/accounting/chart", label: "شجرة الحسابات", desc: "إدارة دليل الحسابات", icon: ListTree, color: "from-emerald-500 to-emerald-700" },
  { to: "/sparta/accounting/journal", label: "قيود اليومية", desc: "إدخال ومراجعة القيود", icon: BookOpen, color: "from-blue-500 to-blue-700" },
  { to: "/sparta/accounting/ledger", label: "دفتر الأستاذ", desc: "حركة أي حساب بالتفصيل", icon: FileText, color: "from-amber-500 to-amber-700" },
  { to: "/sparta/accounting/reports", label: "ميزان المراجعة", desc: "أرصدة الحسابات الكلية", icon: BarChart3, color: "from-purple-500 to-purple-700" },
  { to: "/sparta/accounting/bills", label: "فواتير المشتريات", desc: "فواتير الموردين (AP)", icon: Receipt, color: "from-rose-500 to-rose-700" },
  { to: "/sparta/accounting/banks", label: "الحسابات البنكية", desc: "البنوك والحركات والتسويات", icon: Landmark, color: "from-cyan-500 to-cyan-700" },
  { to: "/sparta/accounting/ar-aging", label: "أعمار الذمم المدينة", desc: "تحليل ذمم العملاء", icon: Clock, color: "from-teal-500 to-teal-700" },
  { to: "/sparta/accounting/ap-aging", label: "أعمار الذمم الدائنة", desc: "تحليل ذمم الموردين", icon: Clock, color: "from-orange-500 to-orange-700" },
  { to: "/sparta/accounting/financial-reports", label: "قائمة الدخل والميزانية", desc: "P&L والميزانية العامة", icon: TrendingUp, color: "from-indigo-500 to-indigo-700" },
  { to: "/sparta/accounting/fiscal-years", label: "السنوات والفترات", desc: "إقفال السنة وقفل الفترات", icon: Calendar, color: "from-slate-500 to-slate-700" },
  { to: "/sparta/accounting/budget", label: "الميزانية التقديرية", desc: "ميزانية شهرية ومقارنة فعلي", icon: Target, color: "from-pink-500 to-pink-700" },
  { to: "/sparta/accounting/cash-flow", label: "قائمة التدفقات النقدية", desc: "تشغيلية/استثمارية/تمويلية", icon: ArrowUpCircle, color: "from-green-500 to-green-700" },
];

export default function SpartaAccountingHub() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">المحاسبة المالية</h1>
        <p className="text-sm text-muted-foreground mt-1">دفتر أستاذ مزدوج القيد، شجرة حسابات، قيود يومية، تقارير.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map(({ to, label, desc, icon: Icon, color }) => (
          <Link key={to} to={to} className={`block rounded-xl p-5 bg-gradient-to-br ${color} text-white shadow hover:shadow-lg transition-shadow`}>
            <Icon className="h-8 w-8 mb-3 opacity-90" />
            <div className="text-lg font-bold">{label}</div>
            <div className="text-xs opacity-85 mt-1">{desc}</div>
          </Link>
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        نظام محاسبي مستقل تمامًا لسبارتا — قيود مزدوجة، حماية من الترحيل على حسابات الأب، وعكس قيود وفق معايير IFRS.
      </div>
    </div>
  );
}
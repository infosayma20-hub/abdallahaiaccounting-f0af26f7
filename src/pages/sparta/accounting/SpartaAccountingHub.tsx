import { Link } from "react-router-dom";
import {
  BookOpen, ListTree, FileText, BarChart3, Receipt, Landmark, Clock,
  TrendingUp, Calendar, Target, ArrowUpCircle, ChevronLeft,
} from "lucide-react";
import { SpartaPageHeader } from "@/components/sparta/SpartaUI";

type Tile = {
  to: string;
  label: string;
  desc: string;
  icon: typeof BookOpen;
};

type Group = {
  title: string;
  hint: string;
  tiles: Tile[];
};

const GROUPS: Group[] = [
  {
    title: "دفتر الأستاذ العام",
    hint: "General ledger",
    tiles: [
      { to: "/sparta/accounting/chart",   label: "شجرة الحسابات", desc: "إدارة دليل الحسابات", icon: ListTree },
      { to: "/sparta/accounting/journal", label: "قيود اليومية", desc: "إدخال ومراجعة القيود", icon: BookOpen },
      { to: "/sparta/accounting/ledger",  label: "دفتر الأستاذ",  desc: "حركة أي حساب بالتفصيل", icon: FileText },
      { to: "/sparta/accounting/reports", label: "ميزان المراجعة", desc: "أرصدة الحسابات الكلية", icon: BarChart3 },
    ],
  },
  {
    title: "الذمم والبنوك",
    hint: "AP · AR · Banks",
    tiles: [
      { to: "/sparta/accounting/bills",    label: "فواتير المشتريات", desc: "فواتير الموردين (AP)", icon: Receipt },
      { to: "/sparta/accounting/banks",    label: "الحسابات البنكية", desc: "البنوك والحركات والتسويات", icon: Landmark },
      { to: "/sparta/accounting/ar-aging", label: "أعمار الذمم المدينة", desc: "تحليل ذمم العملاء", icon: Clock },
      { to: "/sparta/accounting/ap-aging", label: "أعمار الذمم الدائنة", desc: "تحليل ذمم الموردين", icon: Clock },
    ],
  },
  {
    title: "التقارير والإقفالات",
    hint: "Reporting & period close",
    tiles: [
      { to: "/sparta/accounting/financial-reports", label: "قائمة الدخل والميزانية", desc: "P&L والميزانية العامة", icon: TrendingUp },
      { to: "/sparta/accounting/fiscal-years",      label: "السنوات والفترات", desc: "إقفال السنة وقفل الفترات", icon: Calendar },
      { to: "/sparta/accounting/budget",            label: "الميزانية التقديرية", desc: "ميزانية شهرية ومقارنة فعلي", icon: Target },
      { to: "/sparta/accounting/cash-flow",         label: "قائمة التدفقات النقدية", desc: "تشغيلية/استثمارية/تمويلية", icon: ArrowUpCircle },
    ],
  },
];

export default function SpartaAccountingHub() {
  return (
    <div dir="rtl" className="space-y-8">
      <SpartaPageHeader
        eyebrow="§ 04 · المحاسبة"
        title="المحاسبة المالية"
      />
      <p className="text-sm -mt-4" style={{ color: "#6B7280" }}>
        دفتر أستاذ مزدوج القيد، شجرة حسابات، قيود يومية، وتقارير مالية وفق معايير IFRS.
      </p>

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <div className="flex items-baseline justify-between border-b pb-2" style={{ borderColor: "#EEF0F3" }}>
            <h2 className="text-sm font-bold" style={{ color: "#1F2937" }}>{group.title}</h2>
            <span className="text-[11px] uppercase tracking-wider" style={{ color: "#9CA3AF", fontFamily: "'Inter', sans-serif" }}>
              {group.hint}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {group.tiles.map(({ to, label, desc, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="group relative block bg-white p-4 transition-all hover:-translate-y-0.5"
                style={{
                  border: "1px solid #EEF0F3",
                  borderRadius: 10,
                  boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
                }}
              >
                <div
                  className="absolute top-0 bottom-0 transition-all group-hover:w-1"
                  style={{ insetInlineStart: 0, width: 3, background: "#9E2B43", borderStartStartRadius: 10, borderEndStartRadius: 10 }}
                />
                <div className="flex items-start gap-3">
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{ width: 36, height: 36, borderRadius: 8, background: "#FBEAF1", color: "#9E2B43" }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold" style={{ color: "#1F2937" }}>{label}</div>
                    <div className="text-[12px] mt-1 leading-relaxed" style={{ color: "#6B7280" }}>{desc}</div>
                  </div>
                  <ChevronLeft className="h-4 w-4 mt-1 transition-transform group-hover:-translate-x-0.5" style={{ color: "#C7CDD4" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div
        className="text-[12px] p-3 leading-relaxed"
        style={{
          background: "#FBF7F8",
          border: "1px solid #F0E5E9",
          borderInlineStartWidth: 3,
          borderInlineStartColor: "#9E2B43",
          borderRadius: 8,
          color: "#6B5760",
        }}
      >
        نظام محاسبي مستقل تمامًا لسبارتا — قيود مزدوجة، حماية من الترحيل على حسابات الأب، وعكس قيود وفق معايير IFRS.
      </div>
    </div>
  );
}
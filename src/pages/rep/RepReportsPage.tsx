import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { LayoutDashboard, Users, FileText, ClipboardList, TrendingUp, Receipt } from "lucide-react";

const REPORTS = [
  { label: "لوحة اليوم", desc: "ملخص يومك الحالي + فتح/إغلاق يوم البيع", path: "/rep/dashboard", icon: LayoutDashboard, tone: "from-emerald-500/20 to-emerald-500/5 text-emerald-400 ring-emerald-500/30" },
  { label: "طلباتي", desc: "كل الفواتير التي أصدرتها", path: "/rep/orders", icon: FileText, tone: "from-sky-500/20 to-sky-500/5 text-sky-400 ring-sky-500/30" },
  { label: "الزبائن وأرصدتهم", desc: "كشف عملاء + ديون قائمة", path: "/rep/customers", icon: Users, tone: "from-violet-500/20 to-violet-500/5 text-violet-400 ring-violet-500/30" },
  { label: "كشف حساب عميل", desc: "حركات تفصيلية لأي عميل", path: "/rep/customer-statement", icon: ClipboardList, tone: "from-indigo-500/20 to-indigo-500/5 text-indigo-400 ring-indigo-500/30" },
  { label: "المبيعات حسب المورّد", desc: "تجميع مبيعاتك حسب مصدر البضاعة", path: "/rep/sales-by-supplier", icon: TrendingUp, tone: "from-amber-500/20 to-amber-500/5 text-amber-400 ring-amber-500/30" },
  { label: "سند صرف", desc: "مصاريفك المسجلة (مصاريف يومية)", path: "/rep/expense", icon: Receipt, tone: "from-rose-500/20 to-rose-500/5 text-rose-400 ring-rose-500/30" },
];

export default function RepReportsPage() {
  const navigate = useNavigate();
  return (
    <div dir="rtl" className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">تقارير المندوب</h1>
        <p className="text-sm text-muted-foreground mt-1">اختر التقرير الذي تريد عرضه</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Card
              key={r.path}
              onClick={() => navigate(r.path)}
              className={`cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all p-4 flex items-center gap-3 bg-gradient-to-br ${r.tone} ring-1`}
            >
              <div className="w-12 h-12 rounded-xl bg-card/60 backdrop-blur flex items-center justify-center ring-1 ring-inset ring-border/40 shrink-0">
                <Icon className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground">{r.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
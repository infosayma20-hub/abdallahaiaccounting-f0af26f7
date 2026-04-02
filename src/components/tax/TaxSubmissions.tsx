import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertTriangle, DollarSign } from "lucide-react";

interface Props { ownerId: string; onRefresh: () => void; }

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const fmt = (n: number) => `₪${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "مسودة", color: "text-muted-foreground bg-muted", icon: Clock },
  submitted: { label: "تم التقديم", color: "text-blue-700 bg-blue-50", icon: CheckCircle2 },
  paid: { label: "تم الدفع", color: "text-emerald-700 bg-emerald-50", icon: DollarSign },
  refund_requested: { label: "طلب استرداد", color: "text-amber-700 bg-amber-50", icon: AlertTriangle },
  late: { label: "متأخر", color: "text-red-700 bg-red-50", icon: AlertTriangle },
};

export default function TaxSubmissions({ ownerId, onRefresh }: Props) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!ownerId) return;
    const { data } = await supabase
      .from("tax_submissions")
      .select("*")
      .eq("user_id", ownerId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    setSubmissions(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [ownerId]);

  return (
    <Card className="p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground">سجل التقديمات والتوريدات</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0D1B2E", color: "#fff" }}>
              <th className="px-3 py-2.5 text-right text-xs font-medium">الفترة</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">تاريخ التقديم</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">ضريبة مبيعات</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">ضريبة مشتريات</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">الصافي</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">المدفوع</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">تاريخ الدفع</th>
              <th className="px-3 py-2.5 text-center text-xs font-medium">الحالة</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">جارِ التحميل...</td></tr>
            ) : submissions.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد تقديمات مسجلة بعد</td></tr>
            ) : submissions.map((s, i) => {
              const cfg = statusConfig[s.status] || statusConfig.draft;
              const Icon = cfg.icon;
              return (
                <tr key={s.id} className={i % 2 === 0 ? "" : "bg-muted/20"} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  <td className="px-3 py-2.5 font-medium">{MONTHS[s.period_month - 1]} {s.period_year}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.submission_date || "—"}</td>
                  <td className="px-3 py-2.5 text-left tabular-nums text-red-600">{fmt(s.output_tax)}</td>
                  <td className="px-3 py-2.5 text-left tabular-nums text-emerald-600">{fmt(s.input_tax)}</td>
                  <td className={`px-3 py-2.5 text-left tabular-nums font-bold ${Number(s.net_tax) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {fmt(s.net_tax)}
                  </td>
                  <td className="px-3 py-2.5 text-left tabular-nums">{s.payment_amount ? fmt(s.payment_amount) : "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.payment_date || "—"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cfg.color}`}>
                      <Icon className="w-3 h-3" />{cfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{s.notes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

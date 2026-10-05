import { useEffect, useState } from "react";
import { Check, X, RefreshCw, Loader2 } from "lucide-react";
import { FinanceShell } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

type Row = {
  id: string; created_at: string; status: string; system_qty: number; counted_qty: number; applied_delta: number | null;
  products: { name: string; barcode: string | null } | null;
  employees: { full_name: string } | null;
  warehouses: { name: string } | null;
};
type EditRow = { id: string; created_at: string; field: string; old_value: string | null; new_value: string | null; products: { name: string } | null; employees: { full_name: string } | null };

const STATUS: Record<string, string> = { pending: "بانتظار المراجعة", approved: "معتمد", rejected: "مرفوض", superseded: "استُبدل بعدّ أحدث" };

/** مراجعة جرد الموظفين: اعتماد الكمية يسجّل حركة تسوية بالفرق لحظة الاعتماد. */
export default function StockCountReviewPage() {
  const { dataOwnerId } = useDataOwnerId();
  const [tab, setTab] = useState<"pending" | "done" | "edits">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    if (tab === "edits") {
      const { data } = await supabase.from("product_edit_log")
        .select("id,created_at,field,old_value,new_value,products(name),employees(full_name)")
        .eq("user_id", dataOwnerId).order("created_at", { ascending: false }).limit(300);
      setEdits((data || []) as any);
    } else {
      let q = supabase.from("stock_count_entries")
        .select("id,created_at,status,system_qty,counted_qty,applied_delta,products(name,barcode),employees(full_name),warehouses(name)")
        .eq("user_id", dataOwnerId).order("created_at", { ascending: false }).limit(300);
      q = tab === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
      const { data } = await q;
      setRows((data || []) as any);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dataOwnerId, tab]);

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    const { data, error } = await supabase.rpc("stock_count_review", { p_entry_id: id, p_approve: approve });
    setBusy(null);
    if (error) { toast({ title: "تعذّر التنفيذ", description: error.message, variant: "destructive" }); return; }
    const d = (data as any)?.delta;
    toast({ title: approve ? `اعتُمد — فرق التسوية ${Number(d ?? 0)}` : "رُفض العدّ" });
    load();
  };

  const fmt = (s: string) => new Date(s).toLocaleString("ar-PS-u-nu-latn", { dateStyle: "short", timeStyle: "short" });

  return (
    <FinanceShell
      title="جرد الموظفين"
      subtitle="مراجعة الكميات المعدودة من تبويب الموظف، وسجل تعديلات الأسماء والأسعار"
      breadcrumb={[{ label: "النظام", href: "/" }, { label: "المخزون", href: "/inventory" }, { label: "جرد الموظفين" }]}
      actionTabs={[{ key: "main", label: "عام", groups: [{ key: "g", label: "إجراءات", items: [{ key: "r", label: "تحديث", icon: RefreshCw, onClick: load }] }] }]}
    >
      <div className="space-y-3 p-3 md:p-4" dir="rtl">
        <Tabs dir="rtl" value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="pending">بانتظار المراجعة</TabsTrigger>
            <TabsTrigger value="done">المراجَعة</TabsTrigger>
            <TabsTrigger value="edits">تعديلات الأسماء والأسعار</TabsTrigger>
          </TabsList>
        </Tabs>
        {loading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : tab === "edits" ? (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الموظف</th><th className="p-2 text-right">الحقل</th><th className="p-2 text-right">قبل</th><th className="p-2 text-right">بعد</th></tr></thead>
              <tbody>
                {edits.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{fmt(e.created_at)}</td><td className="p-2">{e.products?.name}</td><td className="p-2">{e.employees?.full_name ?? "—"}</td>
                    <td className="p-2">{e.field === "name" ? "الاسم" : "سعر البيع"}</td><td className="p-2 text-muted-foreground">{e.old_value ?? "—"}</td><td className="p-2 font-medium">{e.new_value}</td>
                  </tr>
                ))}
                {!edits.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد تعديلات</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>
                <th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">المستودع</th><th className="p-2 text-right">الموظف</th>
                <th className="p-2 text-right">بالنظام وقت العدّ</th><th className="p-2 text-right">المعدود</th><th className="p-2 text-right">الفرق</th><th className="p-2 text-right">{tab === "pending" ? "إجراء" : "الحالة"}</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const diff = Number(r.counted_qty) - Number(r.system_qty);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{fmt(r.created_at)}</td>
                      <td className="p-2">{r.products?.name}<div className="font-mono text-xs text-muted-foreground">{r.products?.barcode}</div></td>
                      <td className="p-2">{r.warehouses?.name}</td><td className="p-2">{r.employees?.full_name}</td>
                      <td className="p-2">{Number(r.system_qty)}</td><td className="p-2 font-bold">{Number(r.counted_qty)}</td>
                      <td className={`p-2 font-medium ${diff < 0 ? "text-destructive" : ""}`}>{diff > 0 ? "+" : ""}{diff}</td>
                      <td className="p-2">
                        {tab === "pending" ? (
                          <div className="flex gap-1">
                            <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}><Check className="h-4 w-4" />اعتماد</Button>
                            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => review(r.id, false)}><X className="h-4 w-4" />رفض</Button>
                          </div>
                        ) : (
                          <Badge variant={r.status === "approved" ? "default" : "secondary"}>{STATUS[r.status] ?? r.status}{r.status === "approved" && r.applied_delta !== null ? ` (${Number(r.applied_delta)})` : ""}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">لا توجد سجلات</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">عند الاعتماد تُحسب التسوية من الرصيد الحالي للمستودع، فتُحتسب المبيعات التي تمت بعد العدّ.</p>
      </div>
    </FinanceShell>
  );
}

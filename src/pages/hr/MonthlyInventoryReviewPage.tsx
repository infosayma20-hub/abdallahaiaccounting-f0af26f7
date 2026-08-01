import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import MonthlyInventoryView from "@/components/forms/MonthlyInventoryView";

type Row = {
  id: string;
  created_at: string;
  status: string;
  archived_at: string | null;
  form_data: any;
  employee_name: string;
};

const statusLabel = (s: string) =>
  s === "approved" ? "معتمد" : s === "submitted" || s === "pending" ? "مرسل" : s === "rejected" ? "مرفوض" : "مسودة";

/**
 * Monthly Inventory Review (Admin / HR)
 * Lists every "جرد شهري" submission across all branches and months,
 * including archived ones (approved forms get archived automatically).
 */
export default function MonthlyInventoryReviewPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [branch, setBranch] = useState("");
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employee_forms")
      .select("id, created_at, status, archived_at, form_data, employees(full_name)")
      .or("form_data->>kind.eq.monthly_inventory,form_type.eq.inventory_balance,template_id.eq.a369fcf6-adfd-4c00-b421-310c89e04fc1")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "تعذر تحميل الجرد", description: error.message, variant: "destructive" });
      setRows([]);
    } else {
      setRows(
        (data || []).map((r: any) => {
          const fd = r.form_data || {};
          const legacy = fd.kind !== "monthly_inventory";
          return {
            id: r.id,
            created_at: r.created_at,
            status: r.status,
            archived_at: r.archived_at,
            form_data: legacy
              ? {
                  ...fd,
                  kind: "monthly_inventory",
                  branch_name: fd.branch_name || fd.branch || "—",
                  month: fd.month || String(r.created_at).slice(0, 7),
                }
              : fd,
            employee_name: r.employees?.full_name || "—",
          };
        })
      );
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const branches = useMemo(
    () => Array.from(new Set(rows.map((r) => r.form_data?.branch_name).filter(Boolean))) as string[],
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!branch || r.form_data?.branch_name === branch) &&
          (!month || String(r.form_data?.month || "").includes(month))
      ),
    [rows, branch, month]
  );

  if (selected) {
    return (
      <div className="p-4 space-y-4" dir="rtl">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelected(null)}>
          <ArrowRight className="h-4 w-4" /> رجوع للقائمة
        </Button>
        <div className="text-sm text-muted-foreground">
          مقدم النموذج: <b className="text-foreground">{selected.employee_name}</b> — {new Date(selected.created_at).toLocaleDateString("ar-EG")}
        </div>
        <MonthlyInventoryView data={selected.form_data} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">الجرد الشهري — جميع الفروع</h1>
        <Button variant="ghost" size="sm" className="mr-auto gap-1.5" onClick={load}>
          <RefreshCw className="h-4 w-4" /> تحديث
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <Input
            className="h-9 w-40"
            placeholder="الشهر (YYYY-MM)"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">{filtered.length} نموذج</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا توجد نماذج جرد</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-right">الفرع</th>
                  <th className="p-2 text-right">الشهر</th>
                  <th className="p-2 text-right">المُقدِّم</th>
                  <th className="p-2 text-right">مجموع الكميات</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">{r.form_data?.branch_name || "—"}</td>
                    <td className="p-2">{r.form_data?.month || "—"}</td>
                    <td className="p-2">{r.employee_name}</td>
                    <td className="p-2">{r.form_data?.summary?.qty ?? "—"}</td>
                    <td className="p-2">
                      <Badge variant="outline">{statusLabel(r.status)}</Badge>
                      {r.archived_at && <span className="text-[10px] text-muted-foreground mr-1">مؤرشف</span>}
                    </td>
                    <td className="p-2">{new Date(r.created_at).toLocaleDateString("ar-EG")}</td>
                    <td className="p-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>عرض</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

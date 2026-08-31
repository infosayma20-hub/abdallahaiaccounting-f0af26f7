import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowRight, RefreshCw, FileSpreadsheet, Printer, Eye, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import MonthlyInventoryView from "@/components/forms/MonthlyInventoryView";
import { exportMonthlyInventoryToExcel } from "@/components/forms/monthlyInventoryExcel";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import * as XLSX from "xlsx";

type Row = {
  id: string;
  created_at: string;
  status: string;
  archived_at: string | null;
  form_data: any;
  employee_name: string;
};

const statusLabel = (s: string, fd?: any) =>
  fd?.__draft === true
    ? "مسودة"
    : s === "approved" ? "معتمد" : s === "submitted" || s === "pending" ? "مرسل" : s === "rejected" ? "مرفوض" : "مسودة";


/** Convert legacy flat inventory forms (key: qty) into the standard lines shape. */
function normalizeLegacy(fd: any, createdAt: string) {
  const skip = new Set(["branch", "branch_name", "employee_name", "month", "notes", "kind"]);
  const lines = Object.entries(fd || {})
    .filter(([k, v]) => !skip.has(k) && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => ({ item: k, qty: Number(v) || 0, unit: "", category: "جرد" }));
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  return {
    ...fd,
    kind: "monthly_inventory",
    branch_name: fd?.branch_name || fd?.branch || "—",
    month: fd?.month || String(createdAt).slice(0, 7),
    lines,
    summary: fd?.summary || { qty, filled: lines.length, total: lines.length, byCategory: [] },
  };
}

/**
 * Monthly Inventory Review (Admin / HR)
 * Lists every "جرد شهري" submission across all branches and months,
 * including archived ones (approved forms get archived automatically).
 */
export default function MonthlyInventoryReviewPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  const loadPrices = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_catalog_items")
      .select("item_name, unit_price")
      .limit(5000);
    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      if (Number(r.unit_price) > 0) map[r.item_name] = Number(r.unit_price);
    });
    setPrices(map);
  }, []);

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
            form_data: legacy ? normalizeLegacy(fd, r.created_at) : fd,
            employee_name: r.employees?.full_name || "—",
          };
        })
      );
    }
    setLoading(false);
  };

  useEffect(() => { load(); loadPrices(); }, [loadPrices]);

  const valueOf = useCallback(
    (r: Row) =>
      (Array.isArray(r.form_data?.lines) ? r.form_data.lines : []).reduce(
        (s: number, l: any) => s + (Number(l.qty) || 0) * (Number(prices[l.item] ?? 0) || 0),
        0,
      ),
    [prices],
  );

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const savePrices = async () => {
    setSavingPrices(true);
    const entries = Object.entries(prices);
    let failed = 0;
    for (const [item, price] of entries) {
      const { error } = await supabase
        .from("inventory_catalog_items")
        .update({ unit_price: price })
        .eq("item_name", item);
      if (error) failed++;
    }
    setSavingPrices(false);
    toast(
      failed
        ? { title: "تعذر حفظ بعض الأسعار", description: `${failed} صنف`, variant: "destructive" }
        : { title: "تم حفظ الأسعار" },
    );
  };

  const branches = useMemo(
    () => Array.from(new Set(rows.map((r) => r.form_data?.branch_name).filter(Boolean))) as string[],
    [rows]
  );

  const years = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => String(r.form_data?.month || "").slice(0, 4)).filter((y) => y.length === 4)),
      ).sort().reverse(),
    [rows]
  );

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => {
          const m = String(r.form_data?.month || "");
          return (
            (!branch || r.form_data?.branch_name === branch) &&
            (!year || m.slice(0, 4) === year) &&
            (!month || m.slice(5, 7) === month)
          );
        }
      ),
    [rows, branch, year, month]
  );

  const exportList = () => {
    const aoa: (string | number)[][] = [
      ["الفرع", "الشهر", "المُقدِّم", "مجموع الكميات", "قيمة الجرد", "الحالة", "التاريخ"],
      ...filtered.map((r) => [
        r.form_data?.branch_name || "—",
        r.form_data?.month || "—",
        r.employee_name,
        Number(r.form_data?.summary?.qty ?? 0),
        Number(valueOf(r).toFixed(2)),
        statusLabel(r.status, r.form_data),
        new Date(r.created_at).toLocaleDateString("ar-EG"),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!views"] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الجرد الشهري");
    XLSX.writeFile(wb, `الجرد_الشهري_${year || "الكل"}${month ? "-" + month : ""}.xlsx`);
  };

  const actionTabs: ActionTab[] = [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "data",
          label: "بيانات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => { load(); loadPrices(); } },
            ...(selected
              ? [{ key: "save-prices", label: savingPrices ? "جارٍ الحفظ..." : "حفظ الأسعار", icon: Save, variant: "primary" as const, disabled: savingPrices, onClick: savePrices }]
              : []),
          ],
        },
        {
          key: "export",
          label: "تصدير",
          items: [
            {
              key: "excel",
              label: "تصدير Excel",
              icon: FileSpreadsheet,
              onClick: () => (selected ? exportMonthlyInventoryToExcel(selected.form_data, prices) : exportList()),
            },
            { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print() },
          ],
        },
      ],
    },
  ];

  const body = selected ? (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelected(null)}>
          <ArrowRight className="h-4 w-4" /> رجوع للقائمة
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">
        مقدم النموذج: <b className="text-foreground">{selected.employee_name}</b> —{" "}
        {new Date(selected.created_at).toLocaleDateString("ar-EG")}
      </div>
      <MonthlyInventoryView
        data={selected.form_data}
        prices={prices}
        onPriceChange={(item, price) => setPrices((p) => ({ ...p, [item]: price }))}
        hideExport
      />
    </div>
  ) : (
    <div className="space-y-4" dir="rtl">
      <Card className="print:hidden">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <Select value={branch || "all"} onValueChange={(v) => setBranch(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={year || "all"} onValueChange={(v) => setYear(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="كل السنوات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل السنوات</SelectItem>
              {years.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={month || "all"} onValueChange={(v) => setMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="كل الشهور" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الشهور</SelectItem>
              {months.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} نموذج</span>
          <span className="text-xs text-muted-foreground mr-auto">
            إجمالي القيمة: <b className="text-foreground">{fmt(filtered.reduce((s, r) => s + valueOf(r), 0))}</b>
          </span>
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
                  <th className="p-2 text-right">قيمة الجرد</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right w-[120px]">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">{r.form_data?.branch_name || "—"}</td>
                    <td className="p-2">{r.form_data?.month || "—"}</td>
                    <td className="p-2">{r.employee_name}</td>
                    <td className="p-2">{r.form_data?.summary?.qty ?? "—"}</td>
                    <td className="p-2 font-semibold">{fmt(valueOf(r))}</td>
                    <td className="p-2">
                      <Badge variant="outline">{statusLabel(r.status, r.form_data)}</Badge>
                      {r.archived_at && <span className="text-[10px] text-muted-foreground mr-1">مؤرشف</span>}
                    </td>
                    <td className="p-2">{new Date(r.created_at).toLocaleDateString("ar-EG")}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-0.5 print:hidden">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="عرض" onClick={() => setSelected(r)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7" title="تصدير Excel"
                          onClick={() => exportMonthlyInventoryToExcel(r.form_data, prices)}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7" title="طباعة"
                          onClick={() => { setSelected(r); setTimeout(() => window.print(), 300); }}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
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

  return (
    <FinanceShell
      title="الجرد الشهري — جميع الفروع"
      subtitle="مراجعة نماذج الجرد وتسعيرها لمعرفة قيمة المخزون لكل فرع وشهر"
      breadcrumb={[{ label: "المالية", href: "/accounting-center" }, { label: "الجرد الشهري" }]}
      actionTabs={actionTabs}
      storageKey="monthly-inventory-review"
    >
      {body}
    </FinanceShell>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, AlertTriangle } from "lucide-react";

interface Row {
  contact_id: string;
  contact_name: string;
  contact_type: string | null;
  linked_account_code: string | null;
  is_archived: boolean;
  is_active: boolean;
  stored_balance: number;
  ledger_debits: number;
  ledger_credits: number;
  ledger_balance: number;
  variance: number;
  tx_count: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function ContactBalanceReconciliationPage() {
  const { ownerId } = useDataOwnerId();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"variance" | "all" | "archived_with_activity">("variance");

  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);
    supabase
      .rpc("get_contact_balance_reconciliation", { p_user_id: ownerId })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setRows([]);
        } else {
          setRows((data as any as Row[]) || []);
        }
        setLoading(false);
      });
  }, [ownerId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "variance" && Math.abs(r.variance) < 0.01) return false;
        if (filter === "archived_with_activity" && !(r.is_archived && r.tx_count > 0)) return false;
        if (!q) return true;
        return (
          r.contact_name?.toLowerCase().includes(q) ||
          (r.linked_account_code || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [rows, search, filter]);

  const totals = useMemo(() => {
    const withVariance = rows.filter((r) => Math.abs(r.variance) >= 0.01).length;
    const archivedWithActivity = rows.filter((r) => r.is_archived && r.tx_count > 0).length;
    const totalVariance = rows.reduce((s, r) => s + Math.abs(r.variance), 0);
    return { total: rows.length, withVariance, archivedWithActivity, totalVariance };
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      "Contact Name","Type","Account Code","Archived","Active",
      "Stored Balance","Ledger Debits","Ledger Credits","Ledger Balance","Variance","Tx Count",
    ];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        JSON.stringify(r.contact_name || ""),
        r.contact_type || "",
        r.linked_account_code || "",
        r.is_archived ? "yes" : "no",
        r.is_active ? "yes" : "no",
        r.stored_balance, r.ledger_debits, r.ledger_credits,
        r.ledger_balance, r.variance, r.tx_count,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contact-balance-reconciliation-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">مطابقة أرصدة جهات الاتصال</h1>
          <p className="text-sm text-muted-foreground mt-1">
            مقارنة بين الرصيد المخزّن على جهة الاتصال والرصيد الفعلي من دفتر الأستاذ. <strong>عرض للقراءة فقط</strong> — لا يعدّل أي بيانات.
          </p>
        </div>
        <Button onClick={exportCsv} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> تصدير CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">إجمالي جهات الاتصال</div>
          <div className="text-2xl font-bold">{totals.total}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">فيها فرق</div>
          <div className="text-2xl font-bold text-amber-600">{totals.withVariance}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">مؤرشفة وعليها حركات</div>
          <div className="text-2xl font-bold text-red-600">{totals.archivedWithActivity}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">إجمالي الفروقات المطلقة</div>
          <div className="text-2xl font-bold">{fmt(totals.totalVariance)}</div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="بحث بالاسم أو رقم الحساب…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="variance">فقط الي فيها فرق</SelectItem>
            <SelectItem value="archived_with_activity">مؤرشفة عليها حركات</SelectItem>
            <SelectItem value="all">عرض الكل</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          يظهر {filtered.length} من {rows.length}
        </div>
      </div>

      <Card className="overflow-auto">
        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-right">جهة الاتصال</th>
                <th className="p-2 text-right">النوع</th>
                <th className="p-2 text-right">الحساب</th>
                <th className="p-2 text-right">حركات</th>
                <th className="p-2 text-right">المخزّن</th>
                <th className="p-2 text-right">من الأستاذ</th>
                <th className="p-2 text-right">الفرق</th>
                <th className="p-2 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const bigVar = Math.abs(r.variance) >= 100;
                return (
                  <tr key={r.contact_id} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-medium">{r.contact_name}</td>
                    <td className="p-2 text-muted-foreground">{r.contact_type || "-"}</td>
                    <td className="p-2 font-mono text-xs">{r.linked_account_code || "-"}</td>
                    <td className="p-2 tabular-nums">{r.tx_count}</td>
                    <td className="p-2 tabular-nums" dir="ltr">{fmt(r.stored_balance)}</td>
                    <td className="p-2 tabular-nums" dir="ltr">{fmt(r.ledger_balance)}</td>
                    <td className={`p-2 tabular-nums font-semibold ${bigVar ? "text-red-600" : "text-amber-600"}`} dir="ltr">
                      {r.variance > 0 ? "+" : ""}{fmt(r.variance)}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1 flex-wrap">
                        {r.is_archived && <Badge variant="destructive" className="text-xs">مؤرشف</Badge>}
                        {!r.is_active && !r.is_archived && <Badge variant="secondary" className="text-xs">غير نشط</Badge>}
                        {r.is_archived && r.tx_count > 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" /> مؤرشف مع حركات
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <div className="text-xs text-muted-foreground border-t pt-3">
        <strong>ملاحظة محاسبية:</strong> عمود "المخزّن" يمثّل القيمة المسجّلة على جهة الاتصال (قد تشمل رصيداً افتتاحياً تاريخياً غير مسجّل كقيد).
        عمود "من الأستاذ" محسوب من حركات جدول القيود على الحساب المرتبط. الفرق لا يعني بالضرورة خطأً — راجعه مع الفريق قبل أي تعديل.
      </div>
    </div>
  );
}
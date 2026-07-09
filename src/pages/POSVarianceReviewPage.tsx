import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * تدقيق إعادة احتساب عهد نقطة البيع.
 *
 * قراءة فقط 100% — تقارن العجز/الفائض المخزّن بالمخزون في pos_sessions
 * مع إعادة الحساب بالمنطق المُصحّح (يشمل التحويلات، ويستثني غير النقدي).
 *
 * يعرض الفرق (delta) لكل وردية حتى نحدد الموظفين الذين ظُلموا بخصم فائض/عجز غير حقيقي.
 * لا يتم أي تعديل على أي بيانات.
 */

type Row = {
  session_id: string;
  cashier_name: string | null;
  closed_at: string | null;
  stored_variance: number;
  recomputed_variance: number;
  delta: number;
};

type OrphanRow = {
  transaction_id: string;
  transaction_date: string;
  order_id: string;
  order_number: string;
  amount: number;
  debit_account_code: string;
};

export default function POSVarianceReviewPage() {
  const dataOwnerId = useDataOwnerId();
  const [days, setDays] = useState(60);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [orphans, setOrphans] = useState<OrphanRow[]>([]);

  const load = async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data: varData, error: varErr }, { data: orphData, error: orphErr }] = await Promise.all([
        supabase.rpc("diagnose_pos_variance_range", { p_user_id: dataOwnerId, p_days: days }),
        supabase.rpc("list_orphaned_employee_account_posts", { p_user_id: dataOwnerId }),
      ]);
      if (varErr) throw varErr;
      if (orphErr) throw orphErr;
      setRows((varData || []) as Row[]);
      setOrphans((orphData || []) as OrphanRow[]);
    } catch (e: any) {
      toast.error(e.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataOwnerId, days]);

  const flagged = rows.filter((r) => Math.abs(Number(r.delta) || 0) > 0.5);
  const totalDelta = flagged.reduce((s, r) => s + Number(r.delta || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
            تدقيق إعادة احتساب العهد
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            مقارنة العجز/الفائض المخزّن مع الحساب المُصحّح (يشمل التحويلات، يستثني الحركات غير النقدية).
            <strong className="text-foreground"> قراءة فقط — لا يتم أي تعديل.</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-3 py-2 text-sm bg-background"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={60}>آخر 60 يوم</option>
            <option value={180}>آخر 180 يوم</option>
          </select>
          <Button onClick={load} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ورديات بفرق حقيقي</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{flagged.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">مجموع الفروقات (شيكل)</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalDelta < 0 ? "text-red-600" : "text-green-600"}`}>
              {totalDelta.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ترحيلات موظفين خاطئة (11300000)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{orphans.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ورديات يختلف عجزها/فائضها الحقيقي عن المخزّن</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
          ) : flagged.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">لا يوجد فروقات — كل الورديات متطابقة ✓</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الكاشير</TableHead>
                  <TableHead>تاريخ الإغلاق</TableHead>
                  <TableHead className="text-left">العجز/الفائض المخزّن</TableHead>
                  <TableHead className="text-left">بعد التصحيح</TableHead>
                  <TableHead className="text-left">الفارق</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagged.map((r) => {
                  const delta = Number(r.delta || 0);
                  const unfair = delta > 0; // stored was more negative than reality → employee over-charged
                  return (
                    <TableRow key={r.session_id}>
                      <TableCell>{r.cashier_name || "-"}</TableCell>
                      <TableCell>{r.closed_at ? new Date(r.closed_at).toLocaleString("ar") : "-"}</TableCell>
                      <TableCell className="tabular-nums">{Number(r.stored_variance || 0).toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums font-semibold">{Number(r.recomputed_variance || 0).toFixed(2)}</TableCell>
                      <TableCell className={`tabular-nums font-bold ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {unfair ? (
                          <Badge variant="destructive">موظف مظلوم</Badge>
                        ) : (
                          <Badge variant="secondary">فائض غير حقيقي</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {orphans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-700">
              فواتير أكل موظفين رُحّلت خطأً على حساب "عملاء نقاط البيع النقديون" (11300000)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead className="text-left">المبلغ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphans.slice(0, 100).map((o) => (
                  <TableRow key={o.transaction_id}>
                    <TableCell>{o.transaction_date}</TableCell>
                    <TableCell>{o.order_number}</TableCell>
                    <TableCell className="tabular-nums">{Number(o.amount).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {orphans.length > 100 && (
              <div className="text-sm text-muted-foreground mt-2">
                يعرض أول 100 من أصل {orphans.length}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, RefreshCw, Wrench, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  const { dataOwnerId } = useDataOwnerId();
  const { user } = useAuth();
  const [days, setDays] = useState(60);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [orphans, setOrphans] = useState<OrphanRow[]>([]);
  const [zeroFloats, setZeroFloats] = useState<any[]>([]);
  const [empAccounts, setEmpAccounts] = useState<{ account_code: string; account_name: string }[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  // Reconcile dialog
  const [reconcileFor, setReconcileFor] = useState<Row | null>(null);
  const [reconcileNote, setReconcileNote] = useState("");

  // Reroute dialog
  const [rerouteFor, setRerouteFor] = useState<OrphanRow | null>(null);
  const [rerouteTarget, setRerouteTarget] = useState<string>("");
  const [rerouteNote, setRerouteNote] = useState("");

  const load = async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data: varData, error: varErr }, { data: orphData, error: orphErr },
             { data: floatData }, { data: accData }] = await Promise.all([
        supabase.rpc("diagnose_pos_variance_range", { p_user_id: dataOwnerId, p_days: days }),
        supabase.rpc("list_orphaned_employee_account_posts", { p_user_id: dataOwnerId }),
        supabase.rpc("diagnose_pos_zero_float_sessions", { p_user_id: dataOwnerId, p_days: days }),
        supabase.rpc("list_employee_receivable_accounts", { p_user_id: dataOwnerId }),
      ]);
      if (varErr) throw varErr;
      if (orphErr) throw orphErr;
      setRows((varData || []) as Row[]);
      setOrphans((orphData || []) as OrphanRow[]);
      setZeroFloats((floatData || []) as any[]);
      setEmpAccounts((accData || []) as any[]);
    } catch (e: any) {
      toast.error(e.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  const runReconcile = async () => {
    if (!reconcileFor || !user?.id) return;
    setPending(reconcileFor.session_id);
    try {
      const { data, error } = await supabase.rpc("reconcile_pos_session_variance", {
        p_session_id: reconcileFor.session_id,
        p_actor_user_id: user.id,
        p_note: reconcileNote || null,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any).error);
      toast.success(`تم تحديث العجز/الفائض المخزّن لهذه الوردية ✓`);
      setReconcileFor(null); setReconcileNote("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "فشل التصحيح");
    } finally {
      setPending(null);
    }
  };

  const runReroute = async () => {
    if (!rerouteFor || !user?.id || !rerouteTarget) return;
    setPending(rerouteFor.transaction_id);
    try {
      const { data, error } = await supabase.rpc("reroute_orphaned_employee_account_post", {
        p_transaction_id: rerouteFor.transaction_id,
        p_new_debit_account_code: rerouteTarget,
        p_actor_user_id: user.id,
        p_note: rerouteNote || null,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any).error);
      toast.success(`تم إعادة توجيه الحركة إلى ${rerouteTarget} ✓`);
      setRerouteFor(null); setRerouteTarget(""); setRerouteNote("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "فشل الإصلاح");
    } finally {
      setPending(null);
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

      {zeroFloats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-700">
              ورديات فُتحت بعهدة صفر وأغلقت بفائض كبير (عهدة افتتاحية غير مسجّلة؟)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>الكاشير</TableHead>
                <TableHead>الفتح</TableHead>
                <TableHead>الإغلاق</TableHead>
                <TableHead className="text-left">فائض ظاهري</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {zeroFloats.slice(0,50).map((z) => (
                  <TableRow key={z.session_id}>
                    <TableCell>{z.cashier_name || "-"}</TableCell>
                    <TableCell>{z.opened_at ? new Date(z.opened_at).toLocaleString("ar") : "-"}</TableCell>
                    <TableCell>{z.closed_at ? new Date(z.closed_at).toLocaleString("ar") : "-"}</TableCell>
                    <TableCell className="tabular-nums text-green-700">
                      +{Number(z.cash_variance || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                      <TableCell>
                        <Button size="sm" variant="outline"
                          disabled={pending === r.session_id}
                          onClick={() => { setReconcileFor(r); setReconcileNote(""); }}>
                          {pending === r.session_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3 ml-1" />}
                          تصحيح المخزّن
                        </Button>
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphans.slice(0, 100).map((o) => (
                  <TableRow key={o.transaction_id}>
                    <TableCell>{o.transaction_date}</TableCell>
                    <TableCell>{o.order_number}</TableCell>
                    <TableCell className="tabular-nums">{Number(o.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline"
                        disabled={pending === o.transaction_id}
                        onClick={() => { setRerouteFor(o); setRerouteTarget(""); setRerouteNote(""); }}>
                        {pending === o.transaction_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3 ml-1" />}
                        إعادة توجيه
                      </Button>
                    </TableCell>
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

      {/* Reconcile dialog */}
      <AlertDialog open={!!reconcileFor} onOpenChange={(v) => !v && setReconcileFor(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تصحيح عجز/فائض الوردية المخزّن</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>سيتم تحديث القيمة المخزّنة في <b>pos_sessions</b> و<b>pos_shift_audits</b> فقط.</div>
              <div className="text-xs text-muted-foreground">
                لا تُلغى أي قيود محاسبية سابقة — إذا كان قد خُصم من الموظف مبلغ ظالم، يقوم المحاسب لاحقًا بترحيل قيد يدوي لاسترداد الفارق.
              </div>
              {reconcileFor && (
                <div className="text-sm bg-muted p-2 rounded">
                  <div>الكاشير: <b>{reconcileFor.cashier_name}</b></div>
                  <div>المخزّن: {Number(reconcileFor.stored_variance).toFixed(2)} → الجديد: <b>{Number(reconcileFor.recomputed_variance).toFixed(2)}</b></div>
                  <div>الفارق: <b>{Number(reconcileFor.delta).toFixed(2)}</b></div>
                </div>
              )}
              <Textarea placeholder="ملاحظة (اختياري)" value={reconcileNote} onChange={(e) => setReconcileNote(e.target.value)} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={runReconcile}>
              <CheckCircle2 className="h-4 w-4 ml-1" />تنفيذ التصحيح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reroute dialog */}
      <AlertDialog open={!!rerouteFor} onOpenChange={(v) => !v && setRerouteFor(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة توجيه حركة أكل موظف</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>الحركة مرحّلة حاليًا على <b>11300000</b> (عملاء نقاط البيع النقديون). اختر حساب ذمم الموظف الصحيح.</div>
              {rerouteFor && (
                <div className="text-sm bg-muted p-2 rounded">
                  <div>رقم الفاتورة: <b>{rerouteFor.order_number}</b></div>
                  <div>المبلغ: <b>{Number(rerouteFor.amount).toFixed(2)}</b></div>
                </div>
              )}
              <div>
                <Select value={rerouteTarget} onValueChange={setRerouteTarget}>
                  <SelectTrigger><SelectValue placeholder="اختر حساب الموظف..." /></SelectTrigger>
                  <SelectContent className="max-h-72 overflow-auto">
                    {empAccounts.map((a) => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        {a.account_code} — {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea placeholder="ملاحظة (اختياري)" value={rerouteNote} onChange={(e) => setRerouteNote(e.target.value)} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={runReroute} disabled={!rerouteTarget}>
              <CheckCircle2 className="h-4 w-4 ml-1" />تنفيذ الإصلاح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
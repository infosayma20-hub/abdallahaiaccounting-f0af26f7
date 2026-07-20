import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { CheckCircle2, Clock, ScaleIcon, Loader2, ClipboardCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ShiftSnapshotDiffPanel from "@/components/pos/ShiftSnapshotDiffPanel";

/**
 * تدقيق ورديات نقطة البيع — للمحاسبين.
 *
 * المرحلة 1: قائمة الورديات المُغلقة بحالة "بانتظار المراجعة"
 * مع بطاقة تدقيق تسمح باعتماد الوردية أو تأجيلها.
 * الاعتماد الافتراضي = تسجيل الفائض/العجز على حساب الموظف
 * (نفس السلوك القديم قبل هذا التغيير).
 *
 * المراحل التالية ستضيف:
 *  - خيار "مصروف على الشركة" للعجز
 *  - خيار "إيراد للشركة" للفائض
 *  - خيار "مخالفة على الموظف" (يخصم الفائض عليه بدل من إضافته لحسابه)
 *  - تعديل تفاعلي للحركات (مصاريف/مرتجعات) قبل الاعتماد
 */

type AuditRow = {
  id: string;
  session_id: string;
  cashier_name: string | null;
  opened_at: string | null;
  closed_at: string | null;
  variance_ils: number;
  variance_usd: number;
  variance_jod: number;
  variance_total_ils: number;
  expected_cash_ils: number | null;
  actual_cash_ils: number | null;
  status: "pending" | "approved" | "void";
  resolution_type: string;
  accountant_notes: string | null;
  approved_at: string | null;
};

type ResolutionOption =
  | "employee_wallet"
  | "deferred";

/* ------------- ترجمة طرق الدفع للعربية ------------- */
const PAY_METHOD_AR: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة/فيزا",
  credit: "بيع آجل (على الحساب)",
  employee_account: "على حساب الموظف",
  cheque: "شيك",
  bank_transfer: "حوالة بنكية",
  wallet: "محفظة إلكترونية",
};
const CURRENCY_AR: Record<string, string> = {
  ILS: "شيكل",
  USD: "دولار",
  JOD: "دينار",
};
const arMethod = (m?: string | null) => (m && PAY_METHOD_AR[m]) || m || "—";
const arCurr = (c?: string | null) => (c && CURRENCY_AR[c]) || c || "—";

type SessionDetails = {
  loading: boolean;
  paymentsByMethod: Array<{ method: string; currency: string; total: number; count: number; refunds: number }>;
  ordersCount: number;
  cancelledCount: number;
  cancelledTotal: number;
  creditTotal: number;
  employeeAccountTotal: number;
  callCenterCount: number;
  cardReferences: Array<{ ref: string; total: number; currency: string }>;
};

function useSessionDetails(sessionId: string, dataOwnerId: string | null | undefined) {
  const [state, setState] = useState<SessionDetails>({
    loading: true,
    paymentsByMethod: [],
    ordersCount: 0,
    cancelledCount: 0,
    cancelledTotal: 0,
    creditTotal: 0,
    employeeAccountTotal: 0,
    callCenterCount: 0,
    cardReferences: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionId || !dataOwnerId) return;
      // 1) طلبات الوردية — نجلبها من الـ view الموحّد `pos_orders_effective`
      //    الذي يحسب `effective_state` (active / voided / cancelled) بنفس
      //    منطق شاشة إغلاق العهدة تمامًا، فيتطابق كل رقم بين الشاشتين.
      const { data: orders } = await supabase
        .from("pos_orders_effective" as any)
        .select("id,total,state,effective_state,cancelled_at,notes,order_type,ils_equivalent,currency")
        .eq("user_id", dataOwnerId)
        .eq("session_id", sessionId);
      // ✅ الدفعات تُحسب فقط من الطلبات النشطة (active) — نستثني الملغاة
      //    والمفسوخة محاسبيًا (paid لكن قيدها is_deleted=true) لأنها لا
      //    تمثّل إيرادًا حقيقيًا. هذا كان مصدر الفروقات مع إيصال الإغلاق.
      const activeOrders = (orders || []).filter((o: any) => o.effective_state === "active");
      const ids = activeOrders.map((o: any) => o.id);
      const cancelled_ = (orders || []).filter(
        (o: any) => o.effective_state === "cancelled" || o.effective_state === "voided",
      );
      const callCenter = (orders || []).filter((o: any) =>
        (o.notes || "").toLowerCase().includes("call") ||
        (o.notes || "").includes("كول") ||
        (o.notes || "").includes("كولسنتر"),
      );

      // 2) الدفعات
      let payments: any[] = [];
      if (ids.length) {
        const { data: pays } = await supabase
          .from("pos_payments")
          .select("payment_method,currency,amount,is_refund,card_reference,reference,order_id")
          .in("order_id", ids);
        payments = pays || [];
      }

      // تجميع حسب (طريقة، عملة)
      const map = new Map<string, { method: string; currency: string; total: number; count: number; refunds: number }>();
      let creditTotal = 0;
      let employeeAccountTotal = 0;
      const cardRefs = new Map<string, { total: number; currency: string }>();

      for (const p of payments) {
        const key = `${p.payment_method}::${p.currency}`;
        const entry = map.get(key) || {
          method: p.payment_method,
          currency: p.currency,
          total: 0,
          count: 0,
          refunds: 0,
        };
        const amt = Number(p.amount || 0);
        entry.total += amt;
        entry.count += 1;
        if (p.is_refund) entry.refunds += amt;
        map.set(key, entry);

        if (p.payment_method === "credit") creditTotal += amt;
        if (p.payment_method === "employee_account") employeeAccountTotal += amt;

        if (p.payment_method === "card") {
          const ref = (p.card_reference || p.reference || "بطاقة عامة").toString();
          const r = cardRefs.get(ref) || { total: 0, currency: p.currency };
          r.total += amt;
          cardRefs.set(ref, r);
        }
      }

      if (cancelled) return;
      setState({
        loading: false,
        paymentsByMethod: Array.from(map.values()).sort((a, b) => b.total - a.total),
        ordersCount: (orders || []).length,
        cancelledCount: cancelled_.length,
        cancelledTotal: cancelled_.reduce((s: number, o: any) => s + Number(o.ils_equivalent || o.total || 0), 0),
        creditTotal,
        employeeAccountTotal,
        callCenterCount: callCenter.length,
        cardReferences: Array.from(cardRefs.entries()).map(([ref, v]) => ({ ref, ...v })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataOwnerId]);

  return state;
}

export default function POSShiftAuditPage() {
  const { dataOwnerId } = useDataOwnerId();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved">("pending");
  const [openAudit, setOpenAudit] = useState<AuditRow | null>(null);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pos_shift_audits" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .eq("status", tab)
      .order("closed_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("تعذّر تحميل التدقيقات: " + error.message);
      setLoading(false);
      return;
    }
    setRows((data as any as AuditRow[]) || []);
    setLoading(false);
  }, [dataOwnerId, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    let surplus = 0;
    let shortage = 0;
    rows.forEach((r) => {
      const v = Number(r.variance_total_ils || 0);
      if (v > 0) surplus += v;
      else if (v < 0) shortage += -v;
    });
    return { surplus, shortage, count: rows.length };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            تدقيق ورديات نقطة البيع
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            راجع الفائض/العجز قبل اعتماده على حساب الموظف. الاعتماد يُنشئ القيد المحاسبي وحركة الموظف نهائياً.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("pending")}
            className="gap-1"
          >
            <Clock className="h-4 w-4" />
            بانتظار المراجعة
          </Button>
          <Button
            variant={tab === "approved" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("approved")}
            className="gap-1"
          >
            <CheckCircle2 className="h-4 w-4" />
            المعتمدة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 bg-card">
          <div className="text-[11px] text-muted-foreground">عدد الورديات</div>
          <div className="text-lg font-bold">{totals.count}</div>
        </div>
        <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/30">
          <div className="text-[11px] text-muted-foreground">إجمالي الفائض</div>
          <div className="text-lg font-bold text-emerald-700">
            ₪{totals.surplus.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border p-3 bg-rose-50 dark:bg-rose-950/30">
          <div className="text-[11px] text-muted-foreground">إجمالي العجز</div>
          <div className="text-lg font-bold text-rose-700">
            ₪{totals.shortage.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            لا توجد ورديات {tab === "pending" ? "بانتظار المراجعة" : "معتمدة"}.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكاشير</TableHead>
                <TableHead className="text-right">فتح</TableHead>
                <TableHead className="text-right">إغلاق</TableHead>
                <TableHead className="text-right">المتوقع</TableHead>
                <TableHead className="text-right">الفعلي</TableHead>
                <TableHead className="text-right">الفرق (₪)</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const v = Number(r.variance_total_ils || 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.cashier_name || "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.opened_at ? new Date(r.opened_at).toLocaleString("ar-PS") : "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.closed_at ? new Date(r.closed_at).toLocaleString("ar-PS") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.expected_cash_ils?.toFixed(2) ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.actual_cash_ils?.toFixed(2) ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`font-mono font-bold ${
                        v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : ""
                      }`}
                    >
                      {v > 0 ? "+" : ""}
                      {v.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {r.status === "pending" ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-400">
                          بانتظار
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-400">
                          معتمدة
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={r.status === "pending" ? "default" : "outline"}
                        onClick={() => setOpenAudit(r)}
                      >
                        {r.status === "pending" ? "تدقيق" : "عرض"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {openAudit && (
        <AuditDialog
          audit={openAudit}
          onClose={() => setOpenAudit(null)}
          onDone={() => {
            setOpenAudit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------- Audit Dialog ------------------- */

function AuditDialog({
  audit,
  onClose,
  onDone,
}: {
  audit: AuditRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { dataOwnerId } = useDataOwnerId();
  const details = useSessionDetails(audit.session_id, dataOwnerId);
  const [resolution, setResolution] = useState<ResolutionOption>(
    (audit.resolution_type as ResolutionOption) || "employee_wallet",
  );
  const [notes, setNotes] = useState<string>(audit.accountant_notes || "");
  const [submitting, setSubmitting] = useState(false);
  const readOnly = audit.status === "approved";

  const v = Number(audit.variance_total_ils || 0);
  const isSurplus = v > 0;
  const isShortage = v < 0;
  const abs = Math.abs(v);

  const approve = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc(
        "approve_pos_shift_audit" as any,
        {
          p_audit_id: audit.id,
          p_resolution_type: resolution,
          p_resolution_payload: {},
          p_notes: notes.trim() || null,
        } as any,
      );
      if (error) throw error;
      const res = data as any;
      if (res?.success === false) {
        toast.error(res.message || res.error || "فشل الاعتماد");
        return;
      }
      toast.success(
        resolution === "deferred" ? "تم تأجيل الوردية" : "تم اعتماد الوردية وترحيل القيد",
      );
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScaleIcon className="h-4 w-4 text-primary" />
            تدقيق وردية — {audit.cashier_name || "—"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            راجع الفروقات بعناية. عند الاعتماد، سيتم إنشاء القيد المحاسبي وحركة الموظف
            بشكل نهائي — أي تعديل لاحق سيحتاج قيد عكسي.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Per-currency breakdown */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="rounded border p-2 text-center">
              <div className="text-[10px] text-muted-foreground">شيكل</div>
              <div className="font-mono font-bold">
                {audit.variance_ils?.toFixed(2)}
              </div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="text-[10px] text-muted-foreground">دولار</div>
              <div className="font-mono font-bold">
                {audit.variance_usd?.toFixed(2)}
              </div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="text-[10px] text-muted-foreground">دينار</div>
              <div className="font-mono font-bold">
                {audit.variance_jod?.toFixed(2)}
              </div>
            </div>
            <div
              className={`rounded border p-2 text-center ${
                isSurplus
                  ? "bg-emerald-50 border-emerald-400"
                  : isShortage
                    ? "bg-rose-50 border-rose-400"
                    : ""
              }`}
            >
              <div className="text-[10px] text-muted-foreground">
                الإجمالي ₪
              </div>
              <div
                className={`font-mono font-bold ${
                  isSurplus ? "text-emerald-700" : isShortage ? "text-rose-700" : ""
                }`}
              >
                {v > 0 ? "+" : ""}
                {v.toFixed(2)}
              </div>
            </div>
          </div>

          {/* تفاصيل الوردية */}
          <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
            <div className="text-xs font-semibold flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3" />
              تفاصيل الوردية
            </div>

            {details.loading ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> جارٍ تحميل التفاصيل…
              </div>
            ) : (
              <>
                {/* مؤشرات سريعة */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded border bg-card p-2">
                    <div className="text-muted-foreground">عدد الطلبات</div>
                    <div className="font-bold">{details.ordersCount}</div>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <div className="text-muted-foreground">طلبات ملغاة</div>
                    <div className="font-bold text-rose-700">
                      {details.cancelledCount} <span className="text-[10px]">({details.cancelledTotal.toFixed(2)} ₪)</span>
                    </div>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <div className="text-muted-foreground">بيع آجل</div>
                    <div className="font-bold text-amber-700">{details.creditTotal.toFixed(2)}</div>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <div className="text-muted-foreground">على حساب الموظف</div>
                    <div className="font-bold text-blue-700">{details.employeeAccountTotal.toFixed(2)}</div>
                  </div>
                </div>

                {/* تفصيل طرق الدفع */}
                {details.paymentsByMethod.length > 0 && (
                  <div className="rounded border bg-card overflow-hidden">
                    <div className="text-[11px] font-semibold px-2 py-1 bg-muted/60 border-b">
                      تفصيل الدفعات حسب الطريقة والعملة
                    </div>
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-right p-1.5">طريقة الدفع</th>
                          <th className="text-right p-1.5">العملة</th>
                          <th className="text-right p-1.5">عدد الحركات</th>
                          <th className="text-right p-1.5">الإجمالي</th>
                          <th className="text-right p-1.5">منها مرتجعات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.paymentsByMethod.map((p) => (
                          <tr key={p.method + p.currency} className="border-t">
                            <td className="p-1.5">{arMethod(p.method)}</td>
                            <td className="p-1.5">{arCurr(p.currency)}</td>
                            <td className="p-1.5 font-mono">{p.count}</td>
                            <td className="p-1.5 font-mono font-bold">{p.total.toFixed(2)}</td>
                            <td className="p-1.5 font-mono text-rose-700">
                              {p.refunds ? "-" + p.refunds.toFixed(2) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* بطاقات: مرجع/بنك */}
                {details.cardReferences.length > 0 && (
                  <div className="rounded border bg-card overflow-hidden">
                    <div className="text-[11px] font-semibold px-2 py-1 bg-muted/60 border-b">
                      تفصيل البطاقات (لتمييز فيزا الشركات المختلفة)
                    </div>
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-right p-1.5">المرجع / البنك</th>
                          <th className="text-right p-1.5">العملة</th>
                          <th className="text-right p-1.5">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.cardReferences.map((c) => (
                          <tr key={c.ref} className="border-t">
                            <td className="p-1.5">{c.ref}</td>
                            <td className="p-1.5">{arCurr(c.currency)}</td>
                            <td className="p-1.5 font-mono font-bold">{c.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {details.callCenterCount > 0 && (
                  <div className="text-[11px] rounded border border-blue-200 bg-blue-50 p-2 flex items-center justify-between">
                    <span>طلبات واردة من الكول سنتر</span>
                    <span className="font-bold text-blue-700">{details.callCenterCount}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resolution options */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">قرار المعالجة</Label>
            <RadioGroup
              value={resolution}
              onValueChange={(x) => setResolution(x as ResolutionOption)}
              disabled={readOnly || abs === 0}
            >
              <label className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="employee_wallet" />
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    ترحيل على حساب الموظف
                    {isShortage && " (خصم من راتبه)"}
                    {isSurplus && " (إضافة لرصيده)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    السلوك الافتراضي — يُنشئ خصم/إيراد على الموظف ويظهر في «محفظتي».
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 opacity-60">
                <RadioGroupItem value="deferred" />
                <div className="flex-1">
                  <div className="text-sm font-medium">تأجيل للمراجعة لاحقاً</div>
                  <div className="text-[11px] text-muted-foreground">
                    إبقاء الوردية بحالة «بانتظار» — لا يُنشأ أي قيد الآن.
                  </div>
                </div>
              </label>
            </RadioGroup>

            <div className="text-[11px] text-muted-foreground flex items-start gap-1 mt-2 p-2 rounded bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-600 shrink-0" />
              <span>
                خيارات إضافية (مصروف شركة / إيراد شركة / مخالفة موظف / تعديل الحركات)
                ستتوفر في المرحلة 2 من نظام التدقيق.
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">ملاحظات المحاسب</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="سبب القرار / مبررات الموظف / أي ملاحظة للتوثيق…"
              disabled={readOnly}
            />
          </div>

          {readOnly && (
            <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
              اعتمدت في {audit.approved_at ? new Date(audit.approved_at).toLocaleString("ar-PS") : "—"}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {readOnly ? "إغلاق" : "إلغاء"}
          </Button>
          {!readOnly && (
            <Button onClick={approve} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {resolution === "deferred" ? "حفظ التأجيل" : "اعتماد الوردية"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
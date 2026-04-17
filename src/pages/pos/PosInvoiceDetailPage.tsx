import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Printer, XCircle, Receipt, User, Calendar, CreditCard, AlertTriangle, Package, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { fmtDateTimeDisplay, fmtDateDisplay } from "@/lib/utils";

const fmtNum = (n: number) => Number(n || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PosInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!id || !user) return;
    loadOrder();
  }, [id, user]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const { data: ord, error: ordErr } = await supabase
        .from("pos_orders")
        .select("*")
        .eq("id", id!)
        .maybeSingle();

      if (ordErr || !ord) {
        toast.error("الفاتورة غير موجودة");
        navigate(-1);
        return;
      }
      setOrder(ord);

      const [{ data: ln }, { data: pm }, { data: ses }] = await Promise.all([
        supabase.from("pos_order_lines").select("*").eq("order_id", id!),
        supabase.from("pos_payments").select("*").eq("order_id", id!),
        ord.session_id
          ? supabase.from("pos_sessions").select("*").eq("id", ord.session_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setLines(ln || []);
      setPayments(pm || []);
      setSession(ses);
    } catch (e: any) {
      console.error(e);
      toast.error("خطأ في تحميل الفاتورة");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!order || !cancelReason.trim()) {
      toast.error("يرجى كتابة سبب الإلغاء");
      return;
    }
    setCancelling(true);
    try {
      // 1) ابحث عن جميع القيود المرتبطة بهذه الفاتورة (POS قد تنتج عدة قيود: مبيعات + COGS + إلخ)
      const { data: linkedTxns, error: txnErr } = await supabase
        .from("transactions")
        .select("id, transaction_type, amount, currency, foreign_amount, exchange_rate, debit_account_code, credit_account_code, account_id_debit, account_id_credit, description, reference, contact_id, payment_method, expense_category, workshop_id, cost_center_name, reversed_by_id, is_deleted")
        .eq("reference", order.order_number)
        .eq("is_deleted", false);

      if (txnErr) throw txnErr;

      const toReverse = (linkedTxns || []).filter(
        (t: any) => !t.reversed_by_id && !String(t.transaction_type || "").startsWith("reverse")
      );

      // 2) أنشئ قيداً عكسياً يدوياً لكل قيد أصلي (مع إبقاء الأصلي ظاهراً وفق IFRS)
      let reversedCount = 0;
      for (const txn of toReverse) {
        // عكس الحسابات: مدين يصبح دائن والعكس
        const reverseRow = {
          user_id: user?.id,
          transaction_date: new Date().toISOString().split("T")[0],
          description: `عكس قيد: ${txn.description || ""} — إلغاء: ${cancelReason}`,
          debit_account_code: txn.credit_account_code,
          credit_account_code: txn.debit_account_code,
          account_id_debit: txn.account_id_credit,
          account_id_credit: txn.account_id_debit,
          amount: txn.amount,
          currency: txn.currency,
          foreign_amount: txn.foreign_amount,
          exchange_rate: txn.exchange_rate,
          transaction_type: `reverse_${txn.transaction_type}`,
          reference: `REV-${order.order_number}`,
          contact_id: txn.contact_id,
          payment_method: txn.payment_method,
          expense_category: txn.expense_category,
          workshop_id: txn.workshop_id,
          cost_center_name: txn.cost_center_name,
        };

        const { data: inserted, error: insErr } = await supabase
          .from("transactions")
          .insert(reverseRow as any)
          .select("id")
          .single();

        if (insErr) {
          console.error("reverse insert error:", insErr);
          toast.error(`خطأ في القيد العكسي (${txn.transaction_type}): ${insErr.message}`);
          setCancelling(false);
          return;
        }

        // اربط القيد الأصلي بالقيد العكسي (للتوثيق فقط — بدون حذف)
        await supabase
          .from("transactions")
          .update({ reversed_by_id: inserted!.id } as any)
          .eq("id", txn.id);

        reversedCount++;
      }

      // 3) علّم الفاتورة كملغاة
      const { error: updErr } = await supabase
        .from("pos_orders")
        .update({
          state: "cancelled",
          cancel_reason: cancelReason,
          cancelled_at: new Date().toISOString(),
          cancelled_by: user?.email || "غير محدد",
        })
        .eq("id", order.id);

      if (updErr) throw updErr;

      toast.success(
        reversedCount > 0
          ? `تم إلغاء الفاتورة وإنشاء ${reversedCount} قيد عكسي بنجاح`
          : "تم إلغاء الفاتورة (لا توجد قيود محاسبية للعكس)"
      );
      await loadOrder();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "فشل الإلغاء");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) return null;

  const isCancelled = order.state === "cancelled";
  const stateLabels: Record<string, { label: string; variant: any }> = {
    paid: { label: "مكتمل", variant: "default" },
    cancelled: { label: "ملغي", variant: "destructive" },
    draft: { label: "مسودة", variant: "secondary" },
  };
  const stateInfo = stateLabels[order.state] || { label: order.state, variant: "outline" };

  return (
    <div className="max-w-[1100px] mx-auto p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/reports/pos-invoice-register"))}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">فاتورة POS #{order.order_number}</h1>
              <Badge variant={stateInfo.variant}>{stateInfo.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{fmtDateTimeDisplay(order.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" /> طباعة
          </Button>
          {!isCancelled && order.state === "paid" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5 text-xs">
                  <XCircle className="h-3.5 w-3.5" /> إلغاء الفاتورة
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" /> تأكيد إلغاء فاتورة POS
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2 pt-2">
                    <p>سيتم إنشاء <b>قيد عكسي تلقائي</b> في دفتر اليومية لضمان النزاهة المحاسبية (IFRS) — لن يتم حذف القيد الأصلي.</p>
                    <p className="text-amber-600 dark:text-amber-400 text-xs">⚠️ هذا الإجراء يؤثر على المخزون والتقارير المالية.</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <label className="text-xs font-medium">سبب الإلغاء (إلزامي):</label>
                  <Textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="مثال: خطأ في الإدخال، طلب الزبون، إلخ..."
                    rows={3}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    disabled={cancelling || !cancelReason.trim()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancelling ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {isCancelled && (
        <Card className="p-3 bg-destructive/5 border-destructive/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-destructive">فاتورة ملغاة</p>
              {order.cancel_reason && <p className="text-muted-foreground">السبب: {order.cancel_reason}</p>}
              {order.cancelled_at && <p className="text-muted-foreground">في: {fmtDateTimeDisplay(order.cancelled_at)}</p>}
              {order.cancelled_by && <p className="text-muted-foreground">بواسطة: {order.cancelled_by}</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> العميل</p>
          <p className="text-sm font-bold">{order.customer_name || "—"}</p>
        </Card>
        <Card className="p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> الجلسة</p>
          {session ? (
            <button
              onClick={() => navigate(`/pos-reports?session=${session.id}`)}
              className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
            >
              {session.cashier_name || "غير محدد"} <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <p className="text-sm font-bold">—</p>
          )}
        </Card>
        <Card className="p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> العملة</p>
          <p className="text-sm font-bold">{order.payment_currency || order.currency || "ILS"}</p>
        </Card>
      </div>

      {/* Lines */}
      <Card className="overflow-hidden">
        <div className="px-3 py-2 bg-muted/50 border-b border-border/50 text-xs font-semibold flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" /> الأصناف ({lines.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-right px-3 py-2 text-xs font-semibold">الصنف</th>
                <th className="text-center px-3 py-2 text-xs font-semibold">الكمية</th>
                <th className="text-right px-3 py-2 text-xs font-semibold">السعر</th>
                <th className="text-right px-3 py-2 text-xs font-semibold">الخصم</th>
                <th className="text-right px-3 py-2 text-xs font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border/30">
                  <td className="px-3 py-2 text-sm">{l.product_name}</td>
                  <td className="px-3 py-2 text-sm text-center font-mono">{l.qty}</td>
                  <td className="px-3 py-2 text-sm font-mono">{fmtNum(l.unit_price)}</td>
                  <td className="px-3 py-2 text-sm font-mono">{fmtNum(l.discount_amount || 0)}</td>
                  <td className="px-3 py-2 text-sm font-mono font-bold">{fmtNum(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-bold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-sm">المجموع الفرعي</td>
                <td className="px-3 py-2 text-sm font-mono">{fmtNum(order.subtotal)}</td>
              </tr>
              {(order.discount_amount || 0) > 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm">الخصم</td>
                  <td className="px-3 py-2 text-sm font-mono text-destructive">-{fmtNum(order.discount_amount)}</td>
                </tr>
              )}
              {(order.tax_amount || 0) > 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm">الضريبة</td>
                  <td className="px-3 py-2 text-sm font-mono">{fmtNum(order.tax_amount)}</td>
                </tr>
              )}
              <tr className="bg-primary/5">
                <td colSpan={4} className="px-3 py-3 text-sm font-bold">الصافي</td>
                <td className="px-3 py-3 text-base font-mono font-bold text-primary">₪{fmtNum(order.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Payments */}
      {payments.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 border-b border-border/50 text-xs font-semibold flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> المدفوعات ({payments.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-right px-3 py-2 text-xs font-semibold">الطريقة</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold">العملة</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold">المبلغ المدفوع</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold">سعر الصرف</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold">المعادل (₪)</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const m = p.payment_method === "cash" ? "نقدي" : p.payment_method === "card" ? "بطاقة" : p.payment_method === "credit" ? "آجل" : p.payment_method;
                  const cur = p.currency || "ILS";
                  const rate = Number(p.exchange_rate || 1);
                  const amountILS = Number(p.amount || 0); // مخزّن دائماً بالشيكل
                  const amountForeign = cur !== "ILS" && rate > 0 ? amountILS / rate : amountILS;
                  return (
                    <tr key={p.id} className="border-b border-border/30">
                      <td className="px-3 py-2 text-sm">{m}</td>
                      <td className="px-3 py-2 text-sm font-semibold">{cur}</td>
                      <td className="px-3 py-2 text-sm font-mono font-bold">{fmtNum(amountForeign)} {cur !== "ILS" && <span className="text-xs text-muted-foreground">{cur}</span>}</td>
                      <td className="px-3 py-2 text-sm font-mono text-muted-foreground">{cur !== "ILS" ? fmtNum(rate) : "—"}</td>
                      <td className="px-3 py-2 text-sm font-mono">₪{fmtNum(amountILS)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{fmtDateTimeDisplay(p.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Linked transaction */}
      {order.linked_transaction_id && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">القيد المحاسبي المرتبط</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => navigate(`/transactions?search=${encodeURIComponent(order.order_number)}`)}
            >
              فتح في دفتر اليومية <ExternalLink className="h-3 w-3 mr-1" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

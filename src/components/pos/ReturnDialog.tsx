import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotateCcw, AlertTriangle, Package, Plus, Minus } from "lucide-react";

interface OrderLine {
  id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  total: number;
}

interface ReturnDialogProps {
  open: boolean;
  onClose: () => void;
  originalOrderId: string;
  originalOrderNumber: string | null;
  originalTotal: number;
  originalCurrency: string | null;
  sessionId: string;
  dataOwnerId: string;
  exchangeRates: Record<string, number>;
  onSuccess: () => void;
}

const RETURN_REASONS = [
  "منتج تالف",
  "منتج خاطئ",
  "غير راضٍ",
  "ضمان",
  "خطأ كاشير",
  "أخرى",
];

const CURRENCIES = [
  { code: "ILS", label: "شيكل ₪" },
  { code: "USD", label: "دولار $" },
  { code: "JOD", label: "دينار JD" },
];

export default function ReturnDialog({
  open, onClose, originalOrderId, originalOrderNumber, originalTotal,
  originalCurrency, sessionId, dataOwnerId, exchangeRates, onSuccess,
}: ReturnDialogProps) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [returnedQtys, setReturnedQtys] = useState<Record<string, number>>({});
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [previousReturns, setPreviousReturns] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [returnCurrency, setReturnCurrency] = useState<string>("ILS");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");

  // Load original lines + previously returned qtys
  useEffect(() => {
    if (!open || !originalOrderId) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch original lines
        const { data: linesData } = await supabase
          .from("pos_order_lines")
          .select("id, product_id, product_name, qty, unit_price, cost_price, total")
          .eq("order_id", originalOrderId);

        // Fetch previous return orders linked to this original
        const { data: returnOrders } = await supabase
          .from("pos_orders")
          .select("id")
          .eq("original_order_id", originalOrderId)
          .eq("is_return", true)
          .eq("state", "paid");

        const returnIds = (returnOrders || []).map((o: any) => o.id);
        let prevReturns: Record<string, number> = {};

        if (returnIds.length > 0) {
          const { data: returnLines } = await supabase
            .from("pos_order_lines")
            .select("product_id, product_name, qty")
            .in("order_id", returnIds);

          (returnLines || []).forEach((rl: any) => {
            const key = rl.product_id || rl.product_name;
            prevReturns[key] = (prevReturns[key] || 0) + Number(rl.qty || 0);
          });
        }

        setLines((linesData || []) as OrderLine[]);
        setPreviousReturns(prevReturns);

        // Pre-select nothing, user must opt-in
        const initialQtys: Record<string, number> = {};
        (linesData || []).forEach((l: any) => {
          const key = l.product_id || l.product_name;
          const remaining = Number(l.qty) - (prevReturns[key] || 0);
          initialQtys[l.id] = Math.max(0, remaining);
        });
        setReturnedQtys(initialQtys);
        setSelectedLines(new Set());
      } catch (err) {
        console.error(err);
        toast.error("فشل تحميل أصناف الفاتورة");
      } finally {
        setLoading(false);
      }
    })();

    setReason("");
    setCustomReason("");
    setReturnCurrency(originalCurrency && ["ILS", "USD", "JOD"].includes(originalCurrency) ? originalCurrency : "ILS");
    setPaymentMethod("cash");
  }, [open, originalOrderId, originalCurrency]);

  const toggleLine = (lineId: string) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const setQty = (lineId: string, qty: number, max: number) => {
    const clamped = Math.max(0, Math.min(qty, max));
    setReturnedQtys(prev => ({ ...prev, [lineId]: clamped }));
    if (clamped > 0) setSelectedLines(prev => new Set(prev).add(lineId));
  };

  const totalReturnILS = useMemo(() => {
    let sum = 0;
    lines.forEach(l => {
      if (selectedLines.has(l.id)) {
        const qty = returnedQtys[l.id] || 0;
        sum += qty * l.unit_price;
      }
    });
    return sum;
  }, [lines, selectedLines, returnedQtys]);

  const totalReturnInSelectedCurrency = useMemo(() => {
    if (returnCurrency === "ILS") return totalReturnILS;
    const rate = exchangeRates[returnCurrency] || 1;
    return rate > 0 ? totalReturnILS / rate : totalReturnILS;
  }, [totalReturnILS, returnCurrency, exchangeRates]);

  const selectAll = () => {
    const allIds = new Set<string>();
    const newQtys = { ...returnedQtys };
    lines.forEach(l => {
      const key = l.product_id || l.product_name;
      const max = Number(l.qty) - (previousReturns[key] || 0);
      if (max > 0) {
        allIds.add(l.id);
        newQtys[l.id] = max;
      }
    });
    setSelectedLines(allIds);
    setReturnedQtys(newQtys);
  };

  const deselectAll = () => {
    setSelectedLines(new Set());
  };

  const handleSubmit = async () => {
    if (selectedLines.size === 0 || totalReturnILS <= 0) {
      toast.error("اختر صنفاً واحداً على الأقل بكمية أكبر من صفر");
      return;
    }

    const finalReason = reason === "أخرى" ? customReason : reason;
    if (!finalReason) {
      toast.error("اختر سبب الارتجاع");
      return;
    }

    setSubmitting(true);
    try {
      // Returns require server-side processing (stock reversal, GL reverse entry).
      // We refuse offline to avoid issuing a paper refund the server will reject.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("⚠️ لا يمكن تنفيذ مرتجع بدون إنترنت — انتظر عودة الاتصال");
        setSubmitting(false);
        return;
      }
      const items = lines
        .filter(l => selectedLines.has(l.id) && (returnedQtys[l.id] || 0) > 0)
        .map(l => {
          const qty = returnedQtys[l.id] || 0;
          return {
            line_id: l.id,
            product_id: l.product_id,
            product_name: l.product_name,
            qty,
            unit_price: l.unit_price,
            cost_price: l.cost_price,
            total: qty * l.unit_price,
          };
        });

      const rate = returnCurrency === "ILS" ? 1 : (exchangeRates[returnCurrency] || 1);

      const { data, error } = await supabase.rpc("process_pos_return", {
        p_original_order_id: originalOrderId,
        p_user_id: dataOwnerId,
        p_session_id: sessionId,
        p_items: items,
        p_return_currency: returnCurrency,
        p_return_exchange_rate: rate,
        p_reason: finalReason,
        p_payment_method: paymentMethod,
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || "فشل تنفيذ الارتجاع");
      }

      toast.success(`تم إنشاء مرتجع #${result.return_order_number} بقيمة ₪${result.total_returned}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "فشل تنفيذ الارتجاع");
    } finally {
      setSubmitting(false);
    }
  };

  const hasAvailable = lines.some(l => {
    const key = l.product_id || l.product_name;
    return Number(l.qty) - (previousReturns[key] || 0) > 0;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-destructive" />
            ارتجاع من فاتورة #{originalOrderNumber}
          </DialogTitle>
          <DialogDescription>
            اختر الأصناف والكميات المراد ارتجاعها. يمكن الارتجاع جزئياً عدة مرات.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 px-1">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
          ) : !hasAvailable ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-3" />
              <p className="text-sm font-medium">لا توجد أصناف متاحة للارتجاع</p>
              <p className="text-xs text-muted-foreground mt-1">جميع أصناف هذه الفاتورة مرتجعة بالفعل</p>
            </div>
          ) : (
            <>
              {/* Items selection */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-secondary px-3 py-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">الأصناف</h4>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>تحديد الكل</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>إلغاء</Button>
                  </div>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 w-10"></th>
                        <th className="text-right px-2 py-2 text-xs font-semibold">الصنف</th>
                        <th className="text-center px-2 py-2 text-xs font-semibold w-32">كمية الارتجاع</th>
                        <th className="text-left px-2 py-2 text-xs font-semibold">السعر</th>
                        <th className="text-left px-2 py-2 text-xs font-semibold">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lines.map(l => {
                        const key = l.product_id || l.product_name;
                        const prevQty = previousReturns[key] || 0;
                        const maxAvail = Number(l.qty) - prevQty;
                        const qty = returnedQtys[l.id] || 0;
                        const isSelected = selectedLines.has(l.id);
                        const fullyReturned = maxAvail <= 0;

                        return (
                          <tr key={l.id} className={`${isSelected ? "bg-primary/5" : ""} ${fullyReturned ? "opacity-50" : ""}`}>
                            <td className="px-2 py-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => !fullyReturned && toggleLine(l.id)}
                                disabled={fullyReturned}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <div className="font-medium text-foreground">{l.product_name}</div>
                              <div className="text-xs text-muted-foreground flex gap-2 items-center mt-0.5">
                                <span>الأصلية: {l.qty}</span>
                                {prevQty > 0 && <Badge variant="outline" className="text-[10px] h-4">مرتجع سابق: {prevQty}</Badge>}
                                {fullyReturned && <span className="text-destructive">مرتجع بالكامل</span>}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1 justify-center">
                                <Button
                                  variant="outline" size="icon" className="h-7 w-7"
                                  onClick={() => setQty(l.id, qty - 1, maxAvail)}
                                  disabled={qty <= 0 || fullyReturned}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number" value={qty} min={0} max={maxAvail}
                                  className="h-7 w-14 text-center text-sm"
                                  disabled={fullyReturned}
                                  onChange={(e) => setQty(l.id, Number(e.target.value) || 0, maxAvail)}
                                />
                                <Button
                                  variant="outline" size="icon" className="h-7 w-7"
                                  onClick={() => setQty(l.id, qty + 1, maxAvail)}
                                  disabled={qty >= maxAvail || fullyReturned}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-center mt-0.5">من {maxAvail}</div>
                            </td>
                            <td className="px-2 py-2 text-left font-mono text-xs text-muted-foreground">₪{l.unit_price.toFixed(2)}</td>
                            <td className="px-2 py-2 text-left font-mono font-semibold">
                              {isSelected ? `₪${(qty * l.unit_price).toFixed(2)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>

              {/* Refund options */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">طريقة الاسترداد</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدي (من الصندوق)</SelectItem>
                      <SelectItem value="card">بطاقة (للبنك)</SelectItem>
                      <SelectItem value="credit">آجل (ذمم العميل)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">عملة الاسترداد</Label>
                  <Select value={returnCurrency} onValueChange={setReturnCurrency} disabled={paymentMethod !== "cash"}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Reason */}
              <div>
                <Label className="text-xs">سبب الارتجاع</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                {reason === "أخرى" && (
                  <Textarea
                    value={customReason} onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="اكتب السبب..." className="mt-2 min-h-[60px]"
                  />
                )}
              </div>

              {/* Summary */}
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">قيمة الارتجاع (شيكل):</span>
                  <span className="font-mono font-bold text-destructive text-lg">₪{totalReturnILS.toFixed(2)}</span>
                </div>
                {returnCurrency !== "ILS" && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">المبلغ المسترد ({returnCurrency}):</span>
                    <span className="font-mono font-bold">{totalReturnInSelectedCurrency.toFixed(2)} {returnCurrency}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-destructive/10">
                  <span>إجمالي الفاتورة الأصلية:</span>
                  <span className="font-mono">₪{originalTotal.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={submitting} className="flex-1">إلغاء</Button>
          <Button
            variant="destructive" onClick={handleSubmit}
            disabled={submitting || loading || selectedLines.size === 0 || totalReturnILS <= 0 || !reason}
            className="flex-1"
          >
            {submitting ? "جارٍ التنفيذ..." : <><RotateCcw className="h-4 w-4 ml-1" /> تأكيد الارتجاع</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

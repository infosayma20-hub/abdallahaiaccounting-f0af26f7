import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock, User, Phone, MapPin, Truck, ShoppingBag, Banknote, StickyNote } from "lucide-react";

export interface ScheduleCartItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  note?: string;
  product_id?: string | null;
  modifiers?: Array<{ option_name: string; extra_price: number }>;
}

interface Branch {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataOwnerId: string;
  cart: ScheduleCartItem[];
  total: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  orderNote?: string;
  /** Branch of the current cashier terminal (locked when isCallCenter=false). */
  defaultBranchId?: string | null;
  defaultBranchName?: string | null;
  isCallCenter?: boolean;
  /** Current open POS shift — required to book a cash deposit into the drawer. */
  sessionId?: string | null;
  terminalId?: string | null;
  cashierName?: string | null;
  onSuccess: () => void;
}

const DEFAULT_PREP_MINUTES = 20;

/** Format a Date as a value usable by <input type="datetime-local"> in local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ScheduleOrderDialog = ({
  open,
  onOpenChange,
  dataOwnerId,
  cart,
  total,
  customerName = "",
  customerPhone = "",
  deliveryAddress = "",
  orderNote = "",
  defaultBranchId,
  defaultBranchName,
  isCallCenter = false,
  sessionId = null,
  terminalId = null,
  cashierName = null,
  onSuccess,
}: Props) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId || null);
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState(customerPhone);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(deliveryAddress ? "delivery" : "pickup");
  const [address, setAddress] = useState(deliveryAddress);
  const [note, setNote] = useState(orderNote);
  const [prepMinutes, setPrepMinutes] = useState<number>(DEFAULT_PREP_MINUTES);
  const [prepaid, setPrepaid] = useState<string>("");
  const [prepaidMethod, setPrepaidMethod] = useState<"cash" | "visa">("cash");
  const [when, setWhen] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customerName);
    setPhone(customerPhone);
    setAddress(deliveryAddress);
    setNote(orderNote);
    setDeliveryType(deliveryAddress ? "delivery" : "pickup");
    setPrepMinutes(DEFAULT_PREP_MINUTES);
    setPrepaid("");
    setPrepaidMethod("cash");
    setBranchId(defaultBranchId || null);
    // Default: one hour from now, rounded to the next 5 minutes.
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    setWhen(toLocalInputValue(d));
  }, [open, customerName, customerPhone, deliveryAddress, orderNote, defaultBranchId]);

  useEffect(() => {
    if (!open || !dataOwnerId || !isCallCenter) return;
    supabase
      .from("branches")
      .select("id, name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .then(({ data }) => {
        setBranches(
          (data || []).filter(
            (b: any) => !String(b.name).includes("مركزي") && !String(b.name).toLowerCase().includes("warehouse")
          ) as Branch[]
        );
      });
  }, [open, dataOwnerId, isCallCenter]);

  const scheduledDate = useMemo(() => (when ? new Date(when) : null), [when]);
  const releaseDate = useMemo(
    () => (scheduledDate ? new Date(scheduledDate.getTime() - prepMinutes * 60 * 1000) : null),
    [scheduledDate, prepMinutes]
  );

  const branchName = useMemo(() => {
    if (!isCallCenter) return defaultBranchName || "الفرع الحالي";
    return branches.find((b) => b.id === branchId)?.name || "";
  }, [isCallCenter, defaultBranchName, branches, branchId]);

  const prepaidAmount = Math.max(0, Number(prepaid) || 0);

  const handleSave = async () => {
    if (cart.length === 0) {
      toast.error("السلة فارغة");
      return;
    }
    if (!branchId) {
      toast.error("اختر الفرع");
      return;
    }
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      toast.error("اختر وقت التسليم");
      return;
    }
    if (scheduledDate.getTime() <= Date.now()) {
      toast.error("وقت التسليم يجب أن يكون في المستقبل");
      return;
    }
    if (!name.trim()) {
      toast.error("اسم الزبون مطلوب");
      return;
    }
    if (deliveryType === "delivery" && !address.trim()) {
      toast.error("العنوان مطلوب للتوصيل");
      return;
    }
    if (prepaidAmount > total) {
      toast.error("العربون أكبر من قيمة الطلبية");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user?.id || "")
        .maybeSingle();

      const timeLabel = scheduledDate.toLocaleString("ar-EG", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const noteParts = [
        `🕒 طلبية مجدولة — التسليم: ${timeLabel}`,
        deliveryType === "delivery" ? `توصيل: ${address.trim()}` : "استلام من الفرع",
        `الزبون: ${name.trim()}`,
        phone.trim() ? `جوال: ${phone.trim()}` : "",
        prepaidAmount > 0 ? `عربون مستلم: ₪${prepaidAmount.toFixed(2)} (${prepaidMethod === "cash" ? "نقداً" : "فيزا"})` : "",
        note.trim() ? `ملاحظة: ${note.trim()}` : "",
      ].filter(Boolean);

      const { data: inserted, error } = await supabase.from("call_center_orders" as any).insert({
        user_id: dataOwnerId,
        target_branch_id: branchId,
        target_branch_name: branchName || null,
        dispatched_by: user?.id,
        dispatched_by_name: profile?.display_name || user?.email || (isCallCenter ? "كول سنتر" : "الفرع"),
        status: "scheduled",
        is_scheduled: true,
        scheduled_for: scheduledDate.toISOString(),
        prep_minutes: prepMinutes,
        release_at: releaseDate ? releaseDate.toISOString() : scheduledDate.toISOString(),
        prepaid_amount: prepaidAmount || 0,
        prepaid_method: prepaidAmount > 0 ? prepaidMethod : null,
        source_app: isCallCenter ? "كول سنتر" : "الفرع",
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        delivery_type: deliveryType,
        delivery_address: deliveryType === "delivery" ? address.trim() : null,
        payment_method: prepaidMethod,
        items: cart.map((item) => ({
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price,
          total: item.total,
          product_id: item.product_id || null,
          note: item.note || "",
          modifiers: (item.modifiers || []).map((m) => ({
            option_name: m.option_name,
            extra_price: Number(m.extra_price) || 0,
          })),
        })),
        total,
        order_note: noteParts.join(" | "),
        delivery_fee: 0,
      } as any).select("id").single();

      if (error) throw error;

      // 💵 Deposit (عربون): recorded as an operational note only — no invoice and
      // no journal entry is created here. It is booked as a standalone shift line
      // ("دفع مسبق لفاتورة آجلة") so the drawer's surplus/deficit stays accurate.
      if (prepaidAmount > 0) {
        const { error: preErr } = await supabase.from("pos_prepayments" as any).insert({
          user_id: dataOwnerId,
          call_center_order_id: (inserted as any)?.id || null,
          session_id: sessionId,
          branch_id: branchId,
          terminal_id: terminalId,
          cashier_name: cashierName,
          created_by: user?.id || null,
          amount: prepaidAmount,
          currency: "ILS",
          method: prepaidMethod,
          note: `عربون طلبية مجدولة — ${name.trim()} — التسليم ${timeLabel}`,
          status: "held",
        } as any);
        if (preErr) {
          console.error("[ScheduleOrder] prepayment log failed:", preErr);
          toast.warning("تم حفظ الطلبية لكن تعذّر تسجيل العربون في بنود الوردية — راجع المحاسب");
        } else if (prepaidMethod === "cash" && !sessionId) {
          toast.warning("لا توجد وردية مفتوحة — تم تسجيل العربون بدون ربطه بعهدة");
        }
      }

      toast.success(`تم جدولة الطلبية للتسليم ${timeLabel}`, {
        description: `ستظهر للفرع تلقائياً قبل الموعد بـ ${prepMinutes} دقيقة`,
        duration: 6000,
      });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      console.error("[ScheduleOrder] failed:", e);
      toast.error("تعذّر جدولة الطلبية: " + (e?.message || "خطأ غير معروف"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            جدولة طلبية مستقبلية
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="rounded-lg border p-2 text-xs flex items-center justify-between bg-muted/40">
            <span>عدد الأصناف: {cart.length}</span>
            <span className="font-semibold">الإجمالي: ₪{total.toFixed(2)}</span>
          </div>

          {isCallCenter && (
            <div>
              <label className="text-xs mb-1 block">الفرع المستهدف</label>
              <div className="grid grid-cols-2 gap-2">
                {branches.map((b) => (
                  <Button
                    key={b.id}
                    type="button"
                    size="sm"
                    variant={branchId === b.id ? "default" : "outline"}
                    onClick={() => setBranchId(b.id)}
                  >
                    {b.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {!isCallCenter && (
            <div className="text-xs text-muted-foreground">الفرع: {branchName}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> وقت التسليم</label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-xs mb-1 block">مدة التحضير (دقيقة)</label>
              <Input
                type="number"
                min={0}
                step={5}
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="h-9 text-xs"
              />
            </div>
          </div>
          {releaseDate && (
            <p className="text-[11px] text-muted-foreground">
              ستُرسل للفرع تلقائياً الساعة{" "}
              {releaseDate.toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 flex items-center gap-1"><User className="h-3 w-3" /> اسم الزبون</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-xs mb-1 flex items-center gap-1"><Phone className="h-3 w-3" /> الجوال</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-xs" inputMode="tel" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={deliveryType === "pickup" ? "default" : "outline"}
              onClick={() => setDeliveryType("pickup")}
              className="flex-1"
            >
              <ShoppingBag className="h-3 w-3 ml-1" /> استلام
            </Button>
            <Button
              type="button"
              size="sm"
              variant={deliveryType === "delivery" ? "default" : "outline"}
              onClick={() => setDeliveryType("delivery")}
              className="flex-1"
            >
              <Truck className="h-3 w-3 ml-1" /> توصيل
            </Button>
          </div>

          {deliveryType === "delivery" && (
            <div>
              <label className="text-xs mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> العنوان</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-xs" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 flex items-center gap-1"><Banknote className="h-3 w-3" /> عربون مستلم (اختياري)</label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={prepaid}
                onChange={(e) => setPrepaid(e.target.value)}
                className="h-9 text-xs"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs mb-1 block">طريقة العربون</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={prepaidMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPrepaidMethod("cash")}
                  className="flex-1"
                >
                  نقداً
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={prepaidMethod === "visa" ? "default" : "outline"}
                  onClick={() => setPrepaidMethod("visa")}
                  className="flex-1"
                >
                  فيزا
                </Button>
              </div>
            </div>
          </div>
          {prepaidAmount > 0 && (
            <p className="text-[11px] text-amber-600">
              العربون يُسجَّل كملاحظة على الطلبية فقط — يُحصَّل المتبقّي (₪{(total - prepaidAmount).toFixed(2)}) عند التسليم.
            </p>
          )}

          <div>
            <label className="text-xs mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" /> ملاحظة</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "جدولة الطلبية"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleOrderDialog;
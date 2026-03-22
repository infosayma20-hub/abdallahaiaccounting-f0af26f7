import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, MapPin, Phone, User, Truck, ShoppingBag, CreditCard, Banknote, StickyNote } from "lucide-react";

interface CartItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  note?: string;
  product_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataOwnerId: string;
  cart: CartItem[];
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  orderNote: string;
  onSuccess: () => void;
}

interface Branch {
  id: string;
  name: string;
}

interface DeliveryApp {
  id: string;
  name: string;
  icon: string;
}

const CallCenterDispatchDialog = ({
  open, onOpenChange, dataOwnerId, cart, total,
  customerName, customerPhone, deliveryAddress, orderNote, onSuccess,
}: Props) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [deliveryApps, setDeliveryApps] = useState<DeliveryApp[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [sourceApp, setSourceApp] = useState("طلب مباشر");
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "visa">("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    setName(customerName);
    setPhone(customerPhone);
    setAddress(deliveryAddress);
    setNote(orderNote);

    // Load branches
    supabase
      .from("branches")
      .select("id, name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .then(({ data }) => setBranches(data || []));

    // Load delivery apps
    supabase
      .from("delivery_apps" as any)
      .select("id, name, icon")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => setDeliveryApps((data as any) || []));
  }, [open, dataOwnerId, customerName, customerPhone, deliveryAddress, orderNote]);

  const handleDispatch = async () => {
    if (!selectedBranch) {
      toast.error("يرجى اختيار الفرع");
      return;
    }
    if (!name.trim()) {
      toast.error("يرجى إدخال اسم الزبون");
      return;
    }

    setSending(true);
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user?.id || "")
        .maybeSingle();

      const { error } = await supabase
        .from("call_center_orders" as any)
        .insert({
          user_id: dataOwnerId,
          source_app: sourceApp,
          target_branch_id: selectedBranch.id,
          target_branch_name: selectedBranch.name,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          delivery_type: deliveryType,
          delivery_address: deliveryType === "delivery" ? address.trim() : null,
          payment_method: paymentMethod,
          items: cart.map(item => ({
            name: item.name,
            qty: item.qty,
            unit_price: item.unit_price,
            total: item.total,
            product_id: item.product_id || null,
            note: item.note || "",
          })),
          total,
          order_note: note.trim() || null,
          dispatched_by: user?.id,
          dispatched_by_name: profile?.display_name || user?.email || "كول سنتر",
          status: "pending",
        } as any);

      if (error) throw error;

      toast.success(`✅ تم إرسال الطلب إلى فرع ${selectedBranch.name}`, {
        duration: 4000,
      });
      onSuccess();
      onOpenChange(false);
      // Reset
      setSelectedBranch(null);
      setSourceApp("طلب مباشر");
      setDeliveryType("delivery");
      setPaymentMethod("cash");
    } catch (err: any) {
      console.error("Dispatch error:", err);
      toast.error("خطأ في إرسال الطلب: " + (err.message || ""));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            تحويل الطلب إلى الفرع
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source App */}
          <div className="space-y-2">
            <label className="text-sm font-medium">مصدر الطلب</label>
            <div className="flex flex-wrap gap-2">
              {deliveryApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => setSourceApp(app.name)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    sourceApp === app.name
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-primary/30"
                  }`}
                >
                  {app.icon} {app.name}
                </button>
              ))}
            </div>
          </div>

          {/* Target Branch */}
          <div className="space-y-2">
            <label className="text-sm font-medium">الفرع المستهدف *</label>
            <div className="grid grid-cols-2 gap-2">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => setSelectedBranch(branch)}
                  className={`p-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    selectedBranch?.id === branch.id
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-muted/30 text-foreground border-border hover:border-primary/40"
                  }`}
                >
                  🏪 {branch.name}
                </button>
              ))}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <User className="h-3 w-3" /> اسم الزبون *
              </label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="الاسم" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <Phone className="h-3 w-3" /> رقم الجوال
              </label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05xxxxxxxx" className="h-10" dir="ltr" />
            </div>
          </div>

          {/* Delivery Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع الطلب</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDeliveryType("delivery")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  deliveryType === "delivery"
                    ? "bg-orange-500 text-white border-orange-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-orange-300"
                }`}
              >
                <Truck className="h-4 w-4" /> توصيل
              </button>
              <button
                onClick={() => setDeliveryType("pickup")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  deliveryType === "pickup"
                    ? "bg-blue-500 text-white border-blue-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-blue-300"
                }`}
              >
                <ShoppingBag className="h-4 w-4" /> استلام
              </button>
            </div>
          </div>

          {/* Delivery Address */}
          {deliveryType === "delivery" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3" /> عنوان التوصيل
              </label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="المدينة، الشارع، رقم البناية..." className="h-10" />
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-sm font-medium">طريقة الدفع</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  paymentMethod === "cash"
                    ? "bg-green-500 text-white border-green-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-green-300"
                }`}
              >
                <Banknote className="h-4 w-4" /> نقدي
              </button>
              <button
                onClick={() => setPaymentMethod("visa")}
                className={`p-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 transition-all ${
                  paymentMethod === "visa"
                    ? "bg-purple-500 text-white border-purple-500 shadow-md"
                    : "bg-muted/30 border-border hover:border-purple-300"
                }`}
              >
                <CreditCard className="h-4 w-4" /> فيزا
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1">
              <StickyNote className="h-3 w-3" /> ملاحظات
            </label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظات إضافية..." className="h-10" />
          </div>

          {/* Order Summary */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground">ملخص الطلب</p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{item.name} × {item.qty}</span>
                  <span className="font-mono">₪{item.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-border pt-2">
              <span>المجموع</span>
              <span className="font-mono">₪{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={handleDispatch}
            disabled={sending || !selectedBranch || !name.trim()}
            className="gap-2"
            style={{ backgroundColor: "#16A34A" }}
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            إرسال إلى {selectedBranch?.name || "الفرع"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallCenterDispatchDialog;

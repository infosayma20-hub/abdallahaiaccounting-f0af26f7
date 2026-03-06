import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Gift, User, Mail, MessageSquare, CheckCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CustomerDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  discountPct: number;
  dataOwnerId: string;
  onApply: (data: {
    contactType: "whatsapp" | "email";
    contactValue: string;
    customerName: string;
    discountPct: number;
    discountAmount: number;
    customerId: string | null;
  }) => void;
  onSkip: () => void;
}

interface ExistingCustomer {
  id: string;
  name: string | null;
  total_visits: number;
  total_spent: number;
}

const CustomerDataModal = ({
  open, onOpenChange, subtotal, discountPct, dataOwnerId, onApply, onSkip,
}: CustomerDataModalProps) => {
  const [contactType, setContactType] = useState<"whatsapp" | "email">("whatsapp");
  const [contactValue, setContactValue] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomer | null>(null);
  const [searching, setSearching] = useState(false);

  const discountAmount = (subtotal * discountPct) / 100;

  useEffect(() => {
    if (!open) {
      setContactValue("");
      setCustomerName("");
      setExistingCustomer(null);
    }
  }, [open]);

  const searchCustomer = async (value: string) => {
    if (value.length < 6) { setExistingCustomer(null); return; }
    setSearching(true);
    try {
      const field = contactType === "whatsapp" ? "whatsapp" : "email";
      const { data } = await supabase
        .from("pos_customers")
        .select("id, name, total_visits, total_spent")
        .eq("user_id", dataOwnerId)
        .eq(field, value)
        .maybeSingle();
      if (data) {
        setExistingCustomer(data as ExistingCustomer);
        if (data.name) setCustomerName(data.name);
      } else {
        setExistingCustomer(null);
      }
    } catch { /* ignore */ }
    setSearching(false);
  };

  const handleApply = async () => {
    let customerId: string | null = existingCustomer?.id || null;

    // Create or update customer
    if (!customerId) {
      const insertData: any = {
        user_id: dataOwnerId,
        name: customerName || null,
        [contactType]: contactValue,
        total_visits: 1,
        total_spent: subtotal - discountAmount,
        total_discounts: discountAmount,
        last_visit: new Date().toISOString(),
        marketing_consent: true,
        consent_date: new Date().toISOString(),
      };
      const { data } = await supabase
        .from("pos_customers")
        .insert(insertData)
        .select("id")
        .single();
      customerId = data?.id || null;
    } else {
      await supabase
        .from("pos_customers")
        .update({
          name: customerName || existingCustomer?.name,
          total_visits: (existingCustomer?.total_visits || 0) + 1,
          total_spent: (existingCustomer?.total_spent || 0) + (subtotal - discountAmount),
          total_discounts: discountAmount,
          last_visit: new Date().toISOString(),
        } as any)
        .eq("id", customerId);
    }

    onApply({
      contactType,
      contactValue,
      customerName,
      discountPct,
      discountAmount,
      customerId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-500 to-green-600 p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">خصم {discountPct}% مقابل بياناتك</h2>
              <p className="text-sm text-white/80">وفّر ₪{discountAmount.toFixed(2)} الآن!</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-white/70">قبل الخصم</p>
              <p className="font-bold text-base">₪{subtotal.toFixed(2)}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-white/70">الخصم</p>
              <p className="font-bold text-base text-yellow-200">-₪{discountAmount.toFixed(2)}</p>
            </div>
            <div className="bg-white/20 rounded-lg p-2">
              <p className="text-white/70">بعد الخصم</p>
              <p className="font-bold text-base">₪{(subtotal - discountAmount).toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Existing customer badge */}
          <AnimatePresence>
            {existingCustomer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm">
                  {existingCustomer.name?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">✅ عميل موجود: {existingCustomer.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {existingCustomer.total_visits} زيارة | أنفق ₪{existingCustomer.total_spent?.toFixed(0)}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">الاسم (اختياري)</label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="اسم العميل"
              className="h-10"
            />
          </div>

          {/* Contact type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">إرسال الفاتورة عبر:</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "whatsapp" as const, label: "واتساب", icon: MessageSquare },
                { id: "email" as const, label: "إيميل", icon: Mail },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setContactType(opt.id); setContactValue(""); setExistingCustomer(null); }}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    contactType === opt.id
                      ? opt.id === "whatsapp"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                        : "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact input */}
          <div>
            <Input
              type={contactType === "email" ? "email" : "tel"}
              value={contactValue}
              onChange={(e) => {
                setContactValue(e.target.value);
                searchCustomer(e.target.value);
              }}
              placeholder={contactType === "whatsapp" ? "+970 599 000 000" : "example@email.com"}
              className="h-12 text-center text-lg font-mono"
              dir="ltr"
            />
          </div>

          {/* What customer receives */}
          <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-1.5">
            <p className="text-xs font-semibold text-foreground">📨 سيصله فوراً:</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-emerald-500" /> فاتورة رقمية احترافية
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-emerald-500" /> رابط استبيان رضا العملاء
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-emerald-500" /> خصم {discountPct}% على فاتورته الحالية
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 pt-0 flex gap-2">
          <Button
            variant="ghost"
            className="flex-shrink-0 text-xs text-muted-foreground"
            onClick={onSkip}
          >
            تخطي
          </Button>
          <Button
            onClick={handleApply}
            disabled={!contactValue || contactValue.length < 6}
            className="flex-1 h-11 gap-2 rounded-xl font-bold"
            style={{ backgroundColor: "#16A34A" }}
          >
            <Gift className="h-4 w-4" />
            تطبيق الخصم {discountPct}%
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDataModal;

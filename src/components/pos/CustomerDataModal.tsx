import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { User, Phone, StickyNote, CheckCircle, Percent } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";

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
  const [contactValue, setContactValue] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomer | null>(null);
  const [searching, setSearching] = useState(false);

  const actualDiscountPct = applyDiscount ? discountPct : 0;
  const discountAmount = (subtotal * actualDiscountPct) / 100;

  useEffect(() => {
    if (!open) {
      setContactValue("");
      setCustomerName("");
      setNote("");
      setApplyDiscount(false);
      setExistingCustomer(null);
    }
  }, [open]);

  const searchCustomer = async (value: string) => {
    if (value.length < 6) { setExistingCustomer(null); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from("pos_customers")
        .select("id, name, total_visits, total_spent")
        .eq("user_id", dataOwnerId)
        .eq("whatsapp", value)
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

    if (!customerId) {
      // Create customer record with zero stats — handleCompleteOrder will increment visits/spent
      const insertData: any = {
        user_id: dataOwnerId,
        name: customerName || null,
        whatsapp: contactValue || null,
        total_visits: 0,
        total_spent: 0,
        total_discounts: 0,
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
      // Only update name — visits/spent/discounts are updated by handleCompleteOrder
      await supabase
        .from("pos_customers")
        .update({
          name: customerName || existingCustomer?.name,
        } as any)
        .eq("id", customerId);
    }

    onApply({
      contactType: "whatsapp",
      contactValue,
      customerName,
      discountPct: actualDiscountPct,
      discountAmount,
      customerId,
    });
  };

  const canSubmit = customerName.trim().length > 0 || contactValue.length >= 6;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">تسجيل بيانات الزبون</h2>
              <p className="text-xs text-muted-foreground">أضف بيانات الزبون لهذا الطلب</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
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
                  <p className="text-sm font-semibold text-foreground">✅ زبون موجود: {existingCustomer.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {existingCustomer.total_visits} زيارة | أنفق ₪{existingCustomer.total_spent?.toFixed(0)}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">اسم الزبون</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسم الزبون"
                className="h-11 pr-10"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">رقم الجوال</label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                type="tel"
                value={contactValue}
                onChange={(e) => {
                  setContactValue(e.target.value);
                  searchCustomer(e.target.value);
                }}
                placeholder="+970 599 000 000"
                className="h-11 pr-10 font-mono text-right"
                dir="rtl"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">ملاحظة (اختياري)</label>
            <div className="relative">
              <StickyNote className="absolute right-3 top-3 h-4 w-4 text-muted-foreground/50" />
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ملاحظة على الزبون..."
                className="pr-10 min-h-[60px] resize-none text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Optional discount toggle */}
          {discountPct > 0 && (
            <div className={`p-3 rounded-xl border transition-all ${
              applyDiscount 
                ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20" 
                : "border-border bg-muted/30"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent className={`h-4 w-4 ${applyDiscount ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-sm font-medium ${applyDiscount ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}>
                      تطبيق خصم {discountPct}%
                    </p>
                    {applyDiscount && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        توفير ₪{discountAmount.toFixed(2)} — الإجمالي ₪{(subtotal - discountAmount).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={applyDiscount}
                  onCheckedChange={setApplyDiscount}
                />
              </div>
            </div>
          )}
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
            disabled={!canSubmit}
            className="flex-1 h-11 gap-2 rounded-xl font-bold"
          >
            <CheckCircle className="h-4 w-4" />
            حفظ بيانات الزبون
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDataModal;

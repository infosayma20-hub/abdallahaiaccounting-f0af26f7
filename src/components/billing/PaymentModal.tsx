import { useState } from "react";
import { X, CreditCard, Lock, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface PaymentModalProps {
  plan: {
    id: string;
    plan_key: string;
    name_ar: string;
    monthly_price: number;
    annual_price: number;
  };
  billingCycle: "monthly" | "annual";
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentModal = ({ plan, billingCycle, onClose, onSuccess }: PaymentModalProps) => {
  const { user } = useAuth();
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const price = billingCycle === "annual" ? plan.annual_price : plan.monthly_price;
  const totalAnnual = billingCycle === "annual" ? Math.round(price * 12) : null;
  const discount = billingCycle === "annual" ? Math.round((plan.monthly_price - plan.annual_price) * 12) : 0;

  const formatCard = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const getCardBrand = () => {
    const d = cardNumber.replace(/\s/g, "");
    if (d.startsWith("4")) return "Visa";
    if (d.startsWith("5") || d.startsWith("2")) return "Mastercard";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setProcessing(true);

    // TODO: Replace with actual payment gateway
    // Gateway credentials will be provided by owner
    // Integration: likely Stripe, PayTabs, or HyperPay
    await new Promise((r) => setTimeout(r, 2500));

    try {
      // Update subscription
      const periodEnd = new Date();
      if (billingCycle === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const { error: subError } = await supabase
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          plan_id: plan.id,
          plan_key: plan.plan_key,
          billing_cycle: billingCycle,
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString(),
          auto_renew: true,
        }, { onConflict: "user_id" });

      if (subError) throw subError;

      setSuccess(true);
      toast.success("تم الاشتراك بنجاح! 🎉");
      setTimeout(onSuccess, 1500);
    } catch (err) {
      console.error(err);
      toast.error("فشلت عملية الدفع. يرجى التحقق من بيانات بطاقتك");
    }
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl w-full max-w-[560px] mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ fontFamily: "Tajawal, sans-serif" }}
      >
        {success ? (
          <div className="p-12 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
              <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-4" />
            </motion.div>
            <h3 className="text-2xl font-bold text-[#0A2342] mb-2">تم الاشتراك بنجاح!</h3>
            <p className="text-gray-500">جاري تحويلك...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0A2342]">إتمام الاشتراك</h3>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6">
              {/* Order Summary */}
              <div className="bg-gray-50 rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-[#0A2342]">{plan.name_ar}</span>
                  <span className="text-sm bg-[#4A9EE8]/10 text-[#4A9EE8] px-3 py-1 rounded-full font-bold">
                    {billingCycle === "annual" ? "سنوي" : "شهري"}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">السعر الأساسي</span>
                    <span className="text-[#0A2342]">${plan.monthly_price.toFixed(2)}/شهر</span>
                  </div>
                  {billingCycle === "annual" && (
                    <div className="flex justify-between text-green-600">
                      <span>خصم الدفع السنوي</span>
                      <span>-${discount.toFixed(2)}/سنة</span>
                    </div>
                  )}
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="flex justify-between font-bold text-[#0A2342]">
                    <span>الإجمالي</span>
                    <span>
                      {totalAnnual ? `$${totalAnnual}/سنة` : `$${price.toFixed(2)}/شهر`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <h4 className="text-sm font-bold text-[#0A2342] flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  بيانات البطاقة الائتمانية
                </h4>

                {/* Card Number */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">رقم البطاقة</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCard(e.target.value))}
                      placeholder="0000 0000 0000 0000"
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#0A2342] focus:ring-1 focus:ring-[#0A2342] outline-none text-left dir-ltr"
                      dir="ltr"
                      required
                    />
                    {getCardBrand() && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#0A2342] bg-gray-100 px-2 py-1 rounded">
                        {getCardBrand()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expiry + CVV */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">تاريخ الانتهاء</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/YY"
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#0A2342] focus:ring-1 focus:ring-[#0A2342] outline-none text-left"
                      dir="ltr"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">CVV</label>
                    <input
                      type="text"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="123"
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#0A2342] focus:ring-1 focus:ring-[#0A2342] outline-none text-left"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الاسم على البطاقة</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="الاسم كما هو على البطاقة"
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#0A2342] focus:ring-1 focus:ring-[#0A2342] outline-none"
                    required
                  />
                </div>

                {/* Security badges */}
                <div className="flex items-center justify-center gap-4 py-2 text-xs text-gray-400">
                  <Lock className="h-3.5 w-3.5" />
                  <span>مشفر بـ SSL 256-bit</span>
                  <span className="font-bold text-[#1A1F71]">VISA</span>
                  <span className="font-bold text-[#EB001B]">MC</span>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={processing}
                  className="w-full h-[52px] rounded-xl text-white font-bold text-base transition-all disabled:opacity-70"
                  style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)" }}
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      جاري المعالجة...
                    </span>
                  ) : (
                    `إتمام الدفع $${totalAnnual || price.toFixed(2)}`
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default PaymentModal;

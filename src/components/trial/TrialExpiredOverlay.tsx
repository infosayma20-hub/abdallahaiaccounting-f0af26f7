import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useReadOnly } from "@/contexts/ReadOnlyContext";

type BillingCycle = "monthly" | "annual";

const TrialExpiredOverlay = () => {
  const navigate = useNavigate();
  const { setReadOnly } = useReadOnly();
  const [selected, setSelected] = useState<BillingCycle>("annual");

  const handleSubscribe = () => {
    navigate(`/pricing?reason=trial_expired&cycle=${selected}`);
  };

  const handleBrowseOnly = () => {
    setReadOnly(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.6)" }}
      dir="rtl"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-[500px] overflow-hidden"
        style={{ borderRadius: 28, boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
      >
        {/* Top Section - Navy */}
        <div
          className="text-center px-8 pt-8 pb-6"
          style={{ background: "linear-gradient(135deg, #0A2342, #071829)" }}
        >
          <div className="text-sm font-bold mb-4" style={{ color: "#C9A84C", fontFamily: "Tajawal" }}>
            زِدني
          </div>
          <div className="text-[48px] mb-3">🔒</div>
          <h2 className="text-2xl font-extrabold text-white mb-2" style={{ fontFamily: "Tajawal" }}>
            انتهت فترتك التجريبية
          </h2>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
            بياناتك محفوظة بأمان — اشترك للوصول الكامل
          </p>

          {/* Data preserved banner */}
          <div
            className="rounded-[10px] py-2.5 px-4"
            style={{
              background: "rgba(22,163,74,0.2)",
              border: "1px solid rgba(22,163,74,0.4)",
            }}
          >
            <span className="text-xs" style={{ color: "#4ADE80" }}>
              ✓ بياناتك محفوظة لمدة 30 يوماً
            </span>
          </div>
        </div>

        {/* Middle Section - White */}
        <div className="bg-white px-8 py-6">
          <p className="text-sm font-bold mb-3" style={{ color: "#0A2342" }}>
            اختر خطتك:
          </p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {/* Monthly */}
            <button
              onClick={() => setSelected("monthly")}
              className="rounded-[14px] p-4 text-center transition-all cursor-pointer"
              style={{
                border: `2px solid ${selected === "monthly" ? "#0A2342" : "#E5E7EB"}`,
                background: selected === "monthly" ? "#F8FAFC" : "white",
              }}
            >
              <div className="text-sm font-medium mb-1" style={{ color: "#0A2342" }}>شهري</div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-2xl font-extrabold" style={{ color: "#0A2342" }}>$49</span>
                <span className="text-xs" style={{ color: "#6B7280" }}>/شهر</span>
              </div>
            </button>

            {/* Annual */}
            <button
              onClick={() => setSelected("annual")}
              className="rounded-[14px] p-4 text-center transition-all cursor-pointer relative"
              style={{
                border: `2px solid ${selected === "annual" ? "#C9A84C" : "#E5E7EB"}`,
                background: selected === "annual" ? "#FFFBEB" : "white",
              }}
            >
              <span
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white px-2.5 py-0.5 rounded-full"
                style={{ background: "#C9A84C" }}
              >
                الأوفر 💰
              </span>
              <div className="text-sm font-medium mb-1" style={{ color: "#0A2342" }}>سنوي</div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-2xl font-extrabold" style={{ color: "#0A2342" }}>$37</span>
                <span className="text-xs" style={{ color: "#6B7280" }}>/شهر</span>
              </div>
              <div className="text-[11px] mt-1" style={{ color: "#6B7280" }}>
                يُدفع $444 سنوياً
              </div>
              <div className="text-[11px] line-through" style={{ color: "#9CA3AF" }}>
                بدل $588
              </div>
            </button>
          </div>

          {/* Features */}
          <div className="space-y-2">
            {["جميع التقارير والمحاسبة", "المحاسب الذكي بلا حدود", "نقطة البيع والمخزون"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-[13px]" style={{ color: "#374151" }}>
                <span style={{ color: "#16A34A" }}>✓</span>
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="bg-white px-8 pb-8">
          <button
            onClick={handleSubscribe}
            className="w-full h-[52px] rounded-[14px] text-[17px] font-extrabold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #C9A84C, #B8972E)",
              border: "none",
              boxShadow: "0 4px 20px rgba(201,168,76,0.4)",
              fontFamily: "Tajawal",
            }}
          >
            اشترك الآن ←
          </button>

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={handleBrowseOnly}
              className="text-xs underline bg-transparent border-none cursor-pointer"
              style={{ color: "#6B7280" }}
            >
              👁️ تصفح فقط (قراءة)
            </button>
            <a
              href="https://wa.me/970599000000"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
              style={{ color: "#0A2342" }}
            >
              تواصل معنا 💬
            </a>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TrialExpiredOverlay;

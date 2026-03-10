import { useNavigate } from "react-router-dom";

const ReadOnlyBanner = () => {
  const navigate = useNavigate();

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-center gap-3 px-6 py-2 text-xs text-white"
      style={{
        background: "linear-gradient(90deg, #1E3A5F, #0A2342)",
        fontFamily: "Tajawal",
        height: 36,
      }}
      dir="rtl"
    >
      <span>🔒 وضع القراءة — لإضافة بيانات جديدة</span>
      <button
        onClick={() => navigate("/pricing?reason=trial_expired")}
        className="px-3 py-0.5 rounded-full text-[11px] font-bold transition-all hover:brightness-110"
        style={{
          background: "linear-gradient(135deg, #C9A84C, #B8972E)",
          color: "white",
          border: "none",
        }}
      >
        اشترك الآن
      </button>
    </div>
  );
};

export default ReadOnlyBanner;

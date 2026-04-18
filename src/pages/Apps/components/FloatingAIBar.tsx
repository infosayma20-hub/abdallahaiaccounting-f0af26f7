import { useNavigate } from "react-router-dom";
import { Sparkles, Mic, ArrowLeft } from "lucide-react";

/**
 * FloatingAIBar — شريط عائم سفلي للوصول السريع للمحاسب الذكي (Haseeb).
 * يظهر في صفحة /apps فقط. زر مركزي بـ gradient نيفي + لمعان نبضي.
 */
const FloatingAIBar = () => {
  const navigate = useNavigate();

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4"
      style={{ width: "min(560px, calc(100% - 32px))" }}
    >
      <button
        onClick={() => navigate("/smart-accountant")}
        className="group w-full flex items-center gap-3 transition-all duration-200"
        style={{
          height: 60,
          padding: "0 8px 0 20px",
          borderRadius: 999,
          background: "linear-gradient(135deg, #0D1B2E 0%, #1B3A5C 60%, #2563EB 100%)",
          boxShadow: "0 12px 32px rgba(13,27,46,0.28), 0 0 0 1px rgba(255,255,255,0.08) inset",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 16px 40px rgba(13,27,46,0.36), 0 0 0 1px rgba(255,255,255,0.12) inset";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 12px 32px rgba(13,27,46,0.28), 0 0 0 1px rgba(255,255,255,0.08) inset";
        }}
      >
        {/* Pulse icon */}
        <div className="relative flex-shrink-0">
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "rgba(74,158,232,0.35)", animationDuration: "2.2s" }}
          />
          <div
            className="relative w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4A9EE8 0%, #2563EB 100%)" }}
          >
            <Sparkles className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
        </div>

        {/* Texts */}
        <div className="flex-1 text-right min-w-0">
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            اسأل حسيب — المحاسب الذكي
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: 0, marginTop: 2, lineHeight: 1.2 }}>
            سجّل فاتورة، استخرج تقرير، أو اطرح أي سؤال محاسبي
          </p>
        </div>

        {/* Mic */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <Mic className="w-[18px] h-[18px] text-white" strokeWidth={2} />
        </div>

        {/* Arrow */}
        <ArrowLeft
          className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-x-1"
          style={{ color: "rgba(255,255,255,0.7)" }}
          strokeWidth={2.2}
        />
      </button>
    </div>
  );
};

export default FloatingAIBar;

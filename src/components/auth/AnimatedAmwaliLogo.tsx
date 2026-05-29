import { CSSProperties } from "react";

/**
 * AnimatedAmwaliLogo — يُستخدم فقط في صفحة تسجيل الدخول.
 * يرسم حرف "a" (قوس + ذيل) عبر stroke-dasharray ثم يُظهر الكلمتين
 * "أموالي" و "amwali" بـ Fade + Blur خفيف. لا Loop، لا Replay.
 */
const NAVY = "#071D49";
const STROKE = 11;

// مدد المراحل (ms)
const ARC_DURATION = 1200;
const TAIL_DELAY = ARC_DURATION;
const TAIL_DURATION = 400;
const TEXT_DELAY = ARC_DURATION + TAIL_DURATION + 150;
const TEXT_DURATION = 600;

export default function AnimatedAmwaliLogo({ className = "" }: { className?: string }) {
  const arcStyle: CSSProperties = {
    strokeDasharray: 100,
    strokeDashoffset: 100,
    animation: `amwali-draw ${ARC_DURATION}ms cubic-bezier(0.65, 0, 0.35, 1) forwards`,
  };
  const tailStyle: CSSProperties = {
    strokeDasharray: 100,
    strokeDashoffset: 100,
    animation: `amwali-draw ${TAIL_DURATION}ms cubic-bezier(0.65, 0, 0.35, 1) ${TAIL_DELAY}ms forwards`,
  };
  const textStyle: CSSProperties = {
    opacity: 0,
    filter: "blur(6px)",
    animation: `amwali-reveal ${TEXT_DURATION}ms ease-out ${TEXT_DELAY}ms forwards`,
  };

  return (
    <div
      className={`flex flex-col items-center select-none ${className}`}
      aria-label="AMWALI أموالي"
      role="img"
    >
      <style>{`
        @keyframes amwali-draw { to { stroke-dashoffset: 0; } }
        @keyframes amwali-reveal {
          0%   { opacity: 0; filter: blur(6px); transform: translateY(2px); }
          60%  { opacity: 1; }
          100% { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .amwali-arc, .amwali-tail { stroke-dashoffset: 0 !important; animation: none !important; }
          .amwali-text { opacity: 1 !important; filter: none !important; animation: none !important; transform: none !important; }
        }
      `}</style>

      {/* الشعار (الحرف) */}
      <svg
        viewBox="0 0 120 120"
        width="96"
        height="96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        {/* القوس الرئيسي (دائرة كاملة) */}
        <circle
          className="amwali-arc"
          cx="55"
          cy="55"
          r="40"
          stroke={NAVY}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={100}
          transform="rotate(-90 55 55)"
          style={arcStyle}
        />
        {/* الذيل السفلي */}
        <line
          className="amwali-tail"
          x1="95"
          y1="55"
          x2="95"
          y2="105"
          stroke={NAVY}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={100}
          style={tailStyle}
        />
      </svg>

      {/* الكلمتان */}
      <div className="amwali-text mt-2 flex flex-col items-center leading-none" style={textStyle}>
        <span
          style={{
            color: NAVY,
            fontFamily: "Tajawal, sans-serif",
            fontWeight: 500,
            fontSize: 22,
            letterSpacing: "0.04em",
          }}
        >
          أموالي
        </span>
        <span
          dir="ltr"
          style={{
            color: NAVY,
            fontFamily: "'Inter', 'Tajawal', sans-serif",
            fontWeight: 500,
            fontSize: 18,
            letterSpacing: "0.18em",
            marginTop: 4,
          }}
        >
          amwali
        </span>
      </div>
    </div>
  );
}
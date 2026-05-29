import { CSSProperties } from "react";
import markPng from "@/assets/branding/logo-icon-only.png";
import wordmarkPng from "@/assets/branding/logo-text.png";

/**
 * AnimatedAmwaliLogo — يُستخدم فقط في صفحة تسجيل الدخول.
 * المرحلة 1-3: يرسم حرف "a" (قوس + ذيل) عبر SVG stroke-dashoffset.
 * المرحلة 4: Crossfade لشعار العلامة الرسمي (PNG) للحصول على شكل مطابق 100% للهوية.
 * المرحلة 5: ظهور الكلمتين الرسميتين "أموالي / amwali" بـ Fade + Blur خفيف.
 * لا Loop، لا Replay، يحترم prefers-reduced-motion.
 */
const NAVY = "#071D49";
const STROKE = 12;

// مدد المراحل (ms)
const ARC_DURATION = 1200;
const TAIL_DELAY = ARC_DURATION;
const TAIL_DURATION = 400;
const MARK_CROSSFADE_DELAY = ARC_DURATION + TAIL_DURATION; // 1600ms
const MARK_CROSSFADE_DURATION = 250;
const TEXT_DELAY = MARK_CROSSFADE_DELAY + 150;
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
  const svgFadeOutStyle: CSSProperties = {
    opacity: 1,
    animation: `amwali-fade-out ${MARK_CROSSFADE_DURATION}ms ease-out ${MARK_CROSSFADE_DELAY}ms forwards`,
  };
  const pngFadeInStyle: CSSProperties = {
    opacity: 0,
    animation: `amwali-fade-in ${MARK_CROSSFADE_DURATION}ms ease-out ${MARK_CROSSFADE_DELAY}ms forwards`,
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
        @keyframes amwali-fade-out { to { opacity: 0; } }
        @keyframes amwali-fade-in  { to { opacity: 1; } }
        @keyframes amwali-reveal {
          0%   { opacity: 0; filter: blur(6px); transform: translateY(2px); }
          60%  { opacity: 1; }
          100% { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .amwali-arc, .amwali-tail { stroke-dashoffset: 0 !important; animation: none !important; }
          .amwali-svg-wrap { opacity: 0 !important; animation: none !important; }
          .amwali-png-mark { opacity: 1 !important; animation: none !important; }
          .amwali-text { opacity: 1 !important; filter: none !important; animation: none !important; transform: none !important; }
        }
      `}</style>

      {/* الشعار (الحرف) — SVG draw ثم crossfade لـ PNG الرسمي */}
      <div className="relative" style={{ width: 96, height: 96 }}>
        {/* SVG: مرحلة الرسم */}
        <svg
          className="amwali-svg-wrap absolute inset-0"
          viewBox="0 0 120 120"
          width="96"
          height="96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={svgFadeOutStyle}
        >
          {/* القوس الرئيسي — دائرة شبه كاملة بفتحة عند أسفل اليمين */}
          <circle
            className="amwali-arc"
            cx="52"
            cy="55"
            r="38"
            stroke={NAVY}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            transform="rotate(-95 52 55)"
            style={arcStyle}
          />
          {/* الذيل السفلي — ينحدر من يمين الدائرة للأسفل */}
          <line
            className="amwali-tail"
            x1="90"
            y1="55"
            x2="90"
            y2="100"
            stroke={NAVY}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            style={tailStyle}
          />
        </svg>
        {/* PNG: الشكل النهائي المطابق للهوية */}
        <img
          src={markPng}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="amwali-png-mark absolute inset-0 w-full h-full object-contain"
          style={pngFadeInStyle}
        />
      </div>

      {/* النص الرسمي (أموالي / amwali) */}
      <img
        src={wordmarkPng}
        alt="أموالي amwali"
        draggable={false}
        className="amwali-text mt-3 h-9 w-auto object-contain"
        style={textStyle}
      />
    </div>
  );
}
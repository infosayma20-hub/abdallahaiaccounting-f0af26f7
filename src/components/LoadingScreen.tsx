import { useEffect, useState, useCallback } from "react";
import { useCompany } from "@/hooks/useCompanyContext";

const STATUS_MESSAGES = [
  "جاري تحميل البيانات...",
  "تهيئة النظام المالي...",
  "تحميل دليل الحسابات...",
  "الاتصال بقاعدة البيانات...",
  "جاهز ✓",
];

const MILESTONES = [
  { progress: 30, delay: 300, msgIndex: 0 },
  { progress: 55, delay: 800, msgIndex: 1 },
  { progress: 75, delay: 1400, msgIndex: 2 },
  { progress: 90, delay: 1900, msgIndex: 3 },
  { progress: 100, delay: 2400, msgIndex: 4 },
];

const LoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  let logoUrl: string | null = null;
  let companyName = "";
  try {
    const { company } = useCompany();
    logoUrl = company.logo_url;
    companyName = company.name;
  } catch {
    // Context not available during initial load
  }

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    MILESTONES.forEach(({ progress: p, delay, msgIndex }) => {
      timers.push(
        setTimeout(() => {
          setProgress(p);
          setStatusIndex(msgIndex);
          if (p === 100) {
            timers.push(setTimeout(() => setIsExiting(true), 400));
          }
        }, delay)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  if (isExiting && !demo) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, #0D3158 0%, #050F1E 60%, #020810 100%)",
      }}
    >
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,180,216,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,216,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          animation: "grid-drift 20s linear infinite",
        }}
      />

      {/* Floating orb top-left */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,180,216,0.06) 0%, transparent 70%)",
          top: -200,
          left: -200,
          animation: "orb-pulse 6s ease-in-out infinite",
        }}
      />

      {/* Floating orb bottom-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)",
          bottom: -150,
          right: -150,
          animation: "orb-pulse 8s ease-in-out infinite",
          animationDelay: "3s",
        }}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center text-center z-10">
        {/* Logo card with ring */}
        <div className="relative" style={{ width: 130, height: 130 }}>
          {/* Rotating border ring */}
          <div
            className="absolute pointer-events-none"
            style={{
              inset: -10,
              borderRadius: 30,
              border: "1.5px solid transparent",
              background:
                "linear-gradient(#050F1E, #050F1E) padding-box, conic-gradient(from 0deg, transparent 0deg, #00B4D8 90deg, #C9A84C 180deg, transparent 270deg, transparent 360deg) border-box",
              animation: "ring-spin 3s linear infinite",
            }}
          />

          {/* Corner dots */}
          {[
            { top: -2, left: -2, delay: "0s" },
            { top: -2, right: -2, delay: "0.5s" },
            { bottom: -2, left: -2, delay: "1s" },
            { bottom: -2, right: -2, delay: "1.5s" },
          ].map((pos, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#C9A84C",
                boxShadow: "0 0 8px #C9A84C",
                animation: "dot-blink 2s ease-in-out infinite",
                animationDelay: pos.delay,
                ...pos,
              }}
            />
          ))}

          {/* Logo card */}
          <div
            className="w-full h-full rounded-[22px] bg-white flex items-center justify-center overflow-hidden"
            style={{
              padding: 14,
              boxShadow:
                "0 0 0 1px rgba(0,180,216,0.2), 0 0 40px rgba(0,180,216,0.15), 0 20px 60px rgba(0,0,0,0.5)",
              animation:
                "logo-enter 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
              opacity: 0,
              transform: "scale(0.6) translateY(20px)",
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="w-full h-full object-contain"
              />
            ) : (
              <svg viewBox="0 0 80 80" className="w-16 h-16">
                <rect
                  x="16"
                  y="16"
                  width="48"
                  height="48"
                  rx="8"
                  fill="none"
                  stroke="#00B4D8"
                  strokeWidth="2"
                />
                <rect
                  x="24"
                  y="24"
                  width="32"
                  height="32"
                  rx="4"
                  fill="none"
                  stroke="#C9A84C"
                  strokeWidth="1.5"
                  opacity="0.4"
                />
                <text
                  x="40"
                  y="48"
                  textAnchor="middle"
                  fill="#0A2342"
                  fontSize="22"
                  fontWeight="700"
                  fontFamily="Barlow, sans-serif"
                >
                  Z
                </text>
              </svg>
            )}
          </div>
        </div>

        {/* Company name with shimmer */}
        <h1
          className="mt-7"
          style={{
            fontFamily: "Tajawal, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.02em",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,1) 40%, rgba(255,255,255,0.6) 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "text-shimmer 3s linear infinite",
            animationDelay: "1s",
          }}
        >
          {companyName || "ZIDNI"}
        </h1>

        {/* ZIDNI ERP subtitle */}
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            fontWeight: 400,
            color: "rgba(139,155,180,0.8)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 6,
            animation: "fade-up 0.6s ease forwards",
            animationDelay: "1.2s",
            opacity: 0,
            transform: "translateY(8px)",
          }}
        >
          ZIDNI ERP
        </p>

        {/* Progress bar */}
        <div className="mt-9" style={{ width: 200 }}>
          <div
            className="relative overflow-hidden"
            style={{
              width: 200,
              height: 2,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, #003B5C 0%, #00B4D8 50%, #C9A84C 100%)",
                width: `${progress}%`,
                transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
                position: "relative",
              }}
            >
              {/* Glow dot at end */}
              <div
                className="absolute"
                style={{
                  right: 0,
                  top: -2,
                  width: 12,
                  height: 6,
                  borderRadius: "50%",
                  background: "white",
                  filter: "blur(3px)",
                  opacity: 0.8,
                }}
              />
            </div>
          </div>

          {/* Percentage */}
          <p
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: "rgba(0,180,216,0.7)",
              marginTop: 8,
              letterSpacing: 1,
              textAlign: "center",
            }}
          >
            {progress}%
          </p>

          {/* Status message */}
          <p
            key={statusIndex}
            style={{
              fontFamily: "Tajawal, sans-serif",
              fontSize: 12,
              color: "rgba(139,155,180,0.6)",
              marginTop: 10,
              height: 18,
              textAlign: "center",
              animation: "msg-fade 0.4s ease forwards",
            }}
          >
            {STATUS_MESSAGES[statusIndex]}
          </p>
        </div>
      </div>

      {/* Bottom branding */}
      <p
        className="absolute"
        style={{
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "Inter, sans-serif",
          fontSize: 10,
          color: "rgba(139,155,180,0.35)",
          letterSpacing: 2,
          animation: "fade-in-bottom 1s ease forwards",
          animationDelay: "2s",
          opacity: 0,
          whiteSpace: "nowrap",
        }}
      >
        Powered by ZIDNI ERP — زِدني
      </p>

      {/* Keyframes */}
      <style>{`
        @keyframes grid-drift {
          0%   { transform: translate(0, 0) }
          100% { transform: translate(48px, 48px) }
        }
        @keyframes orb-pulse {
          0%,100% { transform: scale(1); opacity: 0.6 }
          50%      { transform: scale(1.15); opacity: 1 }
        }
        @keyframes logo-enter {
          to { opacity: 1; transform: scale(1) translateY(0) }
        }
        @keyframes ring-spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
        @keyframes dot-blink {
          0%,100% { opacity: 0.3; transform: scale(1) }
          50%      { opacity: 1;   transform: scale(1.5) }
        }
        @keyframes text-shimmer {
          0%   { background-position: 200% center }
          100% { background-position: -200% center }
        }
        @keyframes fade-up {
          to { opacity: 1; transform: translateY(0) }
        }
        @keyframes msg-fade {
          0%   { opacity: 0; transform: translateY(4px) }
          100% { opacity: 1; transform: translateY(0) }
        }
        @keyframes fade-in-bottom {
          to { opacity: 1 }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;

import { useEffect, useState } from "react";
import { FinixLogo } from "@/components/ui/FinixLogo";

const LoadingScreen = ({ demo = false }: { demo?: boolean } = {}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (demo) return;
    const t1 = setTimeout(() => setIsExiting(true), 3800);
    const t2 = setTimeout(() => setGone(true), 4600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [demo]);

  if (gone) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "#0D1B2A",
        animation: isExiting ? "screen-exit 800ms cubic-bezier(0.4, 0, 0.2, 1) forwards" : undefined,
      }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(232,160,32,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.5,
        }}
      />

      {/* Gold glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 400,
          height: 250,
          borderRadius: "50%",
          background: "radial-gradient(rgba(232,160,32,0.06), transparent 70%)",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center text-center z-10">
        {/* Logo with reveal animation */}
        <div
          style={{
            opacity: 0,
            transform: "translateY(12px) scale(0.95)",
            animation: "finixReveal 0.8s ease forwards",
            animationDelay: "400ms",
          }}
        >
          <FinixLogo variant="white" size="lg" />
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "Tajawal, sans-serif",
            fontWeight: 500,
            fontSize: 16,
            color: "rgba(255,255,255,0.5)",
            marginTop: 16,
            animation: "finixReveal 0.8s ease forwards",
            animationDelay: "1000ms",
            opacity: 0,
            transform: "translateY(12px) scale(0.95)",
          }}
        >
          أعمالك في أبهى صورها
        </p>

        {/* Subtitle */}
        <p
          dir="ltr"
          style={{
            direction: "ltr",
            fontFamily: "Montserrat, sans-serif",
            fontSize: 10,
            fontWeight: 400,
            color: "rgba(138,150,163,0.5)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 8,
            animation: "finixReveal 0.8s ease forwards",
            animationDelay: "1200ms",
            opacity: 0,
            transform: "translateY(12px) scale(0.95)",
          }}
        >
          YOUR BUSINESS, REBORN
        </p>

        {/* Progress bar */}
        <div
          style={{
            marginTop: 48,
            width: 180,
            opacity: 0,
            animation: "finixReveal 0.4s ease forwards",
            animationDelay: "1500ms",
          }}
        >
          <div
            className="relative overflow-hidden"
            style={{
              width: 180,
              height: 2,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #C9870A 0%, #E8A020 50%, #F45E0C 100%)",
                animation: "fill-progress 2s ease-in-out forwards",
                animationDelay: "1500ms",
                width: 0,
              }}
            />
          </div>
        </div>
      </div>

      {/* Version */}
      <p
        className="absolute"
        style={{
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.1)",
          letterSpacing: 2,
        }}
      >
        v3.0.0
      </p>

      <style>{`
        @keyframes finixReveal {
          0%   { opacity: 0; transform: translateY(12px) scale(0.95); }
          60%  { opacity: 1; transform: translateY(-2px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fill-progress {
          0%   { width: 0% }
          40%  { width: 45% }
          70%  { width: 72% }
          90%  { width: 90% }
          100% { width: 100% }
        }
        @keyframes screen-exit {
          0%   { opacity: 1; transform: scale(1); filter: blur(0); }
          100% { opacity: 0; transform: scale(1.04); filter: blur(6px); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;

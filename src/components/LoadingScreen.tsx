import { useEffect, useState } from "react";

const LoadingScreen = ({ demo = false }: { demo?: boolean } = {}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (demo) return;
    const t1 = setTimeout(() => setIsExiting(true), 3100);
    const t2 = setTimeout(() => setGone(true), 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [demo]);

  if (gone) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 45%, #0D2A4A 0%, #071828 55%, #020C14 100%)",
        animation: isExiting ? "screen-exit 500ms ease forwards" : undefined,
      }}
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(0,180,216,0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.4,
        }}
      />

      {/* Bottom teal glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 500,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(rgba(0,180,216,0.07), transparent 70%)",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center text-center z-10">
        {/* ZIDNI wordmark — forced LTR */}
        <h1
          dir="ltr"
          style={{
            direction: "ltr",
            unicodeBidi: "bidi-override",
            fontFamily: "Barlow, sans-serif",
            fontWeight: 800,
            fontSize: 56,
            letterSpacing: -1,
            color: "#FFFFFF",
            textShadow: "0 0 30px rgba(255,255,255,0.1)",
            margin: 0,
            animation: "brand-appear 1s cubic-bezier(0.16,1,0.3,1) forwards",
            animationDelay: "200ms",
            opacity: 0,
            transform: "translateY(16px)",
          }}
        >
          <span style={{ fontSize: 68, color: "#C9A84C", textShadow: "0 0 40px rgba(201,168,76,0.4)" }}>Z</span>IDNI
        </h1>

        {/* Arabic subtitle */}
        <p
          style={{
            fontFamily: "Tajawal, sans-serif",
            fontWeight: 300,
            fontSize: 18,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: 6,
            marginTop: 4,
            animation: "brand-appear 1s cubic-bezier(0.16,1,0.3,1) forwards",
            animationDelay: "350ms",
            opacity: 0,
            transform: "translateY(16px)",
          }}
        >
          زِدني
        </p>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 10,
            fontWeight: 400,
            color: "rgba(139,155,180,0.55)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 12,
            animation: "brand-appear 0.8s ease forwards",
            animationDelay: "600ms",
            opacity: 0,
            transform: "translateY(16px)",
          }}
        >
          ERP & ACCOUNTING PLATFORM
        </p>

        {/* Progress bar */}
        <div style={{ marginTop: 52, width: 180 }}>
          <div
            className="relative overflow-hidden"
            style={{
              width: 180,
              height: 1.5,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}
          >
            <div
              className="relative"
              style={{
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #006D8F 0%, #00B4D8 50%, #C9A84C 100%)",
                animation: "fill-progress 2.8s ease-in-out forwards",
                width: 0,
              }}
            >
              <div
                className="absolute"
                style={{
                  right: 0,
                  top: -2,
                  width: 8,
                  height: 5,
                  background: "white",
                  borderRadius: "50%",
                  filter: "blur(3px)",
                  opacity: 0.9,
                }}
              />
            </div>
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
          color: "rgba(255,255,255,0.12)",
          letterSpacing: 2,
        }}
      >
        v2.0.1
      </p>

      <style>{`
        @keyframes brand-appear {
          to { opacity: 1; transform: translateY(0) }
        }
        @keyframes fill-progress {
          0%   { width: 0% }
          40%  { width: 45% }
          70%  { width: 72% }
          90%  { width: 90% }
          100% { width: 100% }
        }
        @keyframes screen-exit {
          0%   { opacity: 1 }
          100% { opacity: 0 }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;

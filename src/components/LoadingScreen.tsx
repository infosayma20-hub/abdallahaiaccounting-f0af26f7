import { useEffect, useState } from "react";

const LoadingScreen = ({ demo = false }: { demo?: boolean } = {}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (demo) return;
    const t1 = setTimeout(() => setIsExiting(true), 5300);
    const t2 = setTimeout(() => setGone(true), 6100); // longer for smoother exit
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [demo]);

  if (gone) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 45%, #0D2A4A 0%, #071828 55%, #020C14 100%)",
        animation: isExiting ? "screen-exit 800ms cubic-bezier(0.4, 0, 0.2, 1) forwards" : undefined,
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
        {/* ZIDNI wordmark with SVG Z + text IDNI */}
        <div
          dir="ltr"
          style={{
            direction: "ltr",
            display: "flex",
            alignItems: "baseline",
            flexDirection: "row",
            gap: 2,
          }}
        >
          {/* SVG Z that draws itself */}
          <div className="relative" style={{ width: 58, height: 68 }}>
            <svg
              viewBox="0 0 58 68"
              width="58"
              height="68"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: "visible" }}
            >
              {/* Glow layer */}
              <path
                d="M6 10 L48 10 L10 58 L52 58"
                stroke="#C9A84C"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
                filter="url(#z-glow)"
                style={{
                  strokeDasharray: 168,
                  strokeDashoffset: 168,
                  animation: "draw-z 1.2s cubic-bezier(0.4,0,0.2,1) forwards",
                  animationDelay: "300ms",
                }}
              />
              {/* Main stroke */}
              <path
                d="M6 10 L48 10 L10 58 L52 58"
                stroke="#C9A84C"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 168,
                  strokeDashoffset: 168,
                  animation: "draw-z 1.2s cubic-bezier(0.4,0,0.2,1) forwards",
                  animationDelay: "300ms",
                }}
              />
              <defs>
                <filter id="z-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>

            {/* Spark at end of Z stroke */}
            <div
              style={{
                position: "absolute",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#C9A84C",
                bottom: 7,
                right: 2,
                animation: "spark-burst 0.4s ease-out forwards",
                animationDelay: "1450ms",
                opacity: 0,
                transform: "scale(0)",
              }}
            />
          </div>

          {/* IDNI text — appears after Z finishes */}
          <span
            style={{
              fontFamily: "Barlow, sans-serif",
              fontWeight: 800,
              fontSize: 56,
              letterSpacing: -1,
              color: "#FFFFFF",
              textShadow: "0 0 30px rgba(255,255,255,0.1)",
              lineHeight: 1,
              opacity: 0,
              transform: "translateX(-8px)",
              animation: "idni-appear 0.5s ease forwards",
              animationDelay: "1400ms",
            }}
          >
            IDNI
          </span>
        </div>

        {/* Arabic subtitle */}
        <p
          style={{
            fontFamily: "Tajawal, sans-serif",
            fontWeight: 300,
            fontSize: 18,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: 6,
            marginTop: 8,
            animation: "brand-appear 0.8s ease forwards",
            animationDelay: "1800ms",
            opacity: 0,
            transform: "translateY(12px)",
          }}
        >
          زِدني
        </p>

        {/* Tagline */}
        <p
          dir="ltr"
          style={{
            direction: "ltr",
            fontFamily: "Inter, sans-serif",
            fontSize: 10,
            fontWeight: 400,
            color: "rgba(139,155,180,0.55)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 12,
            animation: "brand-appear 0.8s ease forwards",
            animationDelay: "2000ms",
            opacity: 0,
            transform: "translateY(12px)",
          }}
        >
          ERP & ACCOUNTING PLATFORM
        </p>

        {/* Progress bar */}
        <div
          style={{
            marginTop: 52,
            width: 180,
            opacity: 0,
            animation: "brand-appear 0.4s ease forwards",
            animationDelay: "2200ms",
          }}
        >
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
                animationDelay: "2200ms",
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
        @keyframes draw-z {
          0%   { stroke-dashoffset: 168 }
          100% { stroke-dashoffset: 0 }
        }
        @keyframes idni-appear {
          0%   { opacity: 0; transform: translateX(-8px) }
          100% { opacity: 1; transform: translateX(0) }
        }
        @keyframes spark-burst {
          0%   { transform: scale(0); opacity: 1 }
          50%  { transform: scale(3); opacity: 0.8 }
          100% { transform: scale(0); opacity: 0 }
        }
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
          0%   { opacity: 1; transform: scale(1); filter: blur(0); }
          100% { opacity: 0; transform: scale(1.04); filter: blur(6px); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;

import { useEffect, useState } from "react";

type Phase = "logo" | "tagline" | "bar" | "done";

const LoadingScreen = ({ demo = false }: { demo?: boolean }) => {
  const [phase, setPhase] = useState<Phase>("logo");
  const [isExiting, setIsExiting] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("tagline"), 600);
    const t2 = setTimeout(() => setPhase("bar"), 1000);
    const t3 = setTimeout(() => setPhase("done"), 2200);

    let t4: ReturnType<typeof setTimeout>;
    let t5: ReturnType<typeof setTimeout>;
    if (!demo) {
      t4 = setTimeout(() => setIsExiting(true), 2800);
      t5 = setTimeout(() => setGone(true), 3500);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (t4) clearTimeout(t4);
      if (t5) clearTimeout(t5);
    };
  }, [demo]);

  if (gone) return null;

  const phaseIndex = ["logo", "tagline", "bar", "done"].indexOf(phase);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, #0D3158 0%, #0D1B2A 60%, #08111A 100%)",
        animation: isExiting
          ? "finixScreenExit 700ms cubic-bezier(0.4, 0, 0.2, 1) forwards"
          : undefined,
      }}
    >
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(rgba(232,160,32,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: phaseIndex >= 0 ? 0.6 : 0,
          transition: "opacity 0.8s ease",
        }}
      />

      {/* Warm ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 500,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(rgba(232,160,32,0.08), transparent 70%)",
          top: "38%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          opacity: phaseIndex >= 1 ? 1 : 0,
          transition: "opacity 1s ease",
        }}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center text-center z-10">
        {/* Logo with reveal animation */}
        <div
          style={{
            opacity: 0,
            transform: "translateY(20px) scale(0.9)",
            animation: "finixLogoReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            animationDelay: "200ms",
          }}
        >
          <div style={{ background: 'white', borderRadius: 20, padding: '14px 18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/q-icon.svg" alt="AMWALI أموالي" style={{ width: 120, height: 'auto' }} />
          </div>
        </div>

        {/* Arabic tagline */}
        <p
          style={{
            fontFamily: "Tajawal, sans-serif",
            fontWeight: 500,
            fontSize: 16,
            color: "rgba(255,255,255,0.55)",
            marginTop: 18,
            opacity: 0,
            transform: "translateY(8px)",
            animation:
              phaseIndex >= 1
                ? "finixFadeSlideIn 0.6s ease forwards"
                : undefined,
          }}
        >
          أعمالك في أبهى صورها
        </p>

        {/* English subtitle */}
        <p
          dir="ltr"
          style={{
            direction: "ltr",
            fontFamily: "Montserrat, sans-serif",
            fontSize: 10,
            fontWeight: 400,
            color: "rgba(138,150,163,0.45)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 8,
            opacity: 0,
            transform: "translateY(8px)",
            animation:
              phaseIndex >= 1
                ? "finixFadeSlideIn 0.6s ease 0.15s forwards"
                : undefined,
          }}
        >
          YOUR BUSINESS AT ITS BEST
        </p>

        {/* Progress bar */}
        <div
          style={{
            marginTop: 48,
            width: 200,
            opacity: 0,
            animation:
              phaseIndex >= 2
                ? "finixFadeSlideIn 0.4s ease forwards"
                : undefined,
          }}
        >
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
                  "linear-gradient(90deg, #C9870A 0%, #E8A020 50%, #F45E0C 100%)",
                animation:
                  phaseIndex >= 2
                    ? "finixProgressFill 1.6s ease-in-out forwards"
                    : undefined,
                width: 0,
              }}
            />
          </div>
        </div>
      </div>

      {/* Version tag */}
      <p
        className="absolute"
        style={{
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "Tajawal, sans-serif",
          fontSize: 13,
          color: "#4A9EE8",
          letterSpacing: 1,
        }}
      >
        AMWALI | أموالي
      </p>
    </div>
  );
};

export default LoadingScreen;

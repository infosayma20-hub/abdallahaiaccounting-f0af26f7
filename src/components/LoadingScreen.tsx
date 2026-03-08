import { useEffect, useState } from "react";

const LoadingScreen = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center" dir="rtl"
      style={{ background: "linear-gradient(180deg, #050F1E, #0A2342)" }}>
      {/* Spinning cube icon */}
      <div className="relative flex items-center justify-center mb-10">
        <svg
          className="w-[80px] h-[80px]"
          viewBox="0 0 80 80"
          style={{ animation: "spin-cube 3s linear infinite" }}
        >
          {/* Cube shape */}
          <rect x="16" y="16" width="48" height="48" rx="8" fill="none"
            strokeWidth="2" strokeLinecap="round"
            style={{ animation: "pulse-gold 2s ease-in-out infinite" }} />
          <rect x="24" y="24" width="32" height="32" rx="4" fill="none"
            stroke="hsl(43, 55%, 54%)" strokeWidth="1.5" opacity="0.4" />
          {/* Z letter */}
          <text x="40" y="48" textAnchor="middle" fill="hsl(40, 56%, 77%)"
            fontSize="22" fontWeight="700" fontFamily="Barlow, sans-serif"
            style={{ animation: "pulse-gold 2s ease-in-out infinite" }}>
            Z
          </text>
        </svg>
      </div>

      {/* Brand */}
      <div className="text-center space-y-1.5 mb-8">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "#F4F7FA", fontFamily: "Barlow, sans-serif" }}>
          ZIDNI
        </h1>
        <p className="text-xs font-medium" style={{ color: "#8B9BB4" }}>
          نظام إدارة الأعمال
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-40 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, #C9A84C, #E8D5A3)",
            transition: "width 100ms linear",
          }}
        />
      </div>
    </div>
  );
};

export default LoadingScreen;

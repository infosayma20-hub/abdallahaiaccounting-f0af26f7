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
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center" dir="rtl">
      {/* Central loader */}
      <div className="relative flex items-center justify-center mb-10">
        {/* Outer arc */}
        <svg className="absolute w-[120px] h-[120px] animate-[spin_3s_linear_infinite]" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="100 240" opacity="0.3" />
        </svg>

        {/* Middle arc - counter spin */}
        <svg className="absolute w-[96px] h-[96px] animate-[spin_2s_linear_infinite_reverse]" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray="60 204" opacity="0.15" />
        </svg>

        {/* Inner glow */}
        <div className="absolute w-16 h-16 rounded-full bg-primary/5 animate-[pulse_2s_ease-in-out_infinite]" />

        {/* Logo mark */}
        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center backdrop-blur-sm">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"
              stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15">
              <animate attributeName="fill-opacity" values="0.1;0.25;0.1" dur="2s" repeatCount="indefinite" />
            </path>
          </svg>
        </div>
      </div>

      {/* Brand */}
      <div className="text-center space-y-1.5 mb-8">
        <h1 className="text-lg font-bold text-foreground tracking-tight">عبدالله AI</h1>
        <p className="text-xs text-muted-foreground font-medium">المحاسبة الذكية</p>
      </div>

      {/* Progress bar */}
      <div className="w-40 h-[3px] bg-muted/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default LoadingScreen;

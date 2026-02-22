import { useEffect, useState } from "react";

const LoadingScreen = () => {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-8" dir="rtl">
      {/* Animated Logo */}
      <div className="relative flex items-center justify-center">
        {/* Outer rotating ring */}
        <div className="absolute w-28 h-28 rounded-full border-2 border-primary/20 animate-[spin_4s_linear_infinite]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary" />
        </div>
        
        {/* Middle pulsing ring */}
        <div className="absolute w-20 h-20 rounded-full border border-primary/10 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
        
        {/* Inner icon container */}
        <div className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite]">
          {/* Animated book/ledger icon */}
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-primary">
            <rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" strokeWidth="2" className="animate-[draw_2s_ease-in-out_infinite]" />
            <line x1="11" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7">
              <animate attributeName="x2" values="11;21;11" dur="2s" repeatCount="indefinite" />
            </line>
            <line x1="11" y1="14" x2="18" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
              <animate attributeName="x2" values="11;18;11" dur="2.5s" repeatCount="indefinite" />
            </line>
            <line x1="11" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3">
              <animate attributeName="x2" values="11;20;11" dur="3s" repeatCount="indefinite" />
            </line>
            {/* AI sparkle */}
            <circle cx="22" cy="8" r="2" fill="currentColor" opacity="0.8">
              <animate attributeName="r" values="1;2.5;1" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
      </div>

      {/* Brand name */}
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground font-medium">عبدالله AI</p>
        <p className="text-xl font-bold text-foreground">المحاسبة الذكية</p>
      </div>

      {/* Loading text */}
      <p className="text-sm text-muted-foreground">
        جارٍ التحميل{dots}
      </p>

      {/* Bottom progress bar */}
      <div className="absolute bottom-12 w-48 h-1 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full animate-[loading-bar_1.5s_ease-in-out_infinite]" />
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { width: 0%; margin-left: 0; }
          50% { width: 70%; margin-left: 15%; }
          100% { width: 0%; margin-left: 100%; }
        }
        @keyframes draw {
          0%, 100% { stroke-dashoffset: 0; }
          50% { stroke-dashoffset: 10; }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;

import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function GlobalNavigationLoader() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current === location.pathname) return;
    prevPath.current = location.pathname;

    setProgress(0);
    setVisible(true);

    const t1 = setTimeout(() => setProgress(30), 50);
    const t2 = setTimeout(() => setProgress(60), 120);
    const t3 = setTimeout(() => setProgress(85), 220);
    const t4 = setTimeout(() => setProgress(100), 350);
    const t5 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 550);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <>
      {/* Top progress bar */}
      <div className="fixed top-0 inset-x-0 z-[9990] h-[3px] bg-transparent pointer-events-none">
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, hsl(var(--accent)), hsl(37 90% 58%))",
            transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 0 12px hsl(var(--accent) / 0.5)",
          }}
        />
      </div>

    </>
  );
}

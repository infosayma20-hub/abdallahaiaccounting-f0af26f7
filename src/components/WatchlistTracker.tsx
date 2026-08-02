import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface SelfStatus {
  watched: boolean;
  track_pages?: boolean;
  trial_expires_at?: string | null;
  expired?: boolean;
  max_records?: number | null;
}

/**
 * يراقب الحسابات المدرجة في قائمة المراقبة فقط (account_watchlist).
 * للمستخدمين العاديين: لا يعمل شيء إطلاقاً (استعلام واحد خفيف عند الدخول).
 */
export function WatchlistTracker() {
  const location = useLocation();
  const status = useRef<SelfStatus>({ watched: false });
  const ready = useRef(false);
  const lastPath = useRef<string>("");

  // فحص الحالة مرة واحدة عند وجود جلسة
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) {
          ready.current = false;
          status.current = { watched: false };
          return;
        }
        const { data, error } = await supabase.rpc("wl_self_status");
        if (cancelled || error) return;
        status.current = (data ?? { watched: false }) as unknown as SelfStatus;
        ready.current = true;
        if (status.current.watched) {
          void supabase.rpc("wl_track", {
            p_path: window.location.pathname,
            p_title: document.title,
            p_kind: "login",
            p_metadata: { ua: navigator.userAgent.slice(0, 200) },
          });
        }
      } catch {
        /* لا شيء — المراقبة صامتة ولا تكسر التطبيق */
      }
    };

    void check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void check();
      if (event === "SIGNED_OUT") {
        ready.current = false;
        status.current = { watched: false };
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // تسجيل تنقل الصفحات
  useEffect(() => {
    if (!ready.current) return;
    if (!status.current.watched || !status.current.track_pages) return;
    const path = location.pathname;
    if (path === lastPath.current) return;
    lastPath.current = path;

    const t = window.setTimeout(() => {
      void supabase
        .rpc("wl_track", {
          p_path: path,
          p_title: document.title,
          p_kind: "page_view",
          p_metadata: {},
        })
        .then(undefined, () => undefined);
    }, 600);

    return () => window.clearTimeout(t);
  }, [location.pathname]);

  return null;
}

/** تسجيل حدث تصدير/طباعة يدوياً من أي شاشة (آمن ولا يرمي أخطاء) */
export async function trackWatchlistEvent(kind: "export" | "print", label?: string) {
  try {
    await supabase.rpc("wl_track", {
      p_path: window.location.pathname,
      p_title: label ?? document.title,
      p_kind: kind,
      p_metadata: {},
    });
  } catch {
    /* ignore */
  }
}

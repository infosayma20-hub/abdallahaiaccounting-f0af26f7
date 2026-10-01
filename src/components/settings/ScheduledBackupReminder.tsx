import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getSchedule, isDue, snooze } from "@/lib/local-backup-schedule";

/** When the user's optional local backup is due, offer a one-click download. */
export function ScheduledBackupReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!user?.id || pathname.startsWith("/pos") || pathname.startsWith("/auth")) return;
    const t = setTimeout(() => {
      if (!isDue(getSchedule(user.id))) return;
      snooze(user.id, 4);
      toast("حان موعد النسخة الاحتياطية على جهازك", {
        description: "بدّك ننزّل نسخة من بياناتك هلأ؟",
        duration: 20000,
        action: { label: "نزّلها الآن", onClick: () => navigate("/settings?section=backup&auto=1") },
      });
    }, 8000);
    return () => clearTimeout(t);
  }, [user?.id, pathname, navigate]);

  return null;
}

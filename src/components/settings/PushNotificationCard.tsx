import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./shell/SettingsSection";
import {
  enablePushNotifications,
  isIos,
  isIosStandalone,
  pushSupported,
} from "@/lib/push-notifications";
import { isFirebaseConfigured } from "@/lib/firebase-config";

const PushNotificationCard = () => {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    pushSupported().then(setSupported);
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    const res = await enablePushNotifications();
    setLoading(false);
    if (res.ok === true) {
      setPermission("granted");
      toast.success("تم تفعيل إشعارات Push على هذا الجهاز.");
      return;
    }
    toast.error(res.reason);
  };

  const configured = isFirebaseConfigured();
  const iosNeedsInstall = isIos() && !isIosStandalone();

  return (
    <SettingsSection
      title="إشعارات Push على الجهاز"
      description="استقبال إشعارات فورية على هذا الجهاز حتى لو كان التطبيق مغلقاً."
    >
      <div className="space-y-3">
        {!configured && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-sm">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              إعدادات Firebase غير مكتملة. على المطوّر تعبئة المفاتيح في
              <code className="mx-1 px-1 rounded bg-amber-100 dark:bg-amber-900/40">src/lib/firebase-config.ts</code>
              و
              <code className="mx-1 px-1 rounded bg-amber-100 dark:bg-amber-900/40">public/firebase-messaging-sw.js</code>.
            </div>
          </div>
        )}

        {supported === false && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
            <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
            <div>هذا المتصفح لا يدعم إشعارات Push.</div>
          </div>
        )}

        {iosNeedsInstall && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 text-sm">
            <Smartphone className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              على iPhone: افتح القائمة في Safari ← <strong>Add to Home Screen</strong>،
              ثم افتح التطبيق من أيقونته على الشاشة الرئيسية وفعّل الإشعارات من هناك (يتطلب iOS 16.4+).
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">حالة الإشعارات على هذا الجهاز</p>
              <p className="text-xs text-muted-foreground">
                {permission === "granted"
                  ? "مفعّلة ✓"
                  : permission === "denied"
                    ? "مرفوضة — فعّلها من إعدادات المتصفح"
                    : "غير مفعّلة"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleEnable}
            disabled={loading || supported === false || iosNeedsInstall || !configured || permission === "denied"}
          >
            {loading ? "جارٍ التفعيل..." : permission === "granted" ? "إعادة التسجيل" : "تفعيل الإشعارات"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
};

export default PushNotificationCard;
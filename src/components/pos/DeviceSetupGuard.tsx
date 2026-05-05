import { ShieldAlert, Monitor } from "lucide-react";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";
import { getDeviceBranchId, getDeviceTerminalId } from "@/lib/device-config";

interface Props {
  children: React.ReactNode;
}

/**
 * Guards the /device-setup route. Only admin / super_admin / supervisor
 * (or owner with no roles) can change device settings. Cashiers and other
 * limited roles see a friendly "no permission" screen with a back-to-POS
 * button — they are NOT silently redirected, so they understand what
 * happened and whom to contact.
 */
export default function DeviceSetupGuard({ children }: Props) {
  const { isDeviceAdmin, checking } = useIsDeviceAdmin();
  // First-run bypass: if the device has never been configured (no branch +
  // no terminal stored locally and no copy restored from the Print Bridge),
  // allow ANY logged-in user to complete the initial setup. Otherwise a
  // cashier opening a brand-new PC would be locked out with no way in.
  const isUnconfigured = !getDeviceBranchId() && !getDeviceTerminalId();

  if (checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: "hsl(var(--accent))",
            borderRightColor: "hsl(var(--accent) / 0.3)",
          }}
        />
      </div>
    );
  }

  if (!isDeviceAdmin && !isUnconfigured) {
    return (
      <div
        className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4"
        dir="rtl"
      >
        <div className="max-w-md w-full rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="p-5 flex items-center gap-3 bg-destructive/10">
            <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0 bg-destructive text-destructive-foreground">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                لا تملك صلاحية الوصول
              </h2>
              <p className="text-xs text-muted-foreground">
                إعدادات الجهاز محصورة بالإدارة.
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3 text-sm">
            <p className="text-foreground leading-relaxed">
              ليس لديك صلاحية تعديل إعدادات هذا الجهاز.
              <br />
              يرجى التواصل مع الإدارة لإعداد الفرع أو الطابعة أو محطة POS.
            </p>
            <div className="rounded-md bg-muted/40 border border-border p-2.5 text-[11px] text-muted-foreground">
              💡 إعدادات الجهاز (الفرع، Terminal، Print Bridge) يضبطها
              المدير مرة واحدة فقط لكل جهاز.
            </div>
          </div>

          <div className="p-3 border-t border-border bg-muted/20">
            <a
              href="/pos"
              onClick={(e) => {
                e.preventDefault();
                window.location.assign("/pos");
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Monitor className="h-4 w-4" /> رجوع إلى نقطة البيع
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
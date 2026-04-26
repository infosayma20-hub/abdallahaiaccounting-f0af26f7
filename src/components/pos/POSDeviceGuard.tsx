import { AlertTriangle, Settings, Monitor, Building2, Boxes, Wifi } from "lucide-react";

interface DeviceConfig {
  bridgeUrl: string;
  branchId: string;
  terminalId: string;
  label: string;
}

interface Props {
  config: DeviceConfig;
  /** branch_id resolved from the selected terminal row in DB (if any) */
  terminalBranchId?: string | null;
  /** branch_id resolved from the selected cash_box row in DB (if any) */
  cashBoxBranchId?: string | null;
}

/**
 * Hard guard rendered ABOVE the POS sales surface.
 * Two scenarios block selling:
 *  1. Device is not fully configured (no bridge URL / branch / terminal in localStorage).
 *  2. branch_id of the device, terminal and (optionally) cash_box disagree.
 */
export default function POSDeviceGuard({ config, terminalBranchId, cashBoxBranchId }: Props) {
  const missing: string[] = [];
  if (!config.bridgeUrl) missing.push("عنوان Print Bridge");
  if (!config.branchId) missing.push("الفرع");
  if (!config.terminalId) missing.push("محطة POS");

  // Conflict detection — only check when both sides are present.
  const conflicts: string[] = [];
  if (config.branchId && terminalBranchId && terminalBranchId !== config.branchId) {
    conflicts.push("الفرع المحفوظ في الجهاز يختلف عن الفرع المربوط بـ Terminal");
  }
  if (config.branchId && cashBoxBranchId && cashBoxBranchId !== config.branchId) {
    conflicts.push("الفرع المحفوظ في الجهاز يختلف عن الفرع المربوط بالصندوق المختار");
  }
  if (terminalBranchId && cashBoxBranchId && terminalBranchId !== cashBoxBranchId) {
    conflicts.push("الفرع المربوط بـ Terminal يختلف عن الفرع المربوط بالصندوق");
  }

  const isMissing = missing.length > 0;
  const hasConflict = conflicts.length > 0;

  if (!isMissing && !hasConflict) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-lg w-full rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className={`p-4 flex items-center gap-3 ${hasConflict ? "bg-destructive/10" : "bg-warning/10"}`}>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${hasConflict ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              {hasConflict ? "تعارض في إعدادات الفرع" : "هذا الجهاز غير مهيأ كنقطة بيع"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {hasConflict
                ? "تم منع البيع لحماية البيانات. راجع إعدادات الجهاز قبل المتابعة."
                : "يرجى إعداد الفرع والمحطة والطباعة أولاً."}
            </p>
          </div>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {isMissing && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">العناصر الناقصة:</p>
              <ul className="space-y-1.5">
                {missing.includes("عنوان Print Bridge") && (
                  <li className="flex items-center gap-2 text-foreground">
                    <Wifi className="h-4 w-4 text-warning" /> عنوان Print Bridge
                  </li>
                )}
                {missing.includes("الفرع") && (
                  <li className="flex items-center gap-2 text-foreground">
                    <Building2 className="h-4 w-4 text-warning" /> الفرع التابع له هذا الجهاز
                  </li>
                )}
                {missing.includes("محطة POS") && (
                  <li className="flex items-center gap-2 text-foreground">
                    <Boxes className="h-4 w-4 text-warning" /> محطة POS / Terminal
                  </li>
                )}
              </ul>
            </div>
          )}

          {hasConflict && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">تفاصيل التعارض:</p>
              <ul className="space-y-1.5 list-disc pr-5">
                {conflicts.map((c, i) => (
                  <li key={i} className="text-destructive">{c}</li>
                ))}
              </ul>
              <div className="mt-2 rounded-md bg-muted/50 p-2 text-[11px] font-mono text-muted-foreground space-y-1" dir="ltr">
                <div>device.branchId   = {config.branchId || "—"}</div>
                <div>terminal.branchId = {terminalBranchId || "—"}</div>
                <div>cashBox.branchId  = {cashBoxBranchId || "—"}</div>
              </div>
            </div>
          )}

          <div className="rounded-md bg-warning/5 border border-warning/20 p-2.5 text-[11px] text-foreground/80">
            ⛔ ممنوع فتح الوردية أو إضافة الأصناف أو الطباعة قبل اكتمال الإعداد ورفع التعارض.
          </div>
        </div>

        <div className="p-3 border-t border-border bg-muted/20 flex gap-2">
          <a
            href="/device-setup"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("[POSDeviceGuard] → /device-setup (hard nav)");
              window.location.assign("/device-setup");
            }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Settings className="h-4 w-4" /> إعداد الجهاز
          </a>
          <a
            href="/apps"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.assign("/apps");
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Monitor className="h-4 w-4" /> رجوع
          </a>
        </div>
      </div>
    </div>
  );
}

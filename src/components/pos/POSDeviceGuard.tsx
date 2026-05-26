import { AlertTriangle, Settings, ShieldAlert } from "lucide-react";
import { useIsDeviceAdmin } from "@/hooks/useIsDeviceAdmin";

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
 * Soft guard rendered as a top banner ABOVE the POS sales surface.
 * The POS UI remains visible so the cashier/admin can navigate to settings
 * from within the page. Actual sell-blocking is enforced at action time
 * via assertDeviceReady() — this component only surfaces the reason.
 */
export default function POSDeviceGuard({ config, terminalBranchId, cashBoxBranchId }: Props) {
  const { isDeviceAdmin } = useIsDeviceAdmin();
  const missing: string[] = [];
  if (!config.branchId) missing.push("الفرع");
  if (!config.terminalId) missing.push("محطة POS");
  // SECURITY: Device setup is restricted to admin / device_admin ONLY.
  // A cashier on a brand-new PC MUST call an admin to configure it —
  // letting employees pick branch/terminal themselves enables tampering
  // (e.g. binding a Ramallah terminal to a Nablus cash box).

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

  const bg = hasConflict ? "#fee2e2" : "#fef3c7";
  const border = hasConflict ? "#fecaca" : "#fde68a";
  const color = hasConflict ? "#7f1d1d" : "#78350f";
  const title = hasConflict
    ? "تعارض في إعدادات الفرع — البيع موقوف"
    : `الجهاز غير مهيأ — ${missing.length ? `ناقص: ${missing.join(" + ")}` : ""}`.trim();
  const subtitle = hasConflict
    ? conflicts[0]
    : "يمكنك تصفح الواجهة، لكن البيع وفتح الوردية موقوفان حتى اكتمال الإعداد.";

  return (
    <div
      dir="rtl"
      className="flex items-center gap-2 px-3 py-2 text-[12px] border-b shrink-0"
      style={{ background: bg, borderColor: border, color }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 leading-tight min-w-0">
        <div className="font-semibold truncate">{title}</div>
        <div className="opacity-80 truncate">{subtitle}</div>
      </div>
      {isDeviceAdmin ? (
        <button
          type="button"
          onClick={() => window.location.assign("/device-setup")}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white shrink-0"
          style={{ background: hasConflict ? "#7f1d1d" : "#78350f" }}
        >
          <Settings className="h-3.5 w-3.5" /> إعداد الجهاز
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] opacity-80">
            <ShieldAlert className="h-3.5 w-3.5" /> راجع الإدارة
          </span>
          <button
            type="button"
            onClick={() => window.location.assign("/choose-workspace")}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium border"
            style={{ borderColor: color, color }}
          >
            ← العودة
          </button>
        </div>
      )}
    </div>
  );
}

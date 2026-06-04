/**
 * POS Diagnostics Classifier — read-only.
 *
 * Pure helpers that translate raw probe results into clear, user-facing
 * states. Does NOT mutate anything, does NOT touch the existing POS/Bridge
 * flow. Used by the /pos/diagnostics page and by logging hooks only.
 */

export type DiagnosticState =
  | "ok"
  | "bridge_offline"
  | "bridge_online_unconfigured"
  | "printers_blocked_by_rls"
  | "printers_fallback"
  | "chrome_local_access_blocked"
  | "unknown";

export interface DiagnosticInput {
  bridgeReachable: boolean;
  bridgeHealth?: {
    status?: string;
    version?: string;
    online?: boolean;
    configured?: boolean;
    printersSource?: string; // "config" | "fallback" | etc.
    printersCount?: number;
    branchId?: string | null;
    terminalId?: string | null;
  } | null;
  cloudPrintersCount: number | null; // null = query failed (likely RLS)
  cloudQueryError?: string | null;
  isEmbeddedPreview: boolean;
  isSecureContext: boolean;
}

export interface DiagnosticResult {
  state: DiagnosticState;
  label: string;
  hint: string;
}

export function classifyDiagnostics(input: DiagnosticInput): DiagnosticResult {
  if (input.isEmbeddedPreview) {
    return {
      state: "chrome_local_access_blocked",
      label: "المعاينة المدمجة تمنع الوصول للشبكة المحلية",
      hint: "افتح التطبيق في تبويب مستقل (Open in new tab) ثم أعد الفحص.",
    };
  }

  if (!input.bridgeReachable) {
    return {
      state: "bridge_offline",
      label: "Print Bridge غير متاح",
      hint: "تأكد أن خدمة Print Bridge شغّالة على جهاز الكاشير (127.0.0.1:3001).",
    };
  }

  const h = input.bridgeHealth;
  const branchId = h?.branchId ?? null;
  const terminalId = h?.terminalId ?? null;
  if (!branchId || !terminalId) {
    return {
      state: "bridge_online_unconfigured",
      label: "Bridge شغّال لكن الجهاز غير مرتبط بفرع/محطة",
      hint: "افتح إعدادات الجهاز واربط الفرع والمحطة، ثم أعد الفحص.",
    };
  }

  if (input.cloudPrintersCount === null) {
    return {
      state: "printers_blocked_by_rls",
      label: "لا يمكن قراءة الطابعات من السحابة",
      hint:
        "الصلاحيات (RLS) تمنع المستخدم الحالي من قراءة pos_printers. تأكد أن سياسة \"Team can view POS printers\" موجودة وأن المستخدم تابع لنفس مالك الشركة." +
        (input.cloudQueryError ? ` تفاصيل: ${input.cloudQueryError}` : ""),
    };
  }

  if ((h?.printersSource ?? "").toLowerCase() === "fallback") {
    return {
      state: "printers_fallback",
      label: "Bridge يستخدم Fallback printers (تجريبية)",
      hint:
        "ملف device.json على جهاز الكاشير لا يحتوي على طابعات معرفة، فاستخدم Bridge طابعات وهمية للاختبار. عرّف الطابعات الحقيقية من إعدادات الجهاز.",
    };
  }

  return {
    state: "ok",
    label: "جميع الفحوصات الأساسية ناجحة",
    hint: "Bridge شغّال، الجهاز مربوط بفرع ومحطة، وقراءة الطابعات السحابية تعمل.",
  };
}

/** Light-weight console logger that tags POS diagnostic events consistently. */
export function logPosDiagnostic(result: DiagnosticResult, extra?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.info(`[pos-diagnostics] ${result.state}: ${result.label}`, extra ?? {});
}
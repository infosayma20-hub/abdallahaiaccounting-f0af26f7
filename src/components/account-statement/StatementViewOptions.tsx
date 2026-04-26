import { useState } from "react";
import { Settings2, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface StatementViewOptions {
  // Columns
  showReference: boolean;
  showDueDate: boolean;
  showType: boolean;
  // Row expansion
  showInvoiceDetails: boolean;   // show invoice items inline
  showVoucherDetails: boolean;   // show payment method / linked invoices inline
  // Document/header
  showCompanyLogo: boolean;
  showContactInfo: boolean;
  showSignature: boolean;
  showAging: boolean;
}

export const DEFAULT_VIEW_OPTIONS: StatementViewOptions = {
  showReference: true,
  showDueDate: true,
  showType: true,
  showInvoiceDetails: false,
  showVoucherDetails: false,
  showCompanyLogo: true,
  showContactInfo: true,
  showSignature: true,
  showAging: true,
};

const STORAGE_KEY = "amwali.statement.view-options.v1";

export function loadViewOptions(): StatementViewOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW_OPTIONS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_VIEW_OPTIONS,
      ...parsed,
      showInvoiceDetails: parsed.showInvoiceDetails ?? parsed.expandInvoices ?? DEFAULT_VIEW_OPTIONS.showInvoiceDetails,
      showVoucherDetails: parsed.showVoucherDetails ?? parsed.expandVouchers ?? DEFAULT_VIEW_OPTIONS.showVoucherDetails,
      showCompanyLogo: parsed.showCompanyLogo ?? parsed.showLogo ?? DEFAULT_VIEW_OPTIONS.showCompanyLogo,
      showContactInfo: parsed.showContactInfo ?? parsed.showCompanyContact ?? DEFAULT_VIEW_OPTIONS.showContactInfo,
      showSignature: parsed.showSignature ?? parsed.showSignatures ?? DEFAULT_VIEW_OPTIONS.showSignature,
    };
  } catch {
    return DEFAULT_VIEW_OPTIONS;
  }
}

export function saveViewOptions(opts: StatementViewOptions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
}

interface Props {
  value: StatementViewOptions;
  onChange: (next: StatementViewOptions) => void;
}

type Tab = "columns" | "details" | "document";

const SECTIONS: { tab: Tab; label: string }[] = [
  { tab: "columns", label: "الأعمدة" },
  { tab: "details", label: "التفاصيل" },
  { tab: "document", label: "المستند" },
];

const FIELDS: Record<Tab, Array<{ key: keyof StatementViewOptions; label: string; hint?: string }>> = {
  columns: [
    { key: "showReference", label: "إظهار المرجع" },
    { key: "showDueDate", label: "إظهار تاريخ الاستحقاق" },
    { key: "showType", label: "إظهار النوع" },
  ],
  details: [
    { key: "showInvoiceDetails", label: "إظهار تفاصيل الفاتورة", hint: "أصناف، كميات، أسعار، الخصم والضريبة" },
    { key: "showVoucherDetails", label: "إظهار تفاصيل السند", hint: "طريقة الدفع، الصندوق/البنك، الفواتير المخصصة" },
    { key: "showAging", label: "إظهار تحليل التقادم (Aging)" },
  ],
  document: [
    { key: "showCompanyLogo", label: "إظهار شعار الشركة" },
    { key: "showContactInfo", label: "إظهار بيانات التواصل" },
    { key: "showSignature", label: "إظهار خانات التوقيع والاعتماد" },
  ],
};

export default function StatementViewOptionsPanel({ value, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("columns");

  const set = <K extends keyof StatementViewOptions>(k: K, v: StatementViewOptions[K]) => {
    const next = { ...value, [k]: v };
    onChange(next);
    saveViewOptions(next);
  };

  const reset = () => { onChange(DEFAULT_VIEW_OPTIONS); saveViewOptions(DEFAULT_VIEW_OPTIONS); };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
          <Settings2 className="w-3.5 h-3.5" />
          خيارات العرض
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0" dir="rtl">
        {/* Tabs */}
        <div className="flex items-center border-b" style={{ borderColor: "#E5E7EB" }}>
          {SECTIONS.map(s => (
            <button
              key={s.tab}
              onClick={() => setTab(s.tab)}
              className={cn(
                "flex-1 px-3 py-2 text-[12px] font-medium transition-colors",
                tab === s.tab
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
          {FIELDS[tab].map(f => (
            <label
              key={String(f.key)}
              className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={Boolean(value[f.key])}
                onCheckedChange={(c) => set(f.key, Boolean(c) as any)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-[12.5px] text-foreground">{f.label}</div>
                {f.hint && <div className="text-[10.5px] text-muted-foreground mt-0.5">{f.hint}</div>}
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-2" style={{ borderColor: "#E5E7EB" }}>
          <button
            onClick={reset}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50"
          >
            <RotateCcw className="w-3 h-3" />
            إعادة الافتراضي
          </button>
          <span className="text-[10px] text-muted-foreground">يُحفظ تلقائياً</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
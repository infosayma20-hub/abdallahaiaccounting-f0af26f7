import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, X } from "lucide-react";
import { format, addDays } from "date-fns";
import type { QuotationData } from "./QuotationDialog";

interface QuotationPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: QuotationData | null;
}

const QuotationPreview = ({ open, onOpenChange, data }: QuotationPreviewProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  useEffect(() => {
    if (data?.logo_url) {
      fetch(data.logo_url)
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onload = () => setLogoBase64(reader.result as string);
          reader.readAsDataURL(blob);
        })
        .catch(() => setLogoBase64(null));
    } else {
      setLogoBase64(null);
    }
  }, [data?.logo_url]);

  if (!data) return null;

  const expiryDate = addDays(new Date(data.quote_date), data.validity_days);
  const companyInitials = (data.company_name || "").slice(0, 2);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="utf-8"/>
      <title>عرض سعر - ${data.quote_number}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>
        @page { size: A4; margin: 15mm 20mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; font-size: 11px; color: #111827; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { max-width: 780px; margin: 0 auto; padding: 40px 0; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 8px 12px; font-size: 10px; font-weight: 600; text-align: right; }
        td { border: 1px solid #E5E7EB; padding: 7px 12px; font-size: 10.5px; text-align: right; }
        .amount { text-align: left; direction: ltr; font-family: 'Cairo', monospace; font-variant-numeric: tabular-nums; }
        .total-row td { font-weight: 700; background: #F9FAFB; }
        @media print { .no-print { display: none !important; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  const S = {
    page: { maxWidth: 780, margin: "0 auto", padding: "40px 48px", background: "white", fontFamily: "'Cairo', Arial, sans-serif", direction: "rtl" as const, color: "#111827", fontSize: 11, lineHeight: 1.7 },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "2px solid #111827", marginBottom: 20 },
    logo: { width: 60, height: 60, borderRadius: "50%", background: "#0D1B2E", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, overflow: "hidden" },
    th: { background: "#F9FAFB", border: "1px solid #E5E7EB", padding: "8px 12px", fontSize: 10, fontWeight: 600, textAlign: "right" as const },
    td: { border: "1px solid #E5E7EB", padding: "7px 12px", fontSize: 10.5, textAlign: "right" as const },
    tdAmount: { border: "1px solid #E5E7EB", padding: "7px 12px", fontSize: 10.5, textAlign: "left" as const, direction: "ltr" as const, fontFamily: "'Cairo', monospace", fontVariantNumeric: "tabular-nums" as const },
    totalRow: { fontWeight: 700, background: "#F9FAFB" },
    section: { marginBottom: 16 },
    label: { fontSize: 10, color: "#6B7280", marginBottom: 2 },
    value: { fontSize: 12, fontWeight: 600, color: "#111827" },
    sigLine: { borderTop: "1px solid #D1D5DB", paddingTop: 8, fontSize: 10, color: "#6B7280", textAlign: "center" as const, flex: 1 },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px] max-h-[95vh] overflow-y-auto p-0" style={{ background: "#E5E7EB" }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 bg-background border-b no-print" style={{ position: "sticky", top: 0, zIndex: 10 }}>
          <span className="text-sm font-semibold">معاينة عرض السعر</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> طباعة
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* A4 Page */}
        <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
          <div ref={printRef} style={{ ...S.page, boxShadow: "0 2px 8px rgba(0,0,0,0.12)", borderRadius: 4 }}>

            {/* Header */}
            <div style={S.header}>
              <div>
                {logoBase64 ? (
                  <img src={logoBase64} alt="logo" style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 8 }} />
                ) : (
                  <div style={S.logo}>{companyInitials}</div>
                )}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{data.company_name || "الشركة"}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>عرض سعر | Quotation</div>
              </div>
            </div>

            {/* Quote Info */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={S.label}>مقدَّم إلى:</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{data.client_name}</div>
                {data.client_address && <div style={{ fontSize: 10, color: "#6B7280" }}>{data.client_address}</div>}
              </div>
              <div style={{ textAlign: "left" }}>
                <table style={{ fontSize: 10, borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ color: "#6B7280", padding: "2px 16px 2px 0", textAlign: "right" }}>رقم العرض</td>
                      <td style={{ fontWeight: 500, textAlign: "right" }}>{data.quote_number}</td>
                    </tr>
                    <tr>
                      <td style={{ color: "#6B7280", padding: "2px 16px 2px 0", textAlign: "right" }}>التاريخ</td>
                      <td style={{ fontWeight: 500, textAlign: "right" }}>{data.quote_date}</td>
                    </tr>
                    <tr>
                      <td style={{ color: "#6B7280", padding: "2px 16px 2px 0", textAlign: "right" }}>صلاحية العرض</td>
                      <td style={{ fontWeight: 500, textAlign: "right" }}>{data.validity_days} يوم (حتى {format(expiryDate, "dd/MM/yyyy")})</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subject */}
            <div style={{ marginBottom: 16, fontSize: 12 }}>
              <strong>الموضوع:</strong> عرض سعر — {data.workshop_name || ""}
            </div>

            <div style={{ marginBottom: 16, fontSize: 11, color: "#374151" }}>
              السادة المحترمين، يسعدنا تقديم عرض الأسعار التالي لتنفيذ الأعمال المطلوبة:
            </div>

            {/* Items Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: "6%" }}>#</th>
                  <th style={{ ...S.th, width: "40%" }}>البند / الخدمة</th>
                  <th style={{ ...S.th, width: "12%" }}>الكمية</th>
                  <th style={{ ...S.th, width: "18%" }}>سعر الوحدة</th>
                  <th style={{ ...S.th, width: "24%" }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={i}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={S.td}>{item.description}</td>
                    <td style={S.td}>{item.quantity}</td>
                    <td style={S.tdAmount}>{Number(item.unit_price).toLocaleString()} ₪</td>
                    <td style={S.tdAmount}>{Number(item.total).toLocaleString()} ₪</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 20 }}>
              <table style={{ borderCollapse: "collapse", minWidth: 280 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 16px 4px 0", fontSize: 11, color: "#6B7280" }}>المجموع الفرعي</td>
                    <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 500, textAlign: "left", direction: "ltr" }}>{data.subtotal.toLocaleString()} ₪</td>
                  </tr>
                  {data.discount_percent > 0 && (
                    <tr>
                      <td style={{ padding: "4px 16px 4px 0", fontSize: 11, color: "#6B7280" }}>الخصم ({data.discount_percent}%)</td>
                      <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 500, textAlign: "left", direction: "ltr", color: "#DC2626" }}>−{data.discount_amount.toLocaleString()} ₪</td>
                    </tr>
                  )}
                  {data.tax_enabled && (
                    <tr>
                      <td style={{ padding: "4px 16px 4px 0", fontSize: 11, color: "#6B7280" }}>ضريبة القيمة المضافة (16%)</td>
                      <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 500, textAlign: "left", direction: "ltr" }}>{data.tax_amount.toLocaleString()} ₪</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "2px solid #111827" }}>
                    <td style={{ padding: "8px 16px 4px 0", fontSize: 13, fontWeight: 700 }}>الإجمالي النهائي</td>
                    <td style={{ padding: "8px 0 4px 0", fontSize: 13, fontWeight: 700, textAlign: "left", direction: "ltr" }}>{data.total.toLocaleString()} ₪</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Payment Terms */}
            {data.payment_terms && (
              <div style={S.section}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>شروط الدفع:</div>
                <div style={{ fontSize: 10.5, color: "#374151" }}>{data.payment_terms}</div>
              </div>
            )}

            {/* Notes */}
            {data.notes && (
              <div style={S.section}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>ملاحظات:</div>
                <div style={{ fontSize: 10.5, color: "#374151" }}>{data.notes}</div>
              </div>
            )}

            {/* Validity */}
            <div style={{ marginTop: 16, padding: "8px 12px", background: "#FFFBEB", borderRight: "3px solid #F59E0B", borderRadius: "0 4px 4px 0", fontSize: 10, color: "#92400E" }}>
              هذا العرض ساري لمدة {data.validity_days} يوماً من تاريخ الإصدار.
            </div>

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 48 }}>
              <div style={S.sigLine as any}>ختم الشركة وتوقيع المدير</div>
              <div style={S.sigLine as any}>اعتماد العميل</div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 6, marginTop: 20, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9CA3AF" }}>
              <span>طُبع بتاريخ: {format(new Date(), "dd/MM/yyyy")}</span>
              <span style={{ color: "#374151", fontWeight: 500 }}>{data.company_name}</span>
              <span>صفحة 1 من 1</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationPreview;

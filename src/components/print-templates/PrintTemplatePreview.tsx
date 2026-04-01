import { useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, X } from "lucide-react";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: any;
  embedded?: boolean;
}

const fmt = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TEMPLATE_TITLES: Record<string, string> = {
  QUO: "عرض سعر", CON: "عقد بيع", DEM: "مطالبة مالية", DN: "إشعار دين",
  CN: "إشعار دائن", RCP: "وصل استلام", SUP: "عقد توريد", OD: "إشعار تأخر سداد",
  POA: "تفويض رسمي", CLR: "خطاب إخلاء طرف",
};

const PrintTemplatePreview = ({ open, onOpenChange, document: doc, embedded = false }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { logoBase64, companyName, companyPhone, companyEmail, companyAddress, taxNumber } = useCompanyLogo();

  const type = doc?.template_type || "";
  const data = doc?.data || {};
  const title = TEMPLATE_TITLES[type] || type;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
      <style>
        @page { size: A4; margin: 15mm 20mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; font-size: 11px; color: #111827; margin: 0; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid #E5E7EB; }
        th { font-weight: 600; border-top: 1px solid #111827; border-bottom: 1px solid #111827; font-size: 10px; }
        .sig-line { border-top: 1px solid #9CA3AF; width: 150px; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 10px; color: #6B7280; }
      </style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const handlePDF = () => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = pdf.internal.pageSize.width;
    let y = 20;

    // Header
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(companyName || "AMWALI", W / 2, y, { align: "center" });
    y += 8;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    const info = [companyPhone, companyEmail, companyAddress].filter(Boolean).join(" | ");
    if (info) { pdf.text(info, W / 2, y, { align: "center" }); y += 5; }
    if (taxNumber) { pdf.text(`Tax: ${taxNumber}`, W / 2, y, { align: "center" }); y += 5; }

    // Separator
    pdf.setDrawColor(17, 24, 39);
    pdf.setLineWidth(0.5);
    pdf.line(20, y, W - 20, y);
    y += 8;

    // Title
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, W / 2, y, { align: "center" });
    y += 8;

    // Doc info
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${doc.document_number || ""}`, W - 20, y, { align: "right" });
    pdf.text(`${doc.document_date || ""}`, 20, y);
    y += 6;
    if (doc.contact_name) { pdf.text(`${doc.contact_name}`, W - 20, y, { align: "right" }); y += 6; }

    // Items table for QUO/SUP
    if ((type === "QUO" || type === "SUP") && data.items?.length) {
      const rows = data.items.map((it: any, i: number) => [
        String(i + 1), it.description || "", String(it.quantity || 0), `${fmt(it.unit_price || 0)}`, `${fmt((it.quantity || 0) * (it.unit_price || 0))}`,
      ]);
      autoTable(pdf, {
        startY: y,
        head: [["#", "البند", "الكمية", "سعر الوحدة", "الإجمالي"]],
        body: rows,
        theme: "plain",
        headStyles: { fontSize: 9, fontStyle: "bold", halign: "center", lineWidth: { top: 0.3, bottom: 0.3 }, lineColor: [17, 24, 39] },
        bodyStyles: { fontSize: 9, halign: "center" },
        margin: { left: 20, right: 20 },
      });
      y = (pdf as any).lastAutoTable?.finalY + 5 || y + 30;

      // Totals
      pdf.setFontSize(9);
      if (data.subtotal) { pdf.text(`المجموع الفرعي: ${fmt(data.subtotal)}`, W - 20, y, { align: "right" }); y += 5; }
      if (data.discount_percent > 0) { pdf.text(`الخصم (${data.discount_percent}%): -${fmt(data.subtotal * data.discount_percent / 100)}`, W - 20, y, { align: "right" }); y += 5; }
      if (data.total) { pdf.setFont("helvetica", "bold"); pdf.text(`الإجمالي: ${fmt(data.total)}`, W - 20, y, { align: "right" }); y += 5; }
    }

    // Amount for DEM/DN/CN/OD/RCP
    if (data.amount && type !== "QUO" && type !== "SUP") {
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text(`المبلغ: ${fmt(data.amount)}`, W / 2, y, { align: "center" });
      y += 8;
    }

    // Notes
    if (data.notes) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`ملاحظات: ${data.notes}`, W - 20, y, { align: "right" });
      y += 10;
    }

    // Signatures
    const sigY = Math.max(y + 20, 240);
    pdf.setDrawColor(156, 163, 175);
    pdf.setLineWidth(0.2);
    pdf.line(20, sigY, 70, sigY);
    pdf.line(W / 2 - 25, sigY, W / 2 + 25, sigY);
    pdf.line(W - 70, sigY, W - 20, sigY);
    pdf.setFontSize(8);
    pdf.text("توقيع المستلم", 45, sigY + 5, { align: "center" });
    pdf.text("ختم الشركة", W / 2, sigY + 5, { align: "center" });
    pdf.text("المدير", W - 45, sigY + 5, { align: "center" });

    pdf.save(`${doc.document_number || title}.pdf`);
  };

  const renderBody = () => {
    switch (type) {
      case "QUO":
        return (
          <>
            <p style={{ marginBottom: 8 }}>السادة المحترمين، يسعدنا تقديم عرض الأسعار التالي لتنفيذ الأعمال المطلوبة:</p>
            {data.items?.length > 0 && (
              <table>
                <thead><tr><th>#</th><th>البند / الخدمة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                <tbody>
                  {data.items.map((it: any, i: number) => (
                    <tr key={i}><td>{i + 1}</td><td>{it.description}</td><td>{it.quantity}</td><td>₪{fmt(it.unit_price)}</td><td>₪{fmt(it.quantity * it.unit_price)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 12, fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>المجموع الفرعي:</span><span>₪{fmt(data.subtotal || 0)}</span></div>
              {data.discount_percent > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>الخصم ({data.discount_percent}%):</span><span>-₪{fmt((data.subtotal || 0) * data.discount_percent / 100)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #111", paddingTop: 4, marginTop: 4 }}><span>الإجمالي النهائي:</span><span>₪{fmt(data.total || 0)}</span></div>
            </div>
            {data.payment_terms && <p style={{ marginTop: 12 }}><strong>شروط الدفع:</strong> {data.payment_terms}</p>}
            {data.validity_days && <p>هذا العرض ساري لمدة {data.validity_days} يوماً من تاريخ الإصدار.</p>}
          </>
        );

      case "CON":
        return (
          <>
            <p><strong>وصف العمل:</strong> {data.work_description}</p>
            <p><strong>القيمة الإجمالية:</strong> ₪{fmt(data.contract_value || 0)}</p>
            <p><strong>مدة التنفيذ:</strong> {data.execution_period}</p>
            {data.warranty_terms && <p><strong>شروط الضمان:</strong> {data.warranty_terms}</p>}
          </>
        );

      case "DEM":
        return (
          <>
            <p>نحيطكم علماً بأن المبلغ المستحق لدينا هو <strong>₪{fmt(data.amount || 0)}</strong>.</p>
            <p>نرجو التكرم بتسديد المبلغ أعلاه خلال <strong>{data.response_days || 7} أيام</strong> من تاريخ هذا الخطاب.</p>
          </>
        );

      case "DN":
        return (
          <>
            <p>بناءً على ذلك، تم إضافة مبلغ <strong>₪{fmt(data.amount || 0)}</strong> على حسابكم.</p>
            {data.reason && <p><strong>السبب:</strong> {data.reason}</p>}
            {data.ref_invoice && <p><strong>رقم الفاتورة المرجعية:</strong> {data.ref_invoice}</p>}
          </>
        );

      case "CN":
        return (
          <>
            <p>بناءً على ذلك، تم خصم مبلغ <strong>₪{fmt(data.amount || 0)}</strong> من حسابكم.</p>
            {data.reason && <p><strong>السبب:</strong> {data.reason}</p>}
            {data.ref_invoice && <p><strong>رقم الفاتورة المرجعية:</strong> {data.ref_invoice}</p>}
          </>
        );

      case "RCP":
        return (
          <>
            <p>أقر أنا الموقع أدناه باستلام: <strong>{data.receive_type}</strong></p>
            <p><strong>الكمية / المبلغ:</strong> {data.amount}</p>
            <p><strong>الحالة:</strong> {data.condition}</p>
            {data.receiver_name && <p><strong>اسم المستلِم:</strong> {data.receiver_name}</p>}
          </>
        );

      case "SUP":
        return (
          <>
            <p><strong>المورد:</strong> {data.supplier_name}</p>
            {data.items?.length > 0 && (
              <table>
                <thead><tr><th>#</th><th>المادة</th><th>الكمية</th><th>السعر</th></tr></thead>
                <tbody>
                  {data.items.map((it: any, i: number) => (
                    <tr key={i}><td>{i + 1}</td><td>{it.description}</td><td>{it.quantity}</td><td>₪{fmt(it.unit_price)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p><strong>مدة العقد:</strong> من {data.contract_from} إلى {data.contract_to}</p>
            {data.supply_terms && <p><strong>شروط التوريد:</strong> {data.supply_terms}</p>}
          </>
        );

      case "OD":
        return (
          <>
            <p>نود إبلاغكم بوجود مبلغ متأخر قدره <strong>₪{fmt(data.amount || 0)}</strong>.</p>
            <p>نرجو التسديد خلال <strong>{data.response_days || 7} أيام</strong>.</p>
            {data.urgency_level === "firm" && <p style={{ color: "#DC2626" }}>⚠️ هذا تحذير حازم — يرجى الالتزام بالسداد فوراً.</p>}
            {data.urgency_level === "final" && <p style={{ color: "#DC2626", fontWeight: 700 }}>🚨 إنذار نهائي — سيتم اتخاذ إجراءات قانونية في حال عدم السداد.</p>}
          </>
        );

      case "POA":
        return (
          <>
            <p>أنا الموقع أدناه أفوّض السيد/ة <strong>{data.delegate_name}</strong> (هوية رقم: {data.delegate_id})</p>
            <p>للتعامل مع <strong>{data.target_entity}</strong></p>
            <p><strong>مدة التفويض:</strong> من {data.poa_from} إلى {data.poa_to}</p>
          </>
        );

      case "CLR":
        return (
          <>
            <p>نشهد بموجب هذا الخطاب أن الجهة المذكورة أدناه قد أوفت بجميع التزاماتها المالية والتعاقدية.</p>
            {data.subject && <p><strong>الموضوع:</strong> {data.subject}</p>}
            <p>وبناءً عليه، فإنه لا توجد أي مطالبات أو التزامات مالية متبقية.</p>
          </>
        );

      default: return <p>—</p>;
    }
  };

  return (
  const previewContent = (
    <>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 no-print">
          <span className="text-sm font-medium">معاينة {title}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handlePDF}><Download className="w-3.5 h-3.5 ml-1" /> تحميل PDF</Button>
            <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="w-3.5 h-3.5 ml-1" /> طباعة</Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Preview */}
        <div className="overflow-y-auto p-6" style={{ background: "#E5E7EB", maxHeight: "calc(95vh - 50px)" }}>
          <div
            ref={printRef}
            style={{
              maxWidth: 780, margin: "0 auto", background: "white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)", borderRadius: 4,
              padding: "40px 48px", direction: "rtl", fontFamily: "'Cairo', Arial, sans-serif",
              fontSize: 11, color: "#111827",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{companyName || "AMWALI"}</div>
                <div style={{ fontSize: 9, color: "#6B7280" }}>{[companyPhone, companyEmail].filter(Boolean).join(" | ")}</div>
                {companyAddress && <div style={{ fontSize: 9, color: "#6B7280" }}>{companyAddress}</div>}
                {taxNumber && <div style={{ fontSize: 9, color: "#6B7280" }}>الرقم الضريبي: {taxNumber}</div>}
              </div>
              {logoBase64 ? (
                <img src={logoBase64} alt="logo" style={{ height: 50, objectFit: "contain" }} />
              ) : (
                <div style={{ width: 50, height: 50, borderRadius: "50%", background: "#0D1B2E", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
                  {(companyName || "A").charAt(0)}
                </div>
              )}
            </div>

            {/* Separator */}
            <hr style={{ border: "none", borderTop: "1.5px solid #111827", margin: "8px 0 16px" }} />

            {/* Document Info */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
                رقم: {doc.document_number} &nbsp;|&nbsp; التاريخ: {doc.document_date}
              </div>
            </div>

            {/* Recipient */}
            {doc.contact_name && doc.contact_name !== "—" && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "#F9FAFB", borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>مقدَّم إلى:</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.contact_name}</div>
                {data.contact_address && <div style={{ fontSize: 10, color: "#6B7280" }}>{data.contact_address}</div>}
              </div>
            )}

            {/* Body */}
            <div style={{ lineHeight: 1.8, fontSize: 11 }}>
              {renderBody()}
            </div>

            {/* Notes */}
            {data.notes && (
              <div style={{ marginTop: 16, padding: "8px 12px", background: "#F9FAFB", borderRadius: 4, fontSize: 10 }}>
                <strong>ملاحظات:</strong> {data.notes}
              </div>
            )}

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 60 }}>
              <div className="sig-line" style={{ borderTop: "1px solid #9CA3AF", width: 150, paddingTop: 4, textAlign: "center", fontSize: 10, color: "#6B7280" }}>توقيع المستلم</div>
              <div className="sig-line" style={{ borderTop: "1px solid #9CA3AF", width: 150, paddingTop: 4, textAlign: "center", fontSize: 10, color: "#6B7280" }}>ختم الشركة</div>
              <div className="sig-line" style={{ borderTop: "1px solid #9CA3AF", width: 150, paddingTop: 4, textAlign: "center", fontSize: 10, color: "#6B7280" }}>المدير</div>
            </div>

            {/* Footer */}
            <hr style={{ border: "none", borderTop: "1px solid #E5E7EB", margin: "24px 0 8px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#9CA3AF" }}>
              <span>{companyName}</span>
              <span>تاريخ الطباعة: {new Date().toLocaleDateString("en-GB")}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintTemplatePreview;

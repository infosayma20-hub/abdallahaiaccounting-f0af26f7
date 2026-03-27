import { useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";

const formTypeLabels: Record<string, string> = {
  leave_request: "طلب إجازة",
  advance_request: "طلب سلفة",
  loan_request: "طلب قرض حسن",
  correction_request: "تصحيح بصمة",
  overtime_request: "طلب أوفرتايم",
  hr_message: "رسالة لـ HR",
  employee_info: "تعبئة معلومات",
  birthday_whatsapp: "تاريخ الميلاد والواتساب",
  complaints: "شكاوى وملاحظات",
  disciplinary_action: "طلب إجراء عقابي",
  facility_quality: "جودة المرافق",
  equipment_fault: "إبلاغ أعطال",
  inventory_balance: "رصيد الأصناف",
};

const statusLabels: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "تمت الموافقة ✅",
  rejected: "مرفوض ❌",
};

const fieldLabels: Record<string, string> = {
  reason: "السبب",
  from_date: "من تاريخ",
  to_date: "إلى تاريخ",
  leave_type: "نوع الإجازة",
  amount: "المبلغ",
  loan_amount: "مبلغ القرض",
  purpose: "الغرض",
  date: "التاريخ",
  hours: "الساعات",
  message: "الرسالة",
  employee_name: "اسم الموظف",
  branch: "الفرع",
  notes: "ملاحظات",
  installments: "عدد الأقساط",
  items: "الأصناف",
};

const leaveTypes: Record<string, string> = {
  annual: "سنوية",
  sick: "مرضية",
  personal: "شخصية",
  unpaid: "بدون راتب",
};

interface Props {
  open: boolean;
  onClose: () => void;
  form: any;
  employeeName: string;
  employeeBranch: string;
  companyName?: string;
  companyLogo?: string;
}

const EmployeeFormPrintView = ({ open, onClose, form, employeeName, employeeBranch, companyName, companyLogo }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!form) return null;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>${formTypeLabels[form.form_type] || form.form_type}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Tajawal', sans-serif; direction: rtl; padding: 0; background: #fff; color: #1a1a2e; }
          @page { size: A4; margin: 15mm; }
          .page { max-width: 210mm; margin: 0 auto; padding: 24px; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 20px; }
          .header-right { display: flex; align-items: center; gap: 12px; }
          .logo { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; }
          .company-name { font-size: 22px; font-weight: 800; color: #1a1a2e; }
          .form-type-badge { background: #1a1a2e; color: #fff; padding: 8px 24px; border-radius: 8px; font-size: 16px; font-weight: 700; }
          .meta-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; padding: 12px 16px; background: #f8f9fb; border-radius: 8px; border: 1px solid #e5e7eb; }
          .meta-item { flex: 1; min-width: 140px; }
          .meta-label { font-size: 10px; color: #6b7280; font-weight: 500; margin-bottom: 2px; }
          .meta-value { font-size: 14px; font-weight: 700; color: #1a1a2e; }
          .section-title { font-size: 14px; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 2px solid #e5e7eb; }
          .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 20px; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
          .field-row { display: flex; border-bottom: 1px solid #e5e7eb; }
          .field-row:last-child { border-bottom: none; }
          .field-label { background: #f3f4f6; padding: 10px 14px; font-size: 12px; color: #4b5563; font-weight: 600; width: 140px; min-width: 140px; border-left: 1px solid #e5e7eb; }
          .field-value { padding: 10px 14px; font-size: 13px; font-weight: 500; color: #1a1a2e; flex: 1; }
          .full-width { grid-column: 1 / -1; }
          .status-section { margin-top: 20px; padding: 14px 16px; border-radius: 8px; border: 1px solid #d1d5db; }
          .status-approved { background: #ecfdf5; border-color: #a7f3d0; }
          .status-rejected { background: #fef2f2; border-color: #fecaca; }
          .status-pending { background: #fffbeb; border-color: #fde68a; }
          .status-label { font-size: 13px; font-weight: 700; }
          .review-notes { margin-top: 6px; font-size: 12px; color: #4b5563; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 16px; }
          .sig-block { text-align: center; width: 200px; }
          .sig-line { border-top: 1px solid #9ca3af; margin-top: 50px; padding-top: 6px; font-size: 11px; color: #6b7280; }
          .sig-name { font-size: 12px; font-weight: 600; color: #1a1a2e; margin-top: 4px; }
          .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
          .amount-highlight { font-size: 22px; font-weight: 800; color: #059669; text-align: center; padding: 12px; background: #ecfdf5; border-radius: 8px; margin-bottom: 16px; border: 1px solid #a7f3d0; }
          @media print { body { padding: 0; } .page { padding: 0; } }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    /* view only — no browser print */
  };

  const formData = form.form_data || {};
  const dataEntries = Object.entries(formData).filter(([k]) => k !== "attachment_url" && k !== "employee_name" && k !== "branch");

  const formatFieldValue = (key: string, value: any): string => {
    if (key === "leave_type") return leaveTypes[String(value)] || String(value);
    if (key === "amount" || key === "loan_amount") return `${Number(value).toLocaleString()} ₪`;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const amount = formData.amount || formData.loan_amount;
  const isFinancial = ["advance_request", "loan_request"].includes(form.form_type);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 bg-white" dir="rtl">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-card border-b border-border p-3 flex items-center justify-between print:hidden">
          <h3 className="text-sm font-bold text-foreground">معاينة الطباعة</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2 rounded-xl" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> طباعة
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Print Content */}
        <div ref={printRef}>
          <div className="page" style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", padding: "24px", maxWidth: "210mm", margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "3px solid #1a1a2e", paddingBottom: "16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {companyLogo && <img src={companyLogo} alt="" style={{ width: "56px", height: "56px", objectFit: "contain", borderRadius: "8px" }} />}
                <span style={{ fontSize: "22px", fontWeight: 800, color: "#1a1a2e" }}>{companyName || "الشركة"}</span>
              </div>
              <div style={{ background: "#1a1a2e", color: "#fff", padding: "8px 24px", borderRadius: "8px", fontSize: "16px", fontWeight: 700 }}>
                {formTypeLabels[form.form_type] || form.form_type}
              </div>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px", padding: "12px 16px", background: "#f8f9fb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
              <div style={{ flex: 1, minWidth: "140px" }}>
                <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 500, marginBottom: "2px" }}>اسم الموظف</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{employeeName || "—"}</div>
              </div>
              <div style={{ flex: 1, minWidth: "140px" }}>
                <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 500, marginBottom: "2px" }}>الفرع</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{employeeBranch || "—"}</div>
              </div>
              <div style={{ flex: 1, minWidth: "140px" }}>
                <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 500, marginBottom: "2px" }}>تاريخ التقديم</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{format(new Date(form.created_at), "dd/MM/yyyy HH:mm")}</div>
              </div>
              <div style={{ flex: 1, minWidth: "140px" }}>
                <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 500, marginBottom: "2px" }}>رقم الطلب</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{form.id?.slice(0, 8).toUpperCase()}</div>
              </div>
            </div>

            {/* Amount highlight for financial types */}
            {isFinancial && amount && (
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#059669", textAlign: "center", padding: "12px", background: "#ecfdf5", borderRadius: "8px", marginBottom: "16px", border: "1px solid #a7f3d0" }}>
                {Number(amount).toLocaleString()} ₪
              </div>
            )}

            {/* Form Details */}
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e", marginBottom: "12px", paddingBottom: "4px", borderBottom: "2px solid #e5e7eb" }}>
              تفاصيل النموذج
            </div>
            <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", overflow: "hidden", marginBottom: "20px" }}>
              {dataEntries.map(([key, value], idx) => (
                <div key={key} style={{ display: "flex", borderBottom: idx < dataEntries.length - 1 ? "1px solid #e5e7eb" : "none" }}>
                  <div style={{ background: "#f3f4f6", padding: "10px 14px", fontSize: "12px", color: "#4b5563", fontWeight: 600, width: "160px", minWidth: "160px", borderLeft: "1px solid #e5e7eb" }}>
                    {fieldLabels[key] || key.replace(/_/g, " ")}
                  </div>
                  <div style={{ padding: "10px 14px", fontSize: "13px", fontWeight: 500, color: "#1a1a2e", flex: 1 }}>
                    {formatFieldValue(key, value)}
                  </div>
                </div>
              ))}
            </div>

            {/* Status */}
            <div style={{
              marginTop: "20px", padding: "14px 16px", borderRadius: "8px", border: "1px solid #d1d5db",
              background: form.status === "approved" ? "#ecfdf5" : form.status === "rejected" ? "#fef2f2" : "#fffbeb",
              borderColor: form.status === "approved" ? "#a7f3d0" : form.status === "rejected" ? "#fecaca" : "#fde68a",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>
                الحالة: {statusLabels[form.status] || form.status}
              </div>
              {form.review_notes && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#4b5563" }}>
                  ملاحظات المراجعة: {form.review_notes}
                </div>
              )}
              {form.reviewed_at && (
                <div style={{ marginTop: "4px", fontSize: "11px", color: "#6b7280" }}>
                  تاريخ المراجعة: {format(new Date(form.reviewed_at), "dd/MM/yyyy HH:mm")}
                </div>
              )}
            </div>

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", paddingTop: "16px" }}>
              <div style={{ textAlign: "center", width: "200px" }}>
                <div style={{ borderTop: "1px solid #9ca3af", marginTop: "50px", paddingTop: "6px", fontSize: "11px", color: "#6b7280" }}>
                  توقيع الموظف
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#1a1a2e", marginTop: "4px" }}>{employeeName}</div>
              </div>
              <div style={{ textAlign: "center", width: "200px" }}>
                <div style={{ borderTop: "1px solid #9ca3af", marginTop: "50px", paddingTop: "6px", fontSize: "11px", color: "#6b7280" }}>
                  توقيع المدير المباشر
                </div>
              </div>
              <div style={{ textAlign: "center", width: "200px" }}>
                <div style={{ borderTop: "1px solid #9ca3af", marginTop: "50px", paddingTop: "6px", fontSize: "11px", color: "#6b7280" }}>
                  توقيع الإدارة
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: "30px", textAlign: "center", fontSize: "9px", color: "#9ca3af", borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
              تم إنشاء هذا النموذج إلكترونياً بواسطة نظام إدارة الموارد البشرية — {format(new Date(), "dd/MM/yyyy")}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeFormPrintView;

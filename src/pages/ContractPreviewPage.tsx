import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ContractPrintView, { ContractData } from "@/components/contracts/ContractPrintView";
import { ArrowRight, Printer, Edit, Download } from "lucide-react";
import { toast } from "sonner";

const statusOptions = [
  { value: "draft", label: "مسودة" },
  { value: "signed", label: "موقّع" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغي" },
];

export default function ContractPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const printRef = useRef<HTMLDivElement>(null);
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContract();
  }, [id]);

  const loadContract = async () => {
    if (!id) return;
    const { data } = await supabase.from("project_contracts" as any).select("*").eq("id", id).maybeSingle();
    if (data) setContract(data);
    setLoading(false);
  };

  const updateStatus = async (status: string) => {
    await supabase.from("project_contracts" as any).update({ status } as any).eq("id", id);
    setContract((c: any) => ({ ...c, status }));
    toast.success("تم تحديث الحالة");
  };

  const printContract = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !printRef.current) return;
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>عقد اتفاق - ${contract?.project_name || ""}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Cairo',sans-serif; direction:rtl; } @media print { @page { size:A4; margin:15mm; } }</style>
    </head><body>`);
    printWindow.document.write(printRef.current.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    /* view only — no browser print */
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;
  if (!contract) return <div className="p-8 text-center text-muted-foreground">العقد غير موجود</div>;

  const previewData: ContractData = {
    ...contract,
    scope_items: contract.scope_items || [],
    company_name: settings.company_name,
    company_phone: settings.phone,
    company_address: settings.address,
    company_email: settings.email,
    logo_url: contract.logo_url || settings.logo_url,
  };

  const statusBadge = statusOptions.find(s => s.value === contract.status);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto" dir="rtl">
      {/* Toolbar - no-print */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contracts")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{contract.contract_number}</h1>
            <p className="text-sm text-muted-foreground">{contract.project_name}</p>
          </div>
          <Badge variant={contract.status === "signed" ? "default" : contract.status === "cancelled" ? "destructive" : "secondary"}>
            {statusBadge?.label || "مسودة"}
          </Badge>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={contract.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => navigate(`/contracts/${id}/edit`)}>
            <Edit className="h-4 w-4 ml-1" /> تعديل
          </Button>
          <Button className="bg-[#1B3A5C] hover:bg-[#152d47]" onClick={printContract}>
            <Printer className="h-4 w-4 ml-1" /> 🖨️ طباعة
          </Button>
        </div>
      </div>

      {/* Contract Preview */}
      <div className="bg-white rounded-lg shadow-lg border overflow-hidden">
        <ContractPrintView data={previewData} />
      </div>

      {/* Hidden for print */}
      <div style={{ display: "none" }}>
        <ContractPrintView ref={printRef} data={previewData} />
      </div>
    </div>
  );
}

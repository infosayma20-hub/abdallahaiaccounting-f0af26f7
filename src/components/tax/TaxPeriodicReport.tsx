import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileSpreadsheet, Send, Receipt } from "lucide-react";
import { toast } from "sonner";

interface Props { ownerId: string; }

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

interface ReportData {
  standardSalesNet: number; standardTax: number;
  zeroSalesNet: number;
  exemptSalesNet: number;
  deductiblePurchasesNet: number; deductibleInputTax: number;
  nonDeductiblePurchasesNet: number; nonDeductibleTax: number;
  zeroPurchasesNet: number;
  exemptPurchasesNet: number;
  // قيم الإشعارات (مرتجعات): تخزن كأرقام موجبة لعرضها بإشارة سالبة
  creditNotesNet: number; creditNotesTax: number;       // إشعارات دائنة (تخفض المخرجات)
  debitNotesNet: number; debitNotesTax: number;         // إشعارات مدينة (تخفض المدخلات)
}

export default function TaxPeriodicReport({ ownerId }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ReportData | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    supabase.from("tax_settings").select("*").eq("user_id", ownerId).maybeSingle().then(({ data }) => setSettings(data));
  }, [ownerId]);

  const calculate = async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data: ledger } = await supabase
      .from("tax_ledger")
      .select("*")
      .eq("user_id", ownerId)
      .eq("period_year", year)
      .eq("period_month", month);

    const rows = ledger || [];
    const output = rows.filter(r => r.tax_type === "output");
    const input = rows.filter(r => r.tax_type === "input");

    setData({
      standardSalesNet: output.filter(r => r.tax_category === "standard").reduce((s, r) => s + Number(r.net_amount), 0),
      standardTax: output.filter(r => r.tax_category === "standard").reduce((s, r) => s + Number(r.tax_amount), 0),
      zeroSalesNet: output.filter(r => r.tax_category === "zero").reduce((s, r) => s + Number(r.net_amount), 0),
      exemptSalesNet: output.filter(r => r.tax_category === "exempt").reduce((s, r) => s + Number(r.net_amount), 0),
      deductiblePurchasesNet: input.filter(r => r.is_deductible && r.tax_category === "standard").reduce((s, r) => s + Number(r.net_amount), 0),
      deductibleInputTax: input.filter(r => r.is_deductible && r.tax_category === "standard").reduce((s, r) => s + Number(r.tax_amount), 0),
      nonDeductiblePurchasesNet: input.filter(r => !r.is_deductible).reduce((s, r) => s + Number(r.net_amount), 0),
      nonDeductibleTax: input.filter(r => !r.is_deductible).reduce((s, r) => s + Number(r.tax_amount), 0),
      zeroPurchasesNet: input.filter(r => r.tax_category === "zero").reduce((s, r) => s + Number(r.net_amount), 0),
      exemptPurchasesNet: input.filter(r => r.tax_category === "exempt").reduce((s, r) => s + Number(r.net_amount), 0),
    });
    setLoading(false);
  };

  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalOutputTax = data ? data.standardTax : 0;
  const totalInputTax = data ? data.deductibleInputTax : 0;
  const netTax = totalOutputTax - totalInputTax;

  const handlePrint = () => {
    const printContent = document.getElementById("tax-report-print");
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>التقرير الدوري</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: 'Cairo', sans-serif; font-size: 12px; color: #000; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { border: 1px solid #333; padding: 6px 10px; text-align: right; }
      th { background: #f0f0f0; font-weight: 600; }
      .title { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 5px; }
      .subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 15px; }
      .section-title { font-weight: 700; font-size: 14px; margin: 15px 0 5px; background: #f5f5f5; padding: 6px; }
      .total-row { font-weight: 700; background: #f5f5f5; }
      .net-row { font-weight: 700; background: #e8f5e9; font-size: 14px; }
      .red { color: #c62828; }
      .green { color: #2e7d32; }
    </style></head><body>${printContent.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <Card className="p-6 border border-border">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <h3 className="text-lg font-bold text-foreground">التقرير الدوري الشهري</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={calculate} disabled={loading || !ownerId} className="gap-2">
            {loading ? "جارِ الاحتساب..." : "احتساب"}
          </Button>
          {data && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="w-3.5 h-3.5" />طباعة</Button>
            </div>
          )}
        </div>
      </div>

      {data && (
        <div id="tax-report-print" className="space-y-6">
          {/* Print header */}
          <div className="hidden print:block">
            <div className="title">{settings?.tax_name || "ضريبة القيمة المضافة"}</div>
            <div className="subtitle">التقرير الدوري — {MONTHS[month-1]} {year}</div>
            {settings?.tax_number && <div className="subtitle">الرقم الضريبي: {settings.tax_number}</div>}
          </div>

          {/* Sales Section */}
          <div>
            <h4 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-500 rounded-full" />
              القسم الأول — المبيعات وضريبة المخرجات
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0D1B2E", color: "#fff" }}>
                    <th className="px-4 py-2.5 text-right font-medium text-xs">نوع الصفقة</th>
                    <th className="px-4 py-2.5 text-left font-medium text-xs">المبلغ الصافي</th>
                    <th className="px-4 py-2.5 text-center font-medium text-xs">النسبة</th>
                    <th className="px-4 py-2.5 text-left font-medium text-xs">الضريبة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2.5 text-right">مبيعات خاضعة</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.standardSalesNet)}</td>
                    <td className="px-4 py-2.5 text-center">16%</td>
                    <td className="px-4 py-2.5 text-left tabular-nums font-medium">{fmt(data.standardTax)}</td>
                  </tr>
                  <tr className="border-b border-border bg-muted/20">
                    <td className="px-4 py-2.5 text-right">مبيعات بنسبة صفر</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.zeroSalesNet)}</td>
                    <td className="px-4 py-2.5 text-center">0%</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">₪0.00</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2.5 text-right">مبيعات معفاة</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.exemptSalesNet)}</td>
                    <td className="px-4 py-2.5 text-center">—</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">₪0.00</td>
                  </tr>
                  <tr style={{ background: "#F1F5F9" }} className="font-bold">
                    <td className="px-4 py-2.5 text-right">إجمالي ضريبة المبيعات</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.standardSalesNet + data.zeroSalesNet + data.exemptSalesNet)}</td>
                    <td className="px-4 py-2.5 text-center"></td>
                    <td className="px-4 py-2.5 text-left tabular-nums text-red-600">{fmt(totalOutputTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Purchases Section */}
          <div>
            <h4 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-emerald-500 rounded-full" />
              القسم الثاني — المشتريات وضريبة المدخلات
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0D1B2E", color: "#fff" }}>
                    <th className="px-4 py-2.5 text-right font-medium text-xs">نوع المشتريات</th>
                    <th className="px-4 py-2.5 text-left font-medium text-xs">المبلغ الصافي</th>
                    <th className="px-4 py-2.5 text-center font-medium text-xs">النسبة</th>
                    <th className="px-4 py-2.5 text-left font-medium text-xs">الضريبة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2.5 text-right">مشتريات خاضعة (قابلة للخصم)</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.deductiblePurchasesNet)}</td>
                    <td className="px-4 py-2.5 text-center">16%</td>
                    <td className="px-4 py-2.5 text-left tabular-nums font-medium">{fmt(data.deductibleInputTax)}</td>
                  </tr>
                  <tr className="border-b border-border bg-muted/20">
                    <td className="px-4 py-2.5 text-right">مشتريات غير قابلة للخصم</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.nonDeductiblePurchasesNet)}</td>
                    <td className="px-4 py-2.5 text-center">16%</td>
                    <td className="px-4 py-2.5 text-left tabular-nums text-muted-foreground">{fmt(data.nonDeductibleTax)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2.5 text-right">مشتريات بنسبة صفر</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.zeroPurchasesNet)}</td>
                    <td className="px-4 py-2.5 text-center">0%</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">₪0.00</td>
                  </tr>
                  <tr className="border-b border-border bg-muted/20">
                    <td className="px-4 py-2.5 text-right">مشتريات معفاة</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">{fmt(data.exemptPurchasesNet)}</td>
                    <td className="px-4 py-2.5 text-center">—</td>
                    <td className="px-4 py-2.5 text-left tabular-nums">₪0.00</td>
                  </tr>
                  <tr style={{ background: "#F1F5F9" }} className="font-bold">
                    <td className="px-4 py-2.5 text-right">إجمالي ضريبة المدخلات القابلة للخصم</td>
                    <td className="px-4 py-2.5 text-left"></td>
                    <td className="px-4 py-2.5 text-center"></td>
                    <td className="px-4 py-2.5 text-left tabular-nums text-emerald-600">{fmt(totalInputTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Summary */}
          <Card className="p-5 border-2 border-primary/20">
            <h4 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" />
              القسم الثالث — صافي الضريبة المستحقة
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>ضريبة المخرجات (مبيعات)</span>
                <span className="tabular-nums font-medium text-red-600">{fmt(totalOutputTax)}</span>
              </div>
              <div className="flex justify-between">
                <span>(-) ضريبة المدخلات (مشتريات قابلة للخصم)</span>
                <span className="tabular-nums font-medium text-emerald-600">{fmt(totalInputTax)}</span>
              </div>
              <hr className="border-foreground/20" />
              <div className="flex justify-between text-base font-bold">
                <span>صافي الضريبة</span>
                <span className={`tabular-nums ${netTax > 0 ? "text-red-600" : netTax < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {fmt(Math.abs(netTax))}
                  {netTax > 0 && <span className="text-xs font-normal mr-2">مستحق الدفع</span>}
                  {netTax < 0 && <span className="text-xs font-normal mr-2">مستحق الاسترداد</span>}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">اختر الفترة واضغط "احتساب" لعرض التقرير</p>
        </div>
      )}
    </Card>
  );
}

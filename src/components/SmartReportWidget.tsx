import { useState, useMemo } from "react";
import { getAuthHeadersJson } from "@/lib/edge-helpers";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ReportSummary, ReportTable, exportToExcel, exportToPDF } from "@/components/ReportComponents";

interface ReportResult {
  answer: string;
  total: number | null;
  currency?: string | null;
  table: Record<string, any>[];
}

const reportCategories = [
  {
    label: "📊 الأرباح والخسائر",
    questions: ["اعرض أرباح وخسائر هذا الشهر", "كم إجمالي أرباحي؟", "كم صافي الربح؟"],
  },
  {
    label: "🛒 المشتريات والمبيعات",
    questions: ["كم مشترياتي هذا الشهر؟", "كم مبيعاتي هذا الشهر؟", "كشف بالمقبوضات"],
  },
  {
    label: "📋 كشف الحسابات",
    questions: ["كشف حساب الصندوق", "كشف حساب البنك", "كشف حساب ذمم العملاء", "كشف حساب الموردين"],
  },
  {
    label: "💰 ملخص مالي",
    questions: ["شو وضعي المالي اليوم؟", "كشف بالمصاريف", "ما هي آخر 10 معاملات؟"],
  },
];

interface SmartReportWidgetProps {
  companyName?: string;
}

const SmartReportWidget = ({ companyName = "" }: SmartReportWidgetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);

  const handleAsk = async (q?: string) => {
    const finalQ = (q || question).trim();
    if (!finalQ) return;
    setQuestion(finalQ);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-report`,
        {
          method: "POST",
          headers: {
            ...await getAuthHeadersJson(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question: finalQ, clientId: user?.id }),
        }
      );
      if (!res.ok) throw new Error("فشل في الحصول على التقرير");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (!result?.table || result.table.length === 0) return null;
    const rows = result.table;
    let totalDebit = 0, totalCredit = 0;
    rows.forEach((r) => {
      const amount = Number(r["المبلغ"]) || 0;
      const type = String(r["النوع"] ?? "").toLowerCase();
      if (type.includes("مدين")) totalDebit += amount;
      else if (type.includes("دائن")) totalCredit += amount;
      else totalDebit += amount;
    });
    return { count: rows.length, totalDebit, totalCredit, net: totalDebit - totalCredit };
  }, [result]);

  const handleExportExcel = () => {
    if (!result?.table) return;
    const summaryData: Record<string, any> = {
      "التقرير": question,
      "عدد السجلات": summary?.count || 0,
      "إجمالي المدين": summary?.totalDebit || 0,
      "إجمالي الدائن": summary?.totalCredit || 0,
      "صافي الرصيد": summary?.net || 0,
    };
    if (result.total != null) summaryData["الإجمالي"] = result.total;
    exportToExcel(result.table, summaryData, `تقرير-ذكي-${Date.now()}`);
  };

  const handleExportPDF = () => {
    if (!result?.table) return;
    const summaryData: Record<string, any> = {
      "عدد السجلات": summary?.count || 0,
      "إجمالي المدين": `₪${(summary?.totalDebit || 0).toLocaleString()}`,
      "إجمالي الدائن": `₪${(summary?.totalCredit || 0).toLocaleString()}`,
      "صافي الرصيد": `₪${(summary?.net || 0).toLocaleString()}`,
    };
    exportToPDF(question, companyName, "حسب الطلب", summaryData, result.table);
  };

  return (
    <div className="bg-card rounded-2xl p-6 space-y-4 shadow-card">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-bold text-foreground">التقرير الذكي</span>
        {result?.table && result.table.length > 0 && (
          <div className="mr-auto flex gap-1.5">
            <button onClick={handleExportExcel} className="px-2.5 py-1 rounded-lg bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors">Excel</button>
            <button onClick={handleExportPDF} className="px-2.5 py-1 rounded-lg bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors">PDF</button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 bg-secondary/40 rounded-xl px-3 py-2.5">
        <button
          onClick={() => handleAsk()}
          disabled={loading || !question.trim()}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
        </button>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="اسأل... مثال: كم أرباحي؟"
          className="flex-1 min-w-0 h-9 bg-transparent rounded-xl px-2 text-sm text-foreground placeholder:text-muted-foreground/50 border-0 outline-none"
          dir="rtl"
          disabled={loading}
        />
      </div>

      {/* Quick Questions */}
      {!result && !loading && (
        <div className="space-y-2.5">
          {reportCategories.map((cat) => (
            <div key={cat.label} className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">{cat.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.questions.map((q) => (
                  <button key={q} onClick={() => handleAsk(q)} className="px-3 py-1.5 rounded-xl bg-secondary/60 text-[11px] text-muted-foreground hover:bg-primary/8 hover:text-primary transition-all active:scale-95">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">جاري تحليل بياناتك...</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Answer */}
          <div className="p-4 rounded-xl border border-primary/15 bg-primary/5 space-y-2">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs font-medium text-foreground leading-relaxed whitespace-pre-line">{result.answer}</p>
            </div>
            {result.total != null && (
              <div className="mt-2 pt-2 border-t border-primary/10 text-center">
                <p className="text-xl font-bold text-primary tabular-nums">
                  {result.currency || "₪"}{result.total.toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Summary */}
          {summary && (
            <ReportSummary items={[
              { label: "عدد السجلات", value: summary.count, color: "muted", prefix: "" },
              { label: "إجمالي المدين", value: summary.totalDebit, color: "primary" },
              { label: "إجمالي الدائن", value: summary.totalCredit, color: "destructive" },
              { label: "صافي الرصيد", value: summary.net, color: summary.net >= 0 ? "primary" : "destructive" },
            ]} />
          )}

          {/* Table */}
          {result.table && result.table.length > 0 && (
            <ReportTable data={result.table} typeColumn="النوع" amountColumn="المبلغ" />
          )}

          {/* Ask Again */}
          <Button variant="outline" size="sm" className="w-full" onClick={() => { setResult(null); setQuestion(""); }}>
            سؤال جديد
          </Button>
        </div>
      )}
    </div>
  );
};

export default SmartReportWidget;

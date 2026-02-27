import { useState, useEffect, useMemo } from "react";
import { getAuthHeadersJson } from "@/lib/edge-helpers";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ReportHeader, ReportSummary, ReportTable, exportToExcel, exportToPDF } from "@/components/ReportComponents";

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
    questions: [
      "كشف حساب الصندوق",
      "كشف حساب البنك",
      "كشف حساب ذمم العملاء",
      "كشف حساب الموردين",
      "كشف حساب المصاريف",
      "كشف حساب الإيرادات",
      "كشف حساب المسحوبات الشخصية",
      "كشف حساب الكهرباء",
    ],
  },
  {
    label: "🏦 الذمم والعملاء",
    questions: ["اعرض الذمم المتأخرة", "كشف حساب الزبائن", "كشف حساب الموردين"],
  },
  {
    label: "📦 المخزون",
    questions: ["اعرض المخزون والكميات", "ما هي الأصناف الأقل من الحد الأدنى؟", "اعرض قيمة المخزون", "منتجات منخفضة"],
  },
  {
    label: "💰 ملخص مالي",
    questions: ["شو وضعي المالي اليوم؟", "كشف بالمصاريف", "ما هي آخر 10 معاملات؟"],
  },
];

const SmartReportPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [companyName, setCompanyName] = useState("");

  // Fetch company name
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [user]);

  // Auto-execute from query param
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && user) handleAsk(q);
  }, [searchParams, user]);

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

  // Compute summary from table data
  const summary = useMemo(() => {
    if (!result?.table || result.table.length === 0) return null;
    const rows = result.table;
    let totalDebit = 0, totalCredit = 0;
    rows.forEach((r) => {
      const amount = Number(r["المبلغ"]) || 0;
      const type = String(r["النوع"] ?? "").toLowerCase();
      if (type.includes("مدين")) totalDebit += amount;
      else if (type.includes("دائن")) totalCredit += amount;
      else totalDebit += amount; // default
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
    <div className="px-4 pt-6 pb-8 space-y-4" dir="rtl">
      <ReportHeader
        reportName="التقرير الذكي"
        companyName={companyName}
        onBack={() => { setResult(null); setQuestion(""); }}
        onExportPDF={result?.table && result.table.length > 0 ? handleExportPDF : undefined}
        onExportExcel={result?.table && result.table.length > 0 ? handleExportExcel : undefined}
        icon={<Sparkles className="h-5 w-5 text-primary" />}
      />

      {/* Input */}
      <Card className="border-0 shadow-md bg-gradient-to-l from-primary/5 to-background">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder="اسأل... مثال: كم أرباحي؟"
              className="flex-1 h-10 bg-secondary/60 rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/20"
              dir="rtl"
              disabled={loading}
            />
            <button
              onClick={() => handleAsk()}
              disabled={loading || !question.trim()}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Example Questions */}
      {!result && !loading && (
        <div className="space-y-3">
          {reportCategories.map((cat) => (
            <div key={cat.label} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{cat.label}</p>
              <div className="flex flex-wrap gap-2">
                {cat.questions.map((q) => (
                  <button key={q} onClick={() => handleAsk(q)} className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95">
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
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جاري تحليل بياناتك...</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Answer */}
          <Card className="border-0 shadow-sm bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-line">{result.answer}</p>
              </div>
              {result.total != null && (
                <div className="mt-3 pt-3 border-t border-primary/10 text-center">
                  <p className="text-2xl font-bold text-primary">
                    {result.currency || "₪"}{result.total.toLocaleString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

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

export default SmartReportPage;

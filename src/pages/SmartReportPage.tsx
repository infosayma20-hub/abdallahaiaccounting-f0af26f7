import { useState } from "react";
import { ArrowRight, Loader2, Send, Sparkles, TableIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ReportResult {
  answer: string;
  total: number | null;
  currency?: string | null;
  table: Record<string, any>[];
}

const exampleQuestions = [
  "كم إجمالي أرباحي؟",
  "كم مشترياتي هذا الشهر؟",
  "كم سحبت شخصي؟",
  "أعطني كشف حساب المصروفات",
  "ما هي آخر 10 معاملات؟",
];

const SmartReportPage = () => {
  const navigate = useNavigate();
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
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

  const tableColumns = result?.table && result.table.length > 0 ? Object.keys(result.table[0]) : [];

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">التقرير الذكي</h1>
            <p className="text-xs text-muted-foreground">اسأل عن بياناتك بلغتك</p>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
      </div>

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
              {loading ? (
                <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-primary-foreground" />
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Example Questions */}
      {!result && !loading && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">أمثلة سريعة</p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleAsk(q)}
                className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
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
                <p className="text-sm font-medium text-foreground leading-relaxed">{result.answer}</p>
              </div>
              {result.total !== null && result.total !== undefined && (
                <div className="mt-3 pt-3 border-t border-primary/10 text-center">
                  <p className="text-2xl font-bold text-primary">
                    {result.currency || "₪"}{result.total.toLocaleString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Table */}
          {result.table && result.table.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-3">
                  <TableIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{result.table.length} سجل</p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableColumns.map((col) => (
                          <TableHead key={col} className="text-xs font-semibold whitespace-nowrap text-right">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.table.map((row, i) => (
                        <TableRow key={i}>
                          {tableColumns.map((col) => (
                            <TableCell key={col} className="text-xs whitespace-nowrap">
                              {typeof row[col] === "number" ? row[col].toLocaleString() : row[col] || "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
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

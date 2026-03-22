import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { getAuthHeadersJson, getAuthHeaders } from "@/lib/edge-helpers";
import { Loader2, Send, Sparkles, AtSign, Users, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ReportSummary, ReportTable, exportToExcel, exportToPDF } from "@/components/ReportComponents";
import { supabase } from "@/integrations/supabase/client";
import { multiWordMatchAny } from "@/lib/utils";

interface ReportResult {
  answer: string;
  total: number | null;
  currency?: string | null;
  table: Record<string, any>[];
}

interface MentionOption {
  id: string;
  name: string;
  type: "account" | "contact";
  subtype?: string; // account_code, contact_type
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
    questions: ["كشف حساب الصندوق", "كشف حساب البنك", "كشف حساب ذمم الزبائن", "كشف حساب الموردين"],
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

  // Mention state
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const [mentionLoaded, setMentionLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load accounts + contacts for mention
  useEffect(() => {
    if (!user?.id || mentionLoaded) return;
    const load = async () => {
      try {
        const [accRes, contactRes] = await Promise.all([
          supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true).order("account_code"),
          supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", user.id).eq("is_active", true).neq("is_archived", true),
        ]);
        const accItems: MentionOption[] = (accRes.data || []).map((a: any) => ({
          id: a.account_code,
          name: `${a.account_name} (${a.account_code})`,
          type: "account" as const,
          subtype: a.account_type,
        }));
        const contactItems: MentionOption[] = (contactRes.data || []).map((c: any) => ({
          id: c.id,
          name: c.contact_name,
          type: "contact" as const,
          subtype: c.contact_type,
        }));
        setMentionOptions([...accItems, ...contactItems]);
        setMentionLoaded(true);
      } catch (e) {
        console.error("Failed to load mention options:", e);
      }
    };
    load();
  }, [user?.id, mentionLoaded]);

  const filteredMentions = useMemo(() => {
    if (!mentionSearch) return mentionOptions;
    return mentionOptions.filter(o => multiWordMatchAny(mentionSearch, o.name, o.subtype));
  }, [mentionOptions, mentionSearch]);

  const mentionAccounts = filteredMentions.filter(m => m.type === "account");
  const mentionContacts = filteredMentions.filter(m => m.type === "contact");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuestion(val);

    const cursorPos = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursorPos);
    const lastAt = textBefore.lastIndexOf("@");

    if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
      const afterAt = textBefore.slice(lastAt + 1);
      if (!/\s/.test(afterAt)) {
        setMentionStart(lastAt);
        setMentionSearch(afterAt);
        setShowMentionDropdown(true);
        setSelectedMentionIdx(0);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  const insertMention = useCallback((item: MentionOption) => {
    const prefix = question.includes("كشف حساب") ? "" : "كشف حساب ";
    let insertText = "";
    if (item.type === "contact") {
      insertText = `كشف حساب ${item.name}`;
    } else {
      insertText = `كشف حساب ${item.name}`;
    }

    if (mentionStart >= 0) {
      const before = question.slice(0, mentionStart);
      // Replace from @ to cursor with the account name
      const nameOnly = item.type === "contact" ? item.name : item.name;
      const newQ = before.trim() ? before.replace(/@?\s*$/, '') + " " + insertText : insertText;
      setQuestion(newQ);
    } else {
      setQuestion(insertText);
    }
    setShowMentionDropdown(false);
    setMentionStart(-1);
    inputRef.current?.focus();
  }, [question, mentionStart]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allItems = [...mentionAccounts, ...mentionContacts];
    if (showMentionDropdown && allItems.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedMentionIdx(i => (i + 1) % allItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedMentionIdx(i => (i - 1 + allItems.length) % allItems.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(allItems[selectedMentionIdx]); return; }
      if (e.key === "Escape") { setShowMentionDropdown(false); return; }
    }
    if (e.key === "Enter") { e.preventDefault(); handleAsk(); }
  };

  const toggleMentionDropdown = () => {
    if (showMentionDropdown) { setShowMentionDropdown(false); return; }
    setMentionStart(-1);
    setMentionSearch("");
    setShowMentionDropdown(true);
    setSelectedMentionIdx(0);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowMentionDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
          headers: await getAuthHeadersJson(),
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
      const debit = Number(r["مدين"] || r["المبلغ"] || 0);
      const credit = Number(r["دائن"] || 0);
      const type = String(r["النوع"] ?? "").toLowerCase();
      if (credit > 0) totalCredit += credit;
      else if (debit > 0) totalDebit += debit;
      else if (type.includes("دائن")) totalCredit += Number(r["المبلغ"] || 0);
      else totalDebit += Number(r["المبلغ"] || 0);
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

  let flatIdx = 0;

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

      {/* Input with @ mention */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-secondary/40 rounded-xl px-3 py-2.5">
          <button
            onClick={() => handleAsk()}
            disabled={loading || !question.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
          </button>
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="اسأل... مثال: كم أرباحي؟ أو اكتب @ لكشف حساب"
            className="flex-1 min-w-0 h-9 bg-transparent rounded-xl px-2 text-sm text-foreground placeholder:text-muted-foreground/50 border-0 outline-none"
            dir="rtl"
            disabled={loading}
          />
          <button
            type="button"
            onClick={toggleMentionDropdown}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors active:scale-95"
            title="@ كشف حساب لزبون/مورد/حساب"
          >
            <AtSign className="h-4 w-4" />
          </button>
        </div>

        {/* Mention Dropdown */}
        {showMentionDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full mt-1 right-0 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {mentionAccounts.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/5 sticky top-0 flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3" />
                  الحسابات المحاسبية
                </div>
                {mentionAccounts.map((item) => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => insertMention(item)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent/50 transition-colors ${idx === selectedMentionIdx ? "bg-accent/30" : ""}`}
                    >
                      <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-foreground text-xs">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.subtype}</span>
                    </button>
                  );
                })}
              </>
            )}

            {mentionContacts.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/5 sticky top-0 flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  زبائن وموردين
                </div>
                {mentionContacts.map((item) => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => insertMention(item)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent/50 transition-colors ${idx === selectedMentionIdx ? "bg-accent/30" : ""}`}
                    >
                      <Users className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-foreground text-xs">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.subtype}</span>
                    </button>
                  );
                })}
              </>
            )}

            {mentionAccounts.length === 0 && mentionContacts.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
                لا توجد نتائج... اكتب اسم الحساب أو الجهة
              </div>
            )}
          </div>
        )}
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

          {summary && (
            <ReportSummary items={[
              { label: "عدد السجلات", value: summary.count, color: "muted", prefix: "" },
              { label: "إجمالي المدين", value: summary.totalDebit, color: "primary" },
              { label: "إجمالي الدائن", value: summary.totalCredit, color: "destructive" },
              { label: "صافي الرصيد", value: summary.net, color: summary.net >= 0 ? "primary" : "destructive" },
            ]} />
          )}

          {result.table && result.table.length > 0 && (
            <ReportTable data={result.table} typeColumn="النوع" amountColumn="المبلغ" />
          )}

          <Button variant="outline" size="sm" className="w-full" onClick={() => { setResult(null); setQuestion(""); }}>
            سؤال جديد
          </Button>
        </div>
      )}
    </div>
  );
};

export default SmartReportWidget;

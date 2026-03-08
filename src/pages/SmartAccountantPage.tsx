import { useState, useEffect } from "react";
import { getAuthHeadersJson } from "@/lib/edge-helpers";
import {
  Sparkles, Send, Mic, Loader2, Database, BookOpen, BarChart3, ArrowLeft, AtSign,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import MentionInput, { MentionItem } from "@/components/MentionInput";
import SmartDailySummary from "@/components/SmartDailySummary";
import FinancialRadar from "@/components/FinancialRadar";
import CFODashboard from "@/components/CFODashboard";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import TransactionToast, { useTransactionToast } from "@/components/TransactionToast";
import ChequeDetailsDialog, { ChequeLineItem } from "@/components/ChequeDetailsDialog";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import SavedCommands from "@/components/SavedCommands";
import SmartMemory from "@/components/SmartMemory";
import FinancialPredictions from "@/components/FinancialPredictions";

interface SummaryStats {
  sales: number;
  expenses: number;
  netProfit: number;
  receivables: number;
}

const SmartAccountantPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const txToast = useTransactionToast();
  const { user } = useAuth();

  const [inputValue, setInputValue] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<MentionItem[]>([]);
  const [sending, setSending] = useState(false);
  const [dbCommand, setDbCommand] = useState("");
  const [dbSending, setDbSending] = useState(false);
  const [dbResponseMessage, setDbResponseMessage] = useState<string | null>(null);
  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<any>(null);
  const [showChequeDialog, setShowChequeDialog] = useState(false);
  const [pendingChequeData, setPendingChequeData] = useState<any>(null);
  const [showJournalEntry, setShowJournalEntry] = useState(false);
  const [journalEntryData, setJournalEntryData] = useState<any>(null);
  const [journalEntryAccounts, setJournalEntryAccounts] = useState<any[]>([]);
  const [stats, setStats] = useState<SummaryStats>({ sales: 0, expenses: 0, netProfit: 0, receivables: 0 });
  const [loadingTx, setLoadingTx] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      setLoadingTx(true);
      try {
        // Fetch transactions directly from Supabase (exclude opening balances and deleted)
        const { data: txData, error } = await supabase
          .from('transactions')
          .select('amount, debit_account_code, credit_account_code, description, transaction_type, is_opening_balance, is_deleted')
          .eq('user_id', user.id)
          .eq('is_deleted', false);

        if (error) throw error;

        const txs = txData || [];

        // Filter out opening balances for P&L
        const plTx = txs.filter(tx =>
          !tx.is_opening_balance &&
          !/رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(tx.description || '') &&
          tx.transaction_type !== 'رصيد ابتدائي'
        );

        // Sales: credit account starts with 4 (revenue accounts)
        const sales = plTx
          .filter(tx => tx.credit_account_code?.startsWith('4'))
          .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

        // Expenses: debit account starts with 5 (expense accounts)
        const expenses = plTx
          .filter(tx => tx.debit_account_code?.startsWith('5'))
          .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

        // Receivables: debit to 1130 (ذمم عملاء)
        const receivables = txs
          .filter(tx => tx.debit_account_code === '1130' && !tx.is_deleted)
          .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

        // Payments received against receivables
        const receivablesPayments = txs
          .filter(tx => tx.credit_account_code === '1130' && !tx.is_deleted)
          .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

        setStats({
          sales,
          expenses,
          netProfit: sales - expenses,
          receivables: receivables - receivablesPayments,
        });
      } catch (err) { console.error(err); }
      finally { setLoadingTx(false); }
    };
    fetchStats();
  }, [user]);

  const { sales, expenses, netProfit, receivables } = stats;

  // ─── Smart Assistant Handler ───
  const handleSend = async () => {
    if (!inputValue.trim()) return;
    setSending(true);
    const contactMention = selectedMentions.find(m => m.category === "contact");
    try {
      const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text: inputValue } });
      const parseData = parseRes.data;

      if (parseData?.type === 'invoice') {
        if (parseData.status === 'incomplete') {
          setInvoiceMessage(`تقريباً انتهينا 🙌\nلكن أحتاج المعلومات التالية:\n${(parseData.missingFields || []).join("، ")}`);
          setSending(false);
          return;
        }
        if (parseData.status === 'complete') {
          setPendingInvoice({
            ...parseData.transaction,
            invoiceType: parseData.invoiceType,
            originalText: inputValue,
            mentionedContactName: contactMention?.name || parseData.transaction?.contactName || null,
          });
          setInvoiceMessage(parseData.message || '');
          setInputValue("");
          setSelectedMentions([]);
          setSending(false);
          return;
        }
      }

      if (parseData?.type === 'cheque') {
        setPendingChequeData({
          chequeType: parseData.chequeType || 'وارد',
          partyName: contactMention?.name || parseData.partyName || '',
          partyType: parseData.partyType || 'عميل',
          originalText: inputValue,
          amount: parseData.amount || 0,
          currency: parseData.currency || 'شيكل',
          chequeDate: parseData.chequeDate || '',
          chequeNumber: parseData.chequeNumber || '',
          bankName: parseData.bankName || '',
        });
        setShowChequeDialog(true);
        setInputValue("");
        setSelectedMentions([]);
        setSending(false);
        return;
      }

      const body: any = { text: inputValue, userId: user?.id, email: user?.email };
      if (contactMention) {
        body.mentionedContactName = contactMention.name;
        body.mentionedContactId = contactMention.id;
      }
      const { error } = await supabase.functions.invoke("process-transaction", { body });
      if (error) throw error;
      txToast.trigger();
      setInputValue("");
      setSelectedMentions([]);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const handleDbCommand = async () => {
    if (!dbCommand.trim()) return;
    setDbSending(true);
    setDbResponseMessage(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-command`, {
        method: "POST",
        headers: await getAuthHeadersJson(),
        body: JSON.stringify({ command: dbCommand, clientId: user?.id }),
      });
      const data = await res.json();
      if (data.action === 'add_journal_entry') {
        setJournalEntryData(data.data || null);
        setJournalEntryAccounts(data.accounts || []);
        setShowJournalEntry(true);
        setDbCommand("");
      } else if (data.success) {
        setDbResponseMessage(`✅ تم تنفيذ الأمر بنجاح`);
        setDbCommand("");
      } else {
        setDbResponseMessage(`⚠️ ${data.message || data.error || "لم أفهم"}`);
      }
    } catch (err: any) {
      setDbResponseMessage(`❌ ${err.message}`);
    } finally { setDbSending(false); }
  };

  const handleChequeConfirm = async (lines: ChequeLineItem[], chequeType: string, partyName: string, partyType: string) => {
    if (!user) return;
    setSending(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      for (const line of lines) {
        const chequeStatus = line.chequeDate > today ? 'آجل' : 'مستحق';
        await supabase.from('cheques').insert({
          user_id: user.id, cheque_type: chequeType as any, status: chequeStatus as any,
          cheque_number: line.chequeNumber || null, bank_name: line.bankName || null,
          cheque_date: line.chequeDate, amount: parseFloat(line.amount),
          currency: line.currency, party_name: partyName, party_type: partyType,
        });
        const desc = chequeType === 'وارد'
          ? `استلام شيك من ${partyName} رقم ${line.chequeNumber}`
          : `إصدار شيك ل${partyName} رقم ${line.chequeNumber}`;
        await supabase.functions.invoke("process-transaction", { body: { text: desc, userId: user.id, email: user.email } });
      }
      txToast.trigger();
      setPendingChequeData(null);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-6 max-w-[900px] mx-auto animate-fade-in" dir="rtl">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1 text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            المحاسب الذكي
          </h1>
          <p className="text-sm text-muted-foreground">سجّل عملياتك بلغتك الطبيعية — والذكاء الاصطناعي يتولى الباقي</p>
        </div>
      </div>

      {/* ═══ 0. إحصائيات سريعة ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "المبيعات", value: sales, icon: "📈", color: "text-emerald-500" },
          { label: "المصروفات", value: expenses, icon: "📉", color: "text-red-400" },
          { label: "صافي الربح", value: netProfit, icon: "💰", color: netProfit >= 0 ? "text-emerald-500" : "text-red-400" },
          { label: "الذمم المدينة", value: receivables, icon: "🧾", color: "text-amber-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl p-4 shadow-card space-y-1 text-center">
            <span className="text-lg">{stat.icon}</span>
            <p className={`text-lg font-bold ${stat.color}`}>
              {loadingTx ? "..." : stat.value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ═══ 1. المساعد المالي الذكي ═══ */}
      <div className="bg-card rounded-2xl p-6 space-y-4 shadow-card">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground">المساعد المالي الذكي</span>
        </div>
        <div className="flex items-end gap-2 bg-secondary/40 rounded-xl px-3 py-2.5">
          <button onClick={handleSend} disabled={sending || !inputValue.trim()} className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
          </button>
          <MentionInput
            value={inputValue}
            onChange={setInputValue}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            onMentionSelect={(item) => setSelectedMentions(prev => [...prev, item])}
            placeholder="شو صار معك اليوم مالياً؟ سجل عملياتك بكلامك…"
            className="flex-1 min-w-0 h-9 bg-transparent rounded-xl px-2 text-sm text-foreground placeholder:text-muted-foreground/50 border-0 outline-none"
            userId={user?.id}
          />
          <button onClick={() => navigate("/voice")} className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center hover:bg-primary/15 transition-colors" title="تسجيل صوتي">
            <Mic className="h-4 w-4 text-primary" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["قبضت من أحمد 5,000 شيكل", "دفعت إيجار 2500", "استلمت شيك من أحمد 4000", "بعت طحين 50 كيلو نقداً"].map((chip) => (
            <button key={chip} onClick={() => setInputValue(chip)} className="px-3 py-1.5 rounded-xl bg-secondary/60 text-[11px] text-muted-foreground hover:bg-primary/8 hover:text-primary transition-all">
              {chip}
            </button>
          ))}
        </div>
        {invoiceMessage && (
          <div className="p-4 rounded-xl border border-primary/15 bg-primary/5 space-y-3">
            <p className="text-xs text-foreground whitespace-pre-line">{invoiceMessage}</p>
            {pendingInvoice ? (
              <div className="flex gap-2">
                <button onClick={async () => {
                  setSending(true);
                  try {
                    const body: any = { text: pendingInvoice.originalText, userId: user?.id, email: user?.email };
                    if (pendingInvoice.mentionedContactName) body.mentionedContactName = pendingInvoice.mentionedContactName;
                    const { error } = await supabase.functions.invoke("process-transaction", { body });
                    if (error) throw error;
                    txToast.trigger();
                    setPendingInvoice(null);
                    setInvoiceMessage(null);
                  } catch (err: any) { toast({ title: "خطأ", description: err.message, variant: "destructive" }); }
                  finally { setSending(false); }
                }} disabled={sending} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
                  {sending ? "جاري..." : "✅ أنشئ الفاتورة"}
                </button>
                <button onClick={() => { setPendingInvoice(null); setInvoiceMessage(null); }} className="px-4 py-2 rounded-xl bg-secondary text-xs">إلغاء</button>
              </div>
            ) : (
              <button onClick={() => setInvoiceMessage(null)} className="text-[10px] text-primary font-medium hover:underline">فهمت ✓</button>
            )}
          </div>
        )}
        <SavedCommands onSelect={(text) => setInputValue(text)} currentInput={inputValue} currentTarget="assistant" />
      </div>

      {/* ═══ 2. اطلب وتمنى ═══ */}
      <div className="bg-card rounded-2xl p-6 space-y-4 shadow-card">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">اطلب وتمنى ✨</span>
            <span className="text-[11px] text-muted-foreground mr-2">أضف زبون، مورد، حساب، منتج، أو سند قيد</span>
          </div>
        </div>
        <div className="flex items-end gap-2 bg-secondary/40 rounded-xl px-3 py-2.5">
          <button onClick={handleDbCommand} disabled={dbSending || !dbCommand.trim()} className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-40">
            {dbSending ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
          </button>
          <textarea
            value={dbCommand}
            onChange={(e) => setDbCommand(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleDbCommand(); } }}
            placeholder="أضف زبون أحمد جوال 0501234567"
            className="flex-1 min-w-0 h-9 bg-transparent rounded-xl px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 border-0 outline-none text-right resize-none"
            rows={1}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["أضف زبون أحمد", "أضف مورد شركة الشمال", "أضف منتج سجاد شراء 80 بيع 120", "سند قيد مدين المشتريات دائن الصندوق 5000"].map((chip) => (
            <button key={chip} onClick={() => setDbCommand(chip)} className="px-3 py-1.5 rounded-xl bg-secondary/60 text-[11px] text-muted-foreground hover:bg-primary/8 hover:text-primary transition-all">
              {chip}
            </button>
          ))}
          <button onClick={() => setShowJournalEntry(true)} className="px-3 py-1.5 rounded-xl bg-primary/10 text-[11px] font-bold text-primary hover:bg-primary/15 transition-all flex items-center gap-1">
            <BookOpen className="h-3 w-3" /> سند قيد جديد
          </button>
        </div>
        {dbResponseMessage && (
          <div className="p-4 rounded-xl border border-primary/15 bg-primary/5 space-y-2">
            <p className="text-xs text-foreground whitespace-pre-line">{dbResponseMessage}</p>
            <button onClick={() => setDbResponseMessage(null)} className="text-[10px] text-primary font-medium hover:underline">فهمت ✓</button>
          </div>
        )}
        <SavedCommands onSelect={(text) => setDbCommand(text)} currentInput={dbCommand} currentTarget="command" />
      </div>

      {/* ═══ 3. ذاكرة المحاسب الذكي ═══ */}
      <SmartMemory />

      {/* ═══ 4. التنبؤات المالية ═══ */}
      <FinancialPredictions />

      {/* ═══ 5. الرادار المالي ═══ */}
      <FinancialRadar />

      {/* ═══ 4. وضع المدير المالي ═══ */}
      <CFODashboard />

      {/* ═══ 5. التقرير الذكي ═══ */}
      <button
        onClick={() => navigate("/smart-report")}
        className="w-full bg-card rounded-2xl p-5 shadow-card hover:bg-primary/5 transition-all active:scale-[0.99] group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">التقرير الذكي</p>
              <p className="text-[11px] text-muted-foreground">اسأل عن أرباحك، مبيعاتك، ذممك... بلغتك</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className="bg-primary/10 text-primary border-0 text-[9px] px-2 py-0.5">AI</Badge>
            <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </button>

      {/* ═══ 6. ملخص ذكي ═══ */}
      <SmartDailySummary
        netProfit={netProfit}
        chequesToday={0}
        lowStockCount={0}
        followUpCount={receivables > 0 ? 1 : 0}
        loading={loadingTx}
      />

      {/* Dialogs */}
      <TransactionToast show={txToast.show} onDone={txToast.handleDone} />
      <JournalEntryPopup
        open={showJournalEntry}
        onClose={() => { setShowJournalEntry(false); setJournalEntryData(null); }}
        onSuccess={() => txToast.trigger()}
        initialData={journalEntryData}
        accounts={journalEntryAccounts.length > 0 ? journalEntryAccounts : undefined}
      />
      <ChequeDetailsDialog
        open={showChequeDialog}
        onOpenChange={setShowChequeDialog}
        chequeType={pendingChequeData?.chequeType || 'وارد'}
        partyName={pendingChequeData?.partyName || ''}
        partyType={pendingChequeData?.partyType || 'عميل'}
        originalText={pendingChequeData?.originalText || ''}
        initialData={pendingChequeData ? {
          amount: pendingChequeData.amount,
          currency: pendingChequeData.currency,
          chequeDate: pendingChequeData.chequeDate,
          chequeNumber: pendingChequeData.chequeNumber,
          bankName: pendingChequeData.bankName,
        } : undefined}
        onConfirm={handleChequeConfirm}
      />
    </div>
  );
};

export default SmartAccountantPage;

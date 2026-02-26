import { useState, useEffect } from "react";
import {
  Plus, FileText, Receipt, Users, Package, Wallet, Landmark,
  TrendingUp, TrendingDown, Droplets, ArrowUpRight, Loader2,
  Sparkles, Send, Mic, AlertTriangle, Clock, ChevronLeft,
  BookOpen, Database, AtSign,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/useCountUp";
import MiniSparkline from "@/components/MiniSparkline";
import SmartAlertCard from "@/components/SmartAlertCard";
import MentionInput, { MentionItem } from "@/components/MentionInput";
import TransactionToast, { useTransactionToast } from "@/components/TransactionToast";
import ChequeDetailsDialog, { ChequeLineItem } from "@/components/ChequeDetailsDialog";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import SavedCommands from "@/components/SavedCommands";
import SetupWizard from "@/components/SetupWizard";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";

interface TransactionRecord {
  id: string;
  fields: {
    Amount?: number;
    Currency?: string;
    "Transaction Type"?: string;
    "Credit Account Rollup"?: string;
    "Debit Account Rollup"?: string;
    Description?: string;
    Date?: string;
    Client?: string;
  };
}

// ─── KPI Widget ───
interface KPIWidgetProps {
  title: string;
  value: number;
  prefix?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  status: "green" | "yellow" | "red";
  linkTo?: string;
  loading: boolean;
}

const statusMap = {
  green: { text: "text-success", bg: "bg-success/8", tag: "bg-success/10 text-success" },
  yellow: { text: "text-warning", bg: "bg-warning/8", tag: "bg-warning/10 text-warning" },
  red: { text: "text-destructive", bg: "bg-destructive/8", tag: "bg-destructive/10 text-destructive" },
};

const KPIWidget = ({ title, value, prefix = "₪", icon: Icon, trend, trendLabel, status, linkTo, loading }: KPIWidgetProps) => {
  const navigate = useNavigate();
  const animValue = useCountUp(value, 1000, !loading);
  const colors = statusMap[status];

  return (
    <div
      className="bg-card rounded-2xl p-5 hover:shadow-medium transition-all cursor-pointer group shadow-card"
      onClick={() => linkTo && navigate(linkTo)}
    >
      {/* Title row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
        </div>
        {linkTo && (
          <ChevronLeft className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Value */}
      <p className="text-3xl font-bold tabular-nums text-foreground leading-none mb-3">
        <span className="text-lg font-medium text-muted-foreground ml-1">{prefix}</span>
        {animValue.toLocaleString()}
      </p>

      {/* Trend tag */}
      {trendLabel && (
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium ${colors.tag}`}>
            {trend === "up" && <TrendingUp className="h-3 w-3" />}
            {trend === "down" && <TrendingDown className="h-3 w-3" />}
            {trendLabel}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Create Actions ───
const createActions = [
  { label: "إنشاء فاتورة", icon: FileText, path: "/invoices" },
  { label: "تسجيل مصروف", icon: Wallet, path: "/transactions" },
  { label: "إضافة إيداع", icon: Landmark, path: "/transactions" },
  { label: "إنشاء شيك", icon: Receipt, path: "/cheques" },
  { label: "إضافة عميل", icon: Users, path: "/contacts" },
  { label: "إضافة منتج", icon: Package, path: "/inventory" },
];

const HomeDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const txToast = useTransactionToast();
  const { user } = useAuth();

  // State
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [financialAlert, setFinancialAlert] = useState<any>(null);
  const [allAlerts, setAllAlerts] = useState<any[]>([]);

  // Smart assistant state
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

  // ─── Data Loading ───
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, company_name, setup_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setProfileData(data);
        if (!data.setup_completed) setShowSetupWizard(true);
      }
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoadingTx(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const result = await res.json();
        setTransactions(result.records || []);
      } catch (err) { console.error(err); }
      finally { setLoadingTx(false); }
    };
    fetchTx();
  }, [user]);

  // ─── Computed Values ───
  const revenue = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const expenses = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Expenses").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalIncome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند قبض").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalOutcome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند صرف").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const capitalInjections = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Owner's Equity").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const cashBalance = totalIncome - totalOutcome + capitalInjections;
  const netProfit = revenue - expenses;
  const receivables = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const payables = transactions.filter((tx) => tx.fields["Credit Account Rollup"] === "Liability").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);

  // Alerts
  useEffect(() => {
    if (!user || loadingTx) return;
    const fetchAlerts = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("financial-alerts", {
          body: { clientId: user.id, transactions, revenue, expenses, totalIncome, totalOutcome, cashBalance, receivables, payables },
        });
        if (!error && data) {
          setFinancialAlert(data.alert);
          setAllAlerts(data.allAlerts || []);
        }
      } catch (err) { console.error(err); }
    };
    fetchAlerts();
  }, [user, loadingTx, transactions]);

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
      const { error } = await supabase.functions.invoke("send-transaction", { body });
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
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
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
          ? `استلام شيك من ${partyName} رقم ${line.chequeNumber} بتاريخ ${line.chequeDate}`
          : `إصدار شيك ل${partyName} رقم ${line.chequeNumber} بتاريخ ${line.chequeDate}`;
        await supabase.functions.invoke("send-transaction", { body: { text: desc, userId: user.id, email: user.email } });
      }
      txToast.trigger();
      setPendingChequeData(null);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const displayName = profileData?.company_name || profileData?.display_name || user?.user_metadata?.company_name || user?.user_metadata?.full_name || "عبدالله";
  const noActivity = revenue === 0 && expenses === 0;

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto animate-fade-in" dir="rtl">
      {user && <CompleteProfileDialog open={showProfileDialog} onClose={() => setShowProfileDialog(false)} user={user} />}

      {/* ═══ WELCOME + CREATE ACTIONS ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مرحباً {displayName.split(' ')[0]} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">إليك نظرة عامة على وضعك المالي</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {createActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary/60 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <action.icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ LOADING ═══ */}
      {loadingTx && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loadingTx && (
        <>
          {/* ═══ KPI WIDGETS ═══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <KPIWidget
              title="صافي الربح"
              value={netProfit}
              icon={TrendingUp}
              status={noActivity ? "yellow" : netProfit >= 0 ? "green" : "red"}
              trendLabel={noActivity ? "لا توجد عمليات بعد" : netProfit >= 0 ? "أداء إيجابي" : "خسارة"}
              trend={noActivity ? "neutral" : netProfit >= 0 ? "up" : "down"}
              linkTo="/profit-loss"
              loading={loadingTx}
            />
            <KPIWidget
              title="السيولة النقدية"
              value={cashBalance}
              icon={Droplets}
              status={cashBalance > 0 ? "green" : cashBalance === 0 ? "yellow" : "red"}
              trendLabel={cashBalance > 0 ? "تدفق مستقر" : "لا توجد حركات"}
              trend={cashBalance > 0 ? "up" : "neutral"}
              linkTo="/transactions"
              loading={loadingTx}
            />
            <KPIWidget
              title="المدينون (لك)"
              value={receivables}
              icon={Users}
              status={receivables === 0 ? "green" : receivables > cashBalance ? "red" : "yellow"}
              trendLabel={receivables > 0 ? "بحاجة متابعة" : "لا ذمم"}
              trend={receivables > 0 ? "down" : "neutral"}
              linkTo="/contacts?type=customer"
              loading={loadingTx}
            />
            <KPIWidget
              title="الدائنون (عليك)"
              value={payables}
              icon={Landmark}
              status={payables === 0 ? "green" : payables > cashBalance ? "red" : "yellow"}
              trendLabel={payables > 0 ? "مستحقات قائمة" : "لا التزامات"}
              trend={payables > 0 ? "down" : "neutral"}
              linkTo="/contacts?type=supplier"
              loading={loadingTx}
            />
          </div>

          {/* ═══ MAIN CONTENT GRID ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: Smart Assistant + Commands (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Smart Financial Alert */}
              <SmartAlertCard alert={financialAlert} allAlerts={allAlerts} userId={user?.id} />

              {/* Smart Assistant */}
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
                  <button onClick={() => navigate("/voice")} className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center hover:bg-primary/15 transition-colors">
                    <Mic className="h-4 w-4 text-primary" />
                  </button>
                </div>
                {/* Chips */}
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
                        <button onClick={() => { /* confirm logic */ }} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">✅ أنشئ الفاتورة</button>
                        <button onClick={() => { setPendingInvoice(null); setInvoiceMessage(null); }} className="px-4 py-2 rounded-xl bg-secondary text-xs">إلغاء</button>
                      </div>
                    ) : (
                      <button onClick={() => setInvoiceMessage(null)} className="text-[10px] text-primary font-medium hover:underline">فهمت ✓</button>
                    )}
                  </div>
                )}
              </div>

              {/* اطلب وتمنى */}
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
              </div>
            </div>

            {/* RIGHT: Tasks & Insights Panel */}
            <div className="space-y-6">
              {/* Setup Checklist */}
              {showSetupWizard && user && (
                <div className="bg-card rounded-2xl p-5 shadow-card">
                  <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    خطوات البدء
                  </h3>
                  <SetupWizard userId={user.id} onComplete={() => setShowSetupWizard(false)} />
                </div>
              )}

              {/* Quick Links */}
              <div className="bg-card rounded-2xl p-5 space-y-3 shadow-card">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">اختصارات سريعة</h3>
                <div className="space-y-1">
                  {[
                    { label: "الأرباح والخسائر", path: "/profit-loss", icon: TrendingUp },
                    { label: "التقارير المالية", path: "/reports", icon: FileText },
                    { label: "التقرير الذكي", path: "/smart-report", icon: Sparkles },
                    { label: "الشيكات", path: "/cheques", icon: Receipt },
                    { label: "المخزون", path: "/inventory", icon: Package },
                  ].map((link) => (
                    <button
                      key={link.path}
                      onClick={() => navigate(link.path)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] text-foreground hover:bg-secondary/60 transition-colors text-right"
                    >
                      <link.icon className="h-4 w-4 text-muted-foreground/60" strokeWidth={1.8} />
                      <span className="flex-1">{link.label}</span>
                      <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/30" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Alerts Summary */}
              {allAlerts.length > 0 && (
                <div className="bg-card rounded-2xl p-5 space-y-3 shadow-card">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    تنبيهات
                  </h3>
                  <div className="space-y-2">
                    {allAlerts.slice(0, 3).map((alert, i) => (
                      <div key={i} className="text-xs text-muted-foreground p-3 rounded-xl bg-secondary/40">
                        {alert.message || alert.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      <ChequeDetailsDialog
        open={showChequeDialog}
        onOpenChange={(open) => { if (!open) { setShowChequeDialog(false); setPendingChequeData(null); } }}
        onConfirm={handleChequeConfirm}
        chequeType={pendingChequeData?.chequeType || 'وارد'}
        partyName={pendingChequeData?.partyName || ''}
        partyType={pendingChequeData?.partyType || 'عميل'}
        originalText={pendingChequeData?.originalText || ''}
        initialData={{
          amount: pendingChequeData?.amount,
          currency: pendingChequeData?.currency,
          chequeDate: pendingChequeData?.chequeDate,
          chequeNumber: pendingChequeData?.chequeNumber,
          bankName: pendingChequeData?.bankName,
        }}
      />
      {showJournalEntry && (
        <JournalEntryPopup
          open={showJournalEntry}
          onClose={() => setShowJournalEntry(false)}
          onSuccess={() => setShowJournalEntry(false)}
          initialData={journalEntryData}
          accounts={journalEntryAccounts}
        />
      )}
      <TransactionToast {...txToast} />
    </div>
  );
};

export default HomeDashboard;

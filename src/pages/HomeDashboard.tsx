import { useState, useEffect, useCallback } from "react";
import {
  FileText, Receipt, Users, Package, Wallet, Landmark,
  TrendingUp, Loader2,
  Sparkles, Send, Mic, AlertTriangle, Clock, ChevronLeft,
  BookOpen, Database, ClipboardList, EyeOff, Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

import SmartAlertCard from "@/components/SmartAlertCard";
import CustomizableKPICards from "@/components/CustomizableKPICards";
import SmartDailySummary from "@/components/SmartDailySummary";
import MentionInput, { MentionItem } from "@/components/MentionInput";
import TransactionToast, { useTransactionToast } from "@/components/TransactionToast";
import ChequeDetailsDialog, { ChequeLineItem } from "@/components/ChequeDetailsDialog";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import SavedCommands from "@/components/SavedCommands";
import SetupWizard from "@/components/SetupWizard";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";
import HelpGuideModal from "@/components/HelpGuideModal";

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

// ─── Create Actions ───
const createActions = [
  { label: "إنشاء فاتورة", icon: FileText, path: "/invoices" },
  { label: "سند صرف", icon: Wallet, path: "/transactions" },
  { label: "سند قبض", icon: Landmark, path: "/transactions" },
  { label: "إنشاء شيك", icon: Receipt, path: "/cheques" },
  { label: "إضافة عميل", icon: Users, path: "/contacts" },
  { label: "إضافة منتج", icon: Package, path: "/inventory" },
  { label: "سند قيد", icon: ClipboardList, action: "journal" },
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
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(() => {
    try { return localStorage.getItem("dashboard_privacy") === "true"; } catch { return false; }
  });
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

  // Show help guide for first-time users who already completed setup but haven't seen the guide
  useEffect(() => {
    if (!user || showSetupWizard || !profileData?.setup_completed) return;
    if (!localStorage.getItem("help_guide_shown")) {
      setTimeout(() => setShowHelpGuide(true), 1000);
      localStorage.setItem("help_guide_shown", "true");
    }
  }, [user, showSetupWizard, profileData?.setup_completed]);
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

  // ─── Computed Values (Proper P&L Formula) ───
  // Helper: check description/type for keywords
  const txMatch = (tx: TransactionRecord, keywords: string[]) => {
    const desc = (tx.fields.Description || "").toLowerCase();
    const type = (tx.fields["Transaction Type"] || "").toLowerCase();
    const debitName = (tx.fields["Debit Account Name"] || "").toLowerCase();
    const creditName = (tx.fields["Credit Account Name"] || "").toLowerCase();
    const all = `${desc} ${type} ${debitName} ${creditName}`;
    return keywords.some(k => all.includes(k));
  };

  // Filter out opening balances for P&L
  const plTx = transactions.filter(tx => {
    const type = (tx.fields["Transaction Type"] || "").trim();
    const desc = (tx.fields.Description || "").trim();
    return !/رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) &&
      !/رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) && type !== "رصيد ابتدائي";
  });

  // (+) المبيعات (Sales)
  const sales = plTx.filter(tx => tx.fields["Credit Account Rollup"] === "Revenue" && !txMatch(tx, ["مردود", "خصم"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) خصم مسموح به (Sales Discounts)
  const salesDiscounts = plTx.filter(tx => txMatch(tx, ["خصم مسموح", "خصم مبيعات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) مردود مبيعات (Sales Returns)
  const salesReturns = plTx.filter(tx => txMatch(tx, ["مردود مبيعات", "مرتجع مبيعات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) مشتريات (Purchases / COGS)
  const purchases = plTx.filter(tx => txMatch(tx, ["مشتريات", "شراء", "بضاعة"]) && tx.fields["Debit Account Rollup"] === "Expenses" || (tx.fields["Transaction Type"] || "").includes("فاتورة مشتريات"))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (+) خصم مكتسب (Purchase Discounts Earned)
  const purchaseDiscounts = plTx.filter(tx => txMatch(tx, ["خصم مكتسب", "خصم مشتريات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (+) مردود مشتريات (Purchase Returns)
  const purchaseReturns = plTx.filter(tx => txMatch(tx, ["مردود مشتريات", "مرتجع مشتريات"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);
  // (-) مصاريف (All Expenses excluding COGS/purchases already counted)
  const generalExpenses = plTx.filter(tx => tx.fields["Debit Account Rollup"] === "Expenses" && !txMatch(tx, ["مشتريات", "شراء", "بضاعة", "مردود", "خصم"]))
    .reduce((s, tx) => s + (tx.fields.Amount || 0), 0);

  // Net Profit = Sales - Sales Discounts - Sales Returns - Purchases + Purchase Discounts + Purchase Returns - General Expenses
  const netProfit = sales - salesDiscounts - salesReturns - purchases + purchaseDiscounts + purchaseReturns - generalExpenses;
  const revenue = sales - salesDiscounts - salesReturns;
  const expenses = purchases - purchaseDiscounts - purchaseReturns + generalExpenses;
  const totalIncome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند قبض").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalOutcome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند صرف").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const capitalInjections = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Owner's Equity").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const cashBalance = totalIncome - totalOutcome + capitalInjections;
  // Receivables: debit to receivable accounts minus credits (collections)
  const receivablesDebit = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const receivablesCredit = transactions.filter((tx) => tx.fields["Credit Account Rollup"] === "Asset" && tx.fields["Debit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const receivables = receivablesDebit - receivablesCredit;
  // Payables: credits to liability (purchases on credit) minus debits to liability (payments to suppliers)
  const payablesCredit = transactions.filter((tx) => tx.fields["Credit Account Rollup"] === "Liability").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const payablesDebit = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Liability").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const payables = payablesCredit - payablesDebit;

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

      {/* ═══ WELCOME HEADER ═══ */}
      <div className="text-center space-y-5">
        <div className="flex items-center justify-between">
          <div /> {/* spacer */}
          <h1 className="text-3xl font-bold text-foreground flex-1">
            مرحباً {displayName.split(' ')[0]}! 👋
          </h1>
          <button
            onClick={() => {
              const next = !privacyMode;
              setPrivacyMode(next);
              localStorage.setItem("dashboard_privacy", String(next));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-secondary transition-colors text-muted-foreground group"
            title={privacyMode ? "إظهار البيانات المالية" : "إخفاء البيانات المالية"}
          >
            {privacyMode ? <EyeOff className="h-4 w-4" strokeWidth={1.8} /> : <Eye className="h-4 w-4" strokeWidth={1.8} />}
            <span className="text-[11px] font-medium hidden sm:inline">
              {privacyMode ? "إظهار" : "خصوصية"}
            </span>
          </button>
        </div>

        {/* Create Actions Strip */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground ml-2">إنشاء</span>
          {createActions.map((action) => (
            <button
              key={action.label}
              onClick={() => 'action' in action ? setShowJournalEntry(true) : navigate((action as any).path)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/60 text-[13px] font-medium text-foreground hover:bg-secondary hover:shadow-soft transition-all"
            >
              <action.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
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
        <div className="relative">
          {/* Privacy overlay */}
          {privacyMode && (
            <div className="absolute inset-0 z-10 backdrop-blur-lg bg-background/40 rounded-2xl flex items-center justify-center">
              <div className="text-center space-y-3 p-6">
                <EyeOff className="h-8 w-8 text-muted-foreground mx-auto" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground font-medium">البيانات المالية مخفية</p>
                <button
                  onClick={() => { setPrivacyMode(false); localStorage.setItem("dashboard_privacy", "false"); }}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
                >
                  إظهار البيانات
                </button>
              </div>
            </div>
          )}
          <div className={privacyMode ? "select-none pointer-events-none space-y-8" : "space-y-8"}>
          {/* ═══ KPI WIDGETS ═══ */}
          <CustomizableKPICards
            revenue={revenue}
            expenses={expenses}
            totalIncome={totalIncome}
            totalOutcome={totalOutcome}
            receivables={receivables}
            payables={payables}
            cashBalance={cashBalance}
            netProfit={netProfit}
            loading={loadingTx}
          />

          {/* ═══ SMART DAILY SUMMARY (WOW Card) ═══ */}
          <SmartDailySummary
            netProfit={netProfit}
            chequesToday={0}
            lowStockCount={0}
            followUpCount={receivables > 0 ? 1 : 0}
            loading={loadingTx}
          />

          {/* ═══ MAIN CONTENT GRID ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: Smart Assistant + Commands (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Smart Assistant */}

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
                  <button
                    onClick={() => {
                      const current = inputValue;
                      const needsSpace = current.length > 0 && !current.endsWith(' ');
                      setInputValue(current + (needsSpace ? ' @' : '@'));
                    }}
                    className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center hover:bg-primary/15 transition-colors"
                    title="إشارة لزبون أو منتج @"
                  >
                    <span className="text-primary font-bold text-base">@</span>
                  </button>
                  <button onClick={() => navigate("/voice")} className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center hover:bg-primary/15 transition-colors" title="تسجيل صوتي">
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
                    {pendingInvoice ? (
                      <>
                        <p className="text-xs font-bold text-foreground">تأكيد العملية:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { key: "invoiceType", label: "النوع", options: ["مبيعات", "مشتريات"] },
                          ].map(({ key, label, options }) => (
                            <div key={key} className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">{label}</label>
                              <select
                                value={pendingInvoice[key] || ""}
                                onChange={(e) => setPendingInvoice((prev: any) => ({ ...prev, [key]: e.target.value }))}
                                className="w-full h-8 rounded-lg bg-secondary/60 border-0 text-xs text-foreground px-2 focus:ring-2 focus:ring-primary/20"
                              >
                                {options.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          ))}
                          {[
                            { key: "mentionedContactName", label: "الجهة" },
                            { key: "productName", label: "المنتج" },
                            { key: "quantity", label: "الكمية", type: "number" },
                            { key: "unitPrice", label: "السعر", type: "number" },
                            { key: "amount", label: "الإجمالي", type: "number" },
                          ].map(({ key, label, type }) => (
                            <div key={key} className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">{label}</label>
                              <input
                                type={type || "text"}
                                value={pendingInvoice[key] || ""}
                                onChange={(e) => setPendingInvoice((prev: any) => ({ ...prev, [key]: type === "number" ? Number(e.target.value) || 0 : e.target.value }))}
                                className="w-full h-8 rounded-lg bg-secondary/60 border-0 text-xs text-foreground px-2 focus:ring-2 focus:ring-primary/20 text-right"
                              />
                            </div>
                          ))}
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">طريقة الدفع</label>
                            <select
                              value={pendingInvoice.paymentMethod || "نقد"}
                              onChange={(e) => setPendingInvoice((prev: any) => ({ ...prev, paymentMethod: e.target.value }))}
                              className="w-full h-8 rounded-lg bg-secondary/60 border-0 text-xs text-foreground px-2 focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="نقد">نقد</option>
                              <option value="آجل">آجل</option>
                              <option value="تحويل">تحويل بنكي</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={async () => {
                            if (!pendingInvoice || !user) return;
                            setSending(true);
                            try {
                              const inv = pendingInvoice;
                              const desc = inv.invoiceType === 'مبيعات'
                                ? `بعت ${inv.productName || ''} ${inv.quantity || 1} بسعر ${inv.unitPrice || inv.amount} ${inv.paymentMethod === 'آجل' ? 'آجل' : inv.paymentMethod === 'تحويل' ? 'تحويل' : 'نقداً'} ${inv.mentionedContactName ? 'ل' + inv.mentionedContactName : ''}`
                                : `اشتريت ${inv.productName || ''} ${inv.quantity || 1} بسعر ${inv.unitPrice || inv.amount} ${inv.paymentMethod === 'آجل' ? 'آجل' : inv.paymentMethod === 'تحويل' ? 'تحويل' : 'نقداً'} ${inv.mentionedContactName ? 'من ' + inv.mentionedContactName : ''}`;
                              const body: any = { text: desc, userId: user.id, email: user.email };
                              if (inv.mentionedContactName) body.mentionedContactName = inv.mentionedContactName;
                              const { error } = await supabase.functions.invoke("send-transaction", { body });
                              if (error) throw error;
                              txToast.trigger();
                              setPendingInvoice(null);
                              setInvoiceMessage(null);
                            } catch (err: any) {
                              toast({ title: "خطأ", description: err.message, variant: "destructive" });
                            } finally { setSending(false); }
                          }} disabled={sending} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
                            {sending ? "جاري الإنشاء..." : "✅ أنشئ الفاتورة"}</button>
                          <button onClick={() => { setPendingInvoice(null); setInvoiceMessage(null); }} className="px-4 py-2 rounded-xl bg-secondary text-xs">إلغاء</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-foreground whitespace-pre-line">{invoiceMessage}</p>
                        <button onClick={() => setInvoiceMessage(null)} className="text-[10px] text-primary font-medium hover:underline">فهمت ✓</button>
                      </>
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

              {/* Smart Financial Alert (below assistants) */}
              <SmartAlertCard alert={financialAlert} allAlerts={allAlerts} userId={user?.id} />
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
                  <SetupWizard userId={user.id} onComplete={() => {
                    setShowSetupWizard(false);
                    // Show help guide as part of first-time experience
                    if (!localStorage.getItem("help_guide_shown")) {
                      setTimeout(() => setShowHelpGuide(true), 500);
                      localStorage.setItem("help_guide_shown", "true");
                    }
                  }} />
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
          </div>
        </div>
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
      <HelpGuideModal
        open={showHelpGuide}
        onClose={() => setShowHelpGuide(false)}
        onFillInput={(text) => setInputValue(text)}
      />
    </div>
  );
};

export default HomeDashboard;

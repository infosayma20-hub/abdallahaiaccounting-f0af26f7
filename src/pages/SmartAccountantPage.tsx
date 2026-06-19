import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import TransactionToast, { useTransactionToast } from "@/components/TransactionToast";
import ChequeDetailsDialog, { ChequeLineItem } from "@/components/ChequeDetailsDialog";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import SmartAccountantOnboarding from "@/components/haseeb/SmartAccountantOnboarding";
import SmartAccountantHelpPanel from "@/components/haseeb/SmartAccountantHelpPanel";

export interface FinixFinancialData {
  cash: number;
  bank: number;
  salesToday: number;
  receivables: number;
  payables: number;
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  inventoryValue: number;
  pendingCheques: number;
  transactionCount: number;
  healthScore: number;
}

const SmartAccountantPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const txToast = useTransactionToast();
  const { user } = useAuth();

  const [cfoMode, setCfoMode] = useState(false);
  const [financialData, setFinancialData] = useState<FinixFinancialData>({
    cash: 0, bank: 0, salesToday: 0, receivables: 0, payables: 0,
    totalSales: 0, totalExpenses: 0, netProfit: 0, inventoryValue: 0,
    pendingCheques: 0, transactionCount: 0, healthScore: 72,
  });
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("المستخدم");

  // Dialogs
  const [showJournalEntry, setShowJournalEntry] = useState(false);
  const [journalEntryData, setJournalEntryData] = useState<any>(null);
  const [journalEntryAccounts, setJournalEntryAccounts] = useState<any[]>([]);
  const [showChequeDialog, setShowChequeDialog] = useState(false);
  const [pendingChequeData, setPendingChequeData] = useState<any>(null);

  // Onboarding & Help
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  // Profile + Onboarding check
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("display_name, company_name, smart_accountant_onboarded").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileName(data.display_name || data.company_name || "المستخدم");
          if (!(data as any).smart_accountant_onboarded) {
            setShowOnboarding(true);
          }
        }
        setOnboardingChecked(true);
      });
  }, [user?.id]);

  // Fetch financial data
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [txRes, chequeRes, prodRes] = await Promise.all([
          supabase.from('transactions')
            .select('amount, debit_account_code, credit_account_code, description, transaction_type, is_opening_balance, is_deleted, transaction_date')
            .eq('user_id', user.id).eq('is_deleted', false),
          supabase.from('cheques')
            .select('amount, status').eq('user_id', user.id),
          supabase.from('products')
            .select('quantity, buy_price').eq('user_id', user.id),
        ]);

        const txs = txRes.data || [];
        const today = new Date().toISOString().split('T')[0];
        const plTx = txs.filter(tx =>
          !tx.is_opening_balance &&
          !/رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(tx.description || '') &&
          tx.transaction_type !== 'رصيد ابتدائي'
        );

        const sumByCode = (txs: any[], field: 'debit_account_code' | 'credit_account_code', prefix: string) =>
          txs.filter(tx => tx[field]?.startsWith(prefix)).reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

        const totalSales = sumByCode(plTx, 'credit_account_code', '4');
        const totalExpenses = sumByCode(plTx, 'debit_account_code', '5');
        const cashDebit = sumByCode(txs, 'debit_account_code', '111');
        const cashCredit = sumByCode(txs, 'credit_account_code', '111');
        const bankDebit = sumByCode(txs, 'debit_account_code', '1120');
        const bankCredit = sumByCode(txs, 'credit_account_code', '1120');
        const recDebit = sumByCode(txs, 'debit_account_code', '1130');
        const recCredit = sumByCode(txs, 'credit_account_code', '1130');
        const payDebit = sumByCode(txs, 'debit_account_code', '2110');
        const payCredit = sumByCode(txs, 'credit_account_code', '2110');

        const salesToday = plTx
          .filter(tx => tx.credit_account_code?.startsWith('4') && tx.transaction_date === today)
          .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

        const pendingCheques = (chequeRes.data || [])
          .filter((c: any) => ['آجل', 'مستحق'].includes(c.status))
          .reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

        const inventoryValue = (prodRes.data || [])
          .reduce((s: number, p: any) => s + ((Number(p.quantity) || 0) * (Number(p.buy_price) || 0)), 0);

        const netProfit = totalSales - totalExpenses;
        const cash = cashDebit - cashCredit;
        const bank = bankDebit - bankCredit;
        const receivables = recDebit - recCredit;
        const payables = payCredit - payDebit;

        let score = 50;
        if (netProfit > 0) score += 15;
        if (cash + bank > 0) score += 10;
        if (receivables < totalSales * 0.3) score += 10;
        if (payables < totalExpenses * 0.3) score += 10;
        if (totalSales > 0) score += 5;
        score = Math.min(100, Math.max(0, score));

        setFinancialData({
          cash, bank, salesToday, receivables, payables,
          totalSales, totalExpenses, netProfit, inventoryValue,
          pendingCheques, transactionCount: txs.length, healthScore: score,
        });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Cheque handler
  const handleChequeConfirm = async (lines: ChequeLineItem[], chequeType: string, partyName: string, partyType: string) => {
    if (!user) return;
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
      }
      txToast.trigger();
      setPendingChequeData(null);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  // Onboarding handlers
  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    if (!user?.id) return;
    await supabase.from("profiles").update({
      smart_accountant_onboarded: true,
      smart_accountant_onboarded_at: new Date().toISOString(),
    } as any).eq("user_id", user.id);
  };

  const handleHelpPanelFill = (text: string) => {
    // This will be used later to fill the input dock
    setShowHelpPanel(false);
  };

  // Single-column clean layout for both mobile and desktop
  return (
    <div className="finix-clean-screen relative" dir="rtl">
      {/* Onboarding Overlay */}
      {showOnboarding && (
        <SmartAccountantOnboarding
          userName={profileName}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
        />
      )}

      {!showOnboarding && (
        <Suspense fallback={
          <div className="h-screen bg-[#F8FAFC] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-t-transparent border-[#0A2342] rounded-full animate-spin" />
          </div>
        }>
          <CleanSmartAccountant
            user={user}
            userName={profileName}
            data={financialData}
            cfoMode={cfoMode}
            onToggleCfo={() => setCfoMode(!cfoMode)}
            onCheque={(d: any) => { setPendingChequeData(d); setShowChequeDialog(true); }}
            onJournal={(d: any, a?: any[]) => { setJournalEntryData(d); setJournalEntryAccounts(a || []); setShowJournalEntry(true); }}
            onTransactionSuccess={() => txToast.trigger()}
            onBack={() => window.history.length > 2 ? navigate(-1) : navigate('/apps')}
            onShowHelp={() => setShowHelpPanel(true)}
            onReplayOnboarding={() => setShowOnboarding(true)}
          />
        </Suspense>
      )}

      {/* Help Panel */}
      <SmartAccountantHelpPanel
        open={showHelpPanel}
        onClose={() => setShowHelpPanel(false)}
        onFillInput={handleHelpPanelFill}
      />

      <TransactionToast show={txToast.show} onDone={txToast.handleDone} />
      <JournalEntryPopup open={showJournalEntry} onClose={() => { setShowJournalEntry(false); setJournalEntryData(null); }} onSuccess={() => txToast.trigger()} initialData={journalEntryData} accounts={journalEntryAccounts.length > 0 ? journalEntryAccounts : undefined} />
      <ChequeDetailsDialog open={showChequeDialog} onOpenChange={setShowChequeDialog} chequeType={pendingChequeData?.chequeType || 'وارد'} partyName={pendingChequeData?.partyName || ''} partyType={pendingChequeData?.partyType || 'عميل'} originalText={pendingChequeData?.originalText || ''} initialData={pendingChequeData} onConfirm={handleChequeConfirm} />
    </div>
  );
};

// Lazy-loaded clean layout component
const CleanSmartAccountant = lazy(() => import("@/components/haseeb/CleanSmartAccountant"));

export default SmartAccountantPage;

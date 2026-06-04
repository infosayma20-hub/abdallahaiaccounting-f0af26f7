import { useState, useEffect, useMemo } from "react";
import { getAuthHeaders, getAuthHeadersJson } from "@/lib/edge-helpers";
import { Wallet, Mic, Send, Loader2, Bell, Sparkles, Database, FileText, Package, TrendingUp, TrendingDown, ArrowLeft, ChevronDown, Users, UserPlus, Plus, Paperclip, BarChart3, Clock, AlertTriangle, Sun, Moon, HelpCircle, AtSign, BookOpen } from "lucide-react";
import SmartAlertCard from "@/components/SmartAlertCard";
import { Badge } from "@/components/ui/badge";

import MentionInput, { MentionItem } from "@/components/MentionInput";
import { useNavigate } from "react-router-dom";
import { smartNavigate } from "@/lib/smartNavigate";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCountUp } from "@/hooks/useCountUp";
import { useRotatingPlaceholder } from "@/hooks/useRotatingPlaceholder";
import PasskeyOnboarding from "@/components/PasskeyOnboarding";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";
// OnboardingFlow removed — handled by AppsLauncher
import { resolveUserAccessContext } from "@/lib/accessContext";
import ExecutiveKPICards from "@/components/ExecutiveKPICards";
import SavedCommands from "@/components/SavedCommands";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useTheme } from "@/hooks/useTheme";
import TransactionToast, { useTransactionToast } from "@/components/TransactionToast";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import ChequeDetailsDialog, { ChequeLineItem } from "@/components/ChequeDetailsDialog";

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

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const txToast = useTransactionToast();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [themePulse, setThemePulse] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<MentionItem[]>([]);
  const [sending, setSending] = useState(false);
  const [dbCommand, setDbCommand] = useState("");
  const [dbSending, setDbSending] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showPasskeyOnboarding, setShowPasskeyOnboarding] = useState(false);
  // showOnboarding removed — handled by AppsLauncher
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [profileData, setProfileData] = useState<{ display_name?: string; company_name?: string; setup_completed?: boolean } | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<any>(null);
  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null);
  const [dbResponseMessage, setDbResponseMessage] = useState<string | null>(null);
  const [financialAlert, setFinancialAlert] = useState<any>(null);
  const [allAlerts, setAllAlerts] = useState<any[]>([]);
  const [showJournalEntry, setShowJournalEntry] = useState(false);
  const [journalEntryData, setJournalEntryData] = useState<any>(null);
  const [journalEntryAccounts, setJournalEntryAccounts] = useState<any[]>([]);
  const [showChequeDialog, setShowChequeDialog] = useState(false);
  const [pendingChequeData, setPendingChequeData] = useState<any>(null);
  const rotatingPlaceholder = useRotatingPlaceholder();

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const [{ data: profileData }, ctx] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, company_name, setup_completed")
          .eq("user_id", user.id)
          .maybeSingle(),
        resolveUserAccessContext(user.id, { force: true }),
      ]);

      if (profileData) setProfileData(profileData);

      // Setup is now exclusively reachable via the /setup route guarded by
      // RequireSetupAccess. The Dashboard never auto-opens the wizard — this
      // prevents any sub-account from accidentally seeing it on /apps.
      if (ctx.isCompanyOwner && !ctx.companySetupComplete) {
        navigate("/setup", { replace: true });
      }
    };
    loadProfile();
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("passkey_onboarding_done");
    if (!done && browserSupportsWebAuthn()) setShowPasskeyOnboarding(true);
  }, [user]);

  // Legacy onboarding removed — handled by AppsLauncher

  useEffect(() => {
    if (!user) return;
    const profileCompleted = localStorage.getItem(`profile_completed_${user.id}`);
    const alreadySynced = localStorage.getItem(`airtable_synced_${user.id}`);
    if (profileCompleted || alreadySynced) return;
    const meta = user.user_metadata;
    if (meta?.phone || meta?.company_name) {
      localStorage.setItem(`profile_completed_${user.id}`, "true");
      localStorage.setItem(`airtable_synced_${user.id}`, "true");
      return;
    }
    const isOAuth = user.app_metadata?.provider !== "email";
    if (isOAuth) setShowProfileDialog(true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoadingTx(true);
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, transaction_date, description, transaction_type, debit_account_code, credit_account_code, amount, currency, is_deleted")
          .eq("user_id", user.id)
          .order("transaction_date", { ascending: false })
          .limit(2000);
        if (error) throw error;
        
        // Fetch accounts to map types
        const { data: accts } = await supabase
          .from("accounts")
          .select("account_code, account_type")
          .eq("user_id", user.id);
        
        const typeMap: Record<string, string> = {};
        (accts || []).forEach((a: any) => { typeMap[a.account_code] = a.account_type; });
        
        const normalizeType = (t: string) => {
          const tl = t?.toLowerCase().trim() || "";
          if (["asset", "أصول", "أصل"].includes(tl)) return "Asset";
          if (["liability", "التزامات", "التزام", "خصوم"].includes(tl)) return "Liability";
          if (["equity", "owner's equity", "حقوق ملكية", "حقوق الملكية", "رأس مال"].includes(tl)) return "Equity";
          if (["revenue", "إيرادات", "إيراد", "دخل"].includes(tl)) return "Revenue";
          if (["expenses", "expense", "مصروفات", "مصروف", "المصروفات"].includes(tl)) return "Expenses";
          return t;
        };
        
        // Convert to legacy TransactionRecord format for compatibility
        const records: TransactionRecord[] = (data || []).filter((tx: any) => !tx.is_deleted).map((tx: any) => ({
          id: tx.id,
          fields: {
            Amount: tx.amount,
            Currency: tx.currency,
            "Transaction Type": tx.transaction_type,
            "Debit Account Rollup": normalizeType(typeMap[tx.debit_account_code] || ""),
            "Credit Account Rollup": normalizeType(typeMap[tx.credit_account_code] || ""),
            Description: tx.description,
            Date: tx.transaction_date,
          },
        }));
        setTransactions(records);
      } catch (err) { console.error("Error fetching transactions:", err); }
      finally { setLoadingTx(false); }
    };
    fetchTx();
  }, [user]);

  const revenue = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const expenses = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Expenses").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalIncome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند قبض" || tx.fields["Transaction Type"] === "receipt").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const totalOutcome = transactions.filter((tx) => tx.fields["Transaction Type"] === "سند صرف" || tx.fields["Transaction Type"] === "payment").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const capitalInjections = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Equity").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const cashBalance = totalIncome - totalOutcome + capitalInjections;
  const netProfit = revenue - expenses;
  const receivables = transactions.filter((tx) => tx.fields["Debit Account Rollup"] === "Asset" && tx.fields["Credit Account Rollup"] === "Revenue").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);
  const payables = transactions.filter((tx) => tx.fields["Credit Account Rollup"] === "Liability").reduce((sum, tx) => sum + (tx.fields.Amount || 0), 0);


  const aiInsight = useMemo(() => {
    if (transactions.length === 0) return { text: "ابدأ بإضافة أول عملية لنقدّم لك تحليلات ذكية.", score: 0, efficiency: 0 };
    const collectionRate = totalIncome > 0 && receivables > 0 ? Math.round((totalIncome / (totalIncome + receivables)) * 100) : 0;
    let text = "";
    if (expenses > revenue && revenue > 0) {
      const pct = Math.round(((expenses - revenue) / revenue) * 100);
      text = `⚠️ مصاريفك تتجاوز إيراداتك بنسبة ${pct}% — حاول تقليل النفقات`;
    } else if (revenue > expenses && expenses > 0) {
      const margin = Math.round(((revenue - expenses) / revenue) * 100);
      text = `📊 نسبة تحصيل الذمم هذا الشهر ${collectionRate}%.\n⚠️ يوجد ذمم مدينة بحاجة متابعة.\n💡 تحسين التحصيل سيرفع التدفق النقدي بنسبة ${margin}%.`;
    } else if (expenses > 0 && revenue === 0) {
      text = "💡 لديك مصروفات فقط — سجّل إيراداتك لتحليل أفضل";
    } else {
      text = "تحصيلاتك جيدة — تابع التسجيل للحصول على رؤى أعمق 👌";
    }
    return { text, score: Math.min(collectionRate + 20, 100), efficiency: collectionRate };
  }, [transactions, expenses, revenue, totalIncome, receivables]);

  // Fetch financial alerts
  useEffect(() => {
    if (!user || loadingTx) return;
    const fetchAlerts = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("financial-alerts", {
          body: {
            clientId: user.id,
            transactions,
            revenue, expenses, totalIncome, totalOutcome,
            cashBalance, receivables, payables,
          },
        });
        if (!error && data) {
          setFinancialAlert(data.alert);
          setAllAlerts(data.allAlerts || []);
        }
      } catch (err) {
        console.error("Failed to fetch financial alerts:", err);
      }
    };
    fetchAlerts();
  }, [user, loadingTx, transactions]);


  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const lines = inputValue.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setSending(true);
    const contactMention = selectedMentions.find(m => m.category === "contact");

    try {
      // For single-line inputs, try smart parsing first
      if (lines.length === 1) {
        try {
          const parseRes = await supabase.functions.invoke("parse-voice-transaction", { body: { text: lines[0] } });
          const parseData = parseRes.data;

          if (parseData?.type === 'invoice') {
            if (parseData.status === 'incomplete') {
              // Missing fields - show message
              const missing = (parseData.missingFields || []).join("، ");
              setInvoiceMessage(`تقريباً انتهينا 🙌\nلكن أحتاج المعلومات التالية:\n${missing}`);
              setSending(false);
              return;
            }
            if (parseData.status === 'complete') {
              // Save mention data with pending invoice before clearing
              const savedContactMention = contactMention;
              const savedProductMention = selectedMentions.find(m => m.category === "product");
              setPendingInvoice({ 
                ...parseData.transaction, 
                invoiceType: parseData.invoiceType, 
                originalText: lines[0],
                mentionedContactName: savedContactMention?.name || parseData.transaction?.contactName || null,
                mentionedContactId: savedContactMention?.id || null,
                mentionedProductName: savedProductMention?.name || parseData.transaction?.productName || null,
                mentionedProductId: savedProductMention?.id || null,
              });
              setInvoiceMessage(parseData.message || '');
              setInputValue("");
              setSelectedMentions([]);
              setSending(false);
              return;
            }
          }

          // Handle cheque intent - open details dialog
          if (parseData?.type === 'cheque') {
            const contactMentionSaved = contactMention;
            setPendingChequeData({
              chequeType: parseData.chequeType || 'وارد',
              partyName: contactMentionSaved?.name || parseData.partyName || '',
              partyType: parseData.partyType || 'عميل',
              originalText: lines[0],
              mentionedContactName: contactMentionSaved?.name || parseData.partyName || null,
              mentionedContactId: contactMentionSaved?.id || null,
              // Pre-fill from AI parse
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
        } catch (parseErr) {
          console.log("Parse skipped, falling back to direct send:", parseErr);
        }
      }

      // Default: send directly to webhook
      let successCount = 0;
      let failCount = 0;
      for (const line of lines) {
        try {
          const body: any = { text: line, userId: user?.id, email: user?.email, companyName: user?.user_metadata?.company_name };
          if (contactMention) {
            body.mentionedContactName = contactMention.name;
            body.mentionedContactId = contactMention.id;
          }
          const { error } = await supabase.functions.invoke("send-transaction", { body });
          if (error) throw error;
          successCount++;
        } catch { failCount++; }
      }
      if (failCount === 0) {
        txToast.trigger();
      } else {
        toast({ title: `تم إرسال ${successCount} من ${lines.length} عمليات`, description: `فشل ${failCount} عمليات`, variant: "destructive" });
      }
      setInputValue("");
      setSelectedMentions([]);
    } catch (err: any) {
      toast({ title: "خطأ في الإرسال", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const handleConfirmInvoice = async () => {
    if (!pendingInvoice) return;
    setSending(true);
    try {
      const body: any = {
        text: pendingInvoice.originalText,
        userId: user?.id,
        email: user?.email,
        companyName: user?.user_metadata?.company_name,
      };
      // Pass saved mention data
      if (pendingInvoice.mentionedContactName) {
        body.mentionedContactName = pendingInvoice.mentionedContactName;
      }
      if (pendingInvoice.mentionedContactId) {
        body.mentionedContactId = pendingInvoice.mentionedContactId;
      }
      // Pass product info for inventory tracking
      if (pendingInvoice.productName) {
        body.productName = pendingInvoice.productName;
      }
      if (pendingInvoice.quantity) {
        body.productQuantity = pendingInvoice.quantity;
      }
      if (pendingInvoice.invoiceType) {
        body.invoiceType = pendingInvoice.invoiceType;
      }
      
      const { error } = await supabase.functions.invoke("send-transaction", { body });
      if (error) throw error;

      // Auto-create stock movement if product is in local inventory
      if (pendingInvoice.productName && pendingInvoice.quantity && user?.id) {
        try {
          const { data: products } = await supabase
            .from("products")
            .select("id, name, quantity")
            .eq("user_id", user.id);
          
          if (products) {
            const matchedProduct = products.find(p => 
              p.name === pendingInvoice.productName || 
              p.name.includes(pendingInvoice.productName) || 
              pendingInvoice.productName.includes(p.name)
            );
            
            if (matchedProduct) {
              const isPurchase = pendingInvoice.invoiceType === 'purchase';
              const movementType = isPurchase ? 'وارد' : 'صادر';
              const qty = Number(pendingInvoice.quantity);
              
              // Create stock movement
              await supabase.from("stock_movements").insert({
                product_id: matchedProduct.id,
                user_id: user.id,
                quantity: qty,
                movement_type: movementType,
                reference_note: pendingInvoice.originalText?.substring(0, 100) || '',
              });
              
              // Update product quantity
              const newQty = isPurchase 
                ? (matchedProduct.quantity || 0) + qty 
                : Math.max(0, (matchedProduct.quantity || 0) - qty);
              await supabase
                .from("products")
                .update({ quantity: newQty })
                .eq("id", matchedProduct.id);
              
              console.log(`Stock updated: ${matchedProduct.name} → ${movementType} ${qty}, new qty: ${newQty}`);
            }
          }
        } catch (stockErr) {
          console.error("Stock movement creation failed:", stockErr);
        }
      }

      txToast.trigger();
      setPendingInvoice(null);
      setInvoiceMessage(null);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const handleCancelInvoice = () => {
    setPendingInvoice(null);
    setInvoiceMessage(null);
  };

  const handleChequeConfirm = async (lines: ChequeLineItem[], chequeType: string, partyName: string, partyType: string) => {
    if (!user) return;
    setSending(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      for (const line of lines) {
        const chequeStatus = line.chequeDate > today ? 'آجل' : 'مستحق';

        // 1. Save to cheques table
        const { error: chequeErr } = await supabase.from('cheques').insert({
          user_id: user.id,
          cheque_type: chequeType as any,
          status: chequeStatus as any,
          cheque_number: line.chequeNumber || null,
          bank_name: line.bankName || null,
          cheque_date: line.chequeDate,
          amount: parseFloat(line.amount),
          currency: line.currency,
          party_name: partyName,
          party_type: partyType,
        });

        if (chequeErr) {
          console.error('Cheque insert error:', chequeErr);
          toast({ title: "خطأ في حفظ الشيك", variant: "destructive" });
          continue;
        }

        // 2. Send accounting entry to Airtable via webhook
        const description = chequeType === 'وارد'
          ? `استلام شيك من ${partyName} رقم ${line.chequeNumber} بتاريخ ${line.chequeDate}`
          : `إصدار شيك ل${partyName} رقم ${line.chequeNumber} بتاريخ ${line.chequeDate}`;

        const body: any = {
          text: description,
          userId: user.id,
          email: user.email,
          companyName: user.user_metadata?.company_name,
        };

        if (pendingChequeData?.mentionedContactName) {
          body.mentionedContactName = pendingChequeData.mentionedContactName;
        }
        if (pendingChequeData?.mentionedContactId) {
          body.mentionedContactId = pendingChequeData.mentionedContactId;
        }

        const { error: txErr } = await supabase.functions.invoke("send-transaction", { body });
        if (txErr) console.error('Transaction send error:', txErr);
      }

      txToast.trigger();
      setPendingChequeData(null);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDbCommand = async () => {
    if (!dbCommand.trim()) return;
    const lines = dbCommand.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setDbSending(true);
    setDbResponseMessage(null);
    let successCount = 0;
    let errorMessages: string[] = [];
    try {
      for (const line of lines) {
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-command`, {
            method: "POST",
            headers: await getAuthHeadersJson(),
            body: JSON.stringify({ command: line, clientId: user?.id }),
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            errorMessages.push(`❌ ${data.error || "فشل"}`);
          } else if (data.action === 'need_info') {
            const missing = (data.missing_fields || []).join("، ");
            setDbResponseMessage(`تقريباً انتهينا 🙌\nلكن أحتاج المعلومات التالية:\n${missing}`);
          } else if (data.action === 'delete_blocked') {
            setDbResponseMessage(`⚠️ ${data.message || "لا يمكن الحذف — السجل مرتبط بحركات مالية"}`);
          } else if (data.action === 'add_journal_entry') {
            setJournalEntryData(data.data || null);
            setJournalEntryAccounts(data.accounts || []);
            setShowJournalEntry(true);
            setDbCommand("");
          } else if (data.success) {
            successCount++;
          } else {
            errorMessages.push(`⚠️ ${data.message || "لم أفهم"}`);
          }
        } catch (err: any) {
          errorMessages.push(`❌ ${err.message}`);
        }
      }
      if (successCount > 0) {
        setDbResponseMessage(`✅ تم تنفيذ ${successCount} ${successCount === 1 ? "أمر" : "أوامر"} بنجاح`);
        setDbCommand("");
      }
      if (errorMessages.length > 0) {
        setDbResponseMessage(errorMessages.join("\n"));
      }
    } finally { setDbSending(false); }
  };

  const displayName = profileData?.company_name || profileData?.display_name || user?.user_metadata?.company_name || user?.user_metadata?.full_name || "عبدالله";
  const hasTransactions = !loadingTx && transactions.length > 0;


  const quickActions = [
    { icon: Users, label: "إضافة زبون", desc: "اسم + جوال + حد ائتماني", path: "/contacts" },
    { icon: UserPlus, label: "إضافة مورد", desc: "بيانات المورد", path: "/contacts" },
    { icon: Package, label: "إضافة منتج", desc: "سعر شراء – بيع – كمية", path: "/inventory" },
    { icon: Database, label: "إضافة حساب", desc: "حسابات منظمة تلقائياً", path: "/accounts" },
  ];

  return (
    <div className="px-4 pt-3 pb-28 space-y-5" dir="rtl">
      {user && <CompleteProfileDialog open={showProfileDialog} onClose={() => setShowProfileDialog(false)} user={user} />}

      {/* ═══ 1. HEADER ═══ */}
      <div className="flex items-center justify-between h-[56px]">
        <div className="flex items-center gap-3">
          <button onClick={(e) => smartNavigate(e, "/profile", navigate)} className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{displayName.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}</span>
          </button>
          <div>
            <div className="flex items-center gap-1">
              <h1 className="text-base font-bold text-foreground">أهلاً {displayName.split(' ')[0]} 👋</h1>
            </div>
            <p className="text-[10px] text-muted-foreground">وضعك المالي اليوم جاهز للتحليل</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 relative z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setShowHelpGuide(true); }}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors cursor-pointer"
            type="button"
          >
            <HelpCircle className="h-[18px] w-[18px] text-primary pointer-events-none" />
          </button>
          <button
            onClick={() => {
              toggleTheme();
              setThemePulse(true);
              setTimeout(() => setThemePulse(false), 500);
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-all active:scale-90"
          >
            {theme === "dark" ? (
              <Moon className="h-[18px] w-[18px] text-muted-foreground" />
            ) : (
              <Sun className="h-[18px] w-[18px] text-warning" />
            )}
          </button>
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors">
            <Bell className="h-[18px] w-[18px] text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Loading */}
      {loadingTx && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loadingTx && (
        <>
          {/* ═══ 2. EXECUTIVE KPI CARDS ═══ */}
          <ExecutiveKPICards
            revenue={revenue}
            expenses={expenses}
            totalIncome={totalIncome}
            totalOutcome={totalOutcome}
            receivables={receivables}
            payables={payables}
            cashBalance={cashBalance}
            netProfit={netProfit}
            transactionCount={transactions.length}
            loading={loadingTx}
          />

          {/* ═══ 2.5 SMART FINANCIAL ALERTS ═══ */}
          <SmartAlertCard alert={financialAlert} allAlerts={allAlerts} userId={user?.id} />

          {/* ═══ 3. SMART ASSISTANT BOX ═══ */}
          <div className={`premium-card p-4 space-y-3 glow-border ${themePulse ? "animate-theme-pulse" : ""}`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">المساعد المالي الذكي</span>
            </div>

            {/* Input */}
            <div id="smart-input-bar" className="flex items-end gap-2 min-h-[52px] bg-secondary/60 rounded-2xl px-2.5 py-2" dir="rtl">
              <button onClick={handleSend} disabled={sending || !inputValue.trim()} className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-40">
                {sending ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
              </button>
              <MentionInput
                value={inputValue}
                onChange={setInputValue}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                onMentionSelect={(item) => setSelectedMentions(prev => [...prev, item])}
                placeholder='شو صار معك اليوم مالياً؟ سجل عملياتك بكلامك…'
                className="flex-1 min-w-0 h-10 bg-transparent rounded-xl px-2 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none"
                userId={user?.id}
              />
              <button onClick={() => navigate("/voice")} className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95">
                <Mic className="h-5 w-5 text-primary" />
              </button>
            </div>

            {/* Financial command suggestion chips */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                { text: "قبضت من @أحمد 5,000 شيكل" },
                { text: "دفعت ل@محمد 1,200 دينار" },
                { text: "بعت @طحين 50 كيلو ل@شركة النور سعر الكيلو 10 نقداً" },
                { text: "اشتريت @حديد 100 كيلو من @مورد الشمال سعر الكيلو 5 على الحساب" },
                { text: "دفعت إيجار 2500 شيكل" },
                { text: "استلمت شيك من @أحمد 4000" },
              ].map((chip) => (
                <button
                  key={chip.text}
                  onClick={() => setInputValue(chip.text.replace(/@/g, ''))}
                  className="px-2.5 py-1.5 rounded-full bg-secondary text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 neon-border"
                >
                  {chip.text.split(/(@\S+)/g).map((part, i) =>
                    part.startsWith('@') ? <span key={i} className="text-primary font-bold">{part}</span> : part
                  )}
                </button>
              ))}
            </div>

            {/* Invoice confirmation / missing fields message */}
            {invoiceMessage && (
              <div className="p-3.5 rounded-2xl border-2 border-primary/20 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">{invoiceMessage}</p>
                {pendingInvoice && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmInvoice}
                      disabled={sending}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "✅ نعم، أنشئ الفاتورة"}
                    </button>
                    <button
                      onClick={handleCancelInvoice}
                      className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-xs font-medium hover:bg-destructive/10 transition-all active:scale-95"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
                {!pendingInvoice && (
                  <button
                    onClick={() => setInvoiceMessage(null)}
                    className="text-[10px] text-primary font-medium hover:underline"
                  >
                    فهمت ✓
                  </button>
                )}
              </div>
            )}

            {/* Saved custom commands for assistant */}
            <SavedCommands
              onSelect={(text, target) => {
                if (target === "assistant") setInputValue(text);
                else setDbCommand(text);
              }}
              currentInput={inputValue}
              currentTarget="assistant"
            />
          </div>

          {/* ═══ QUICK ACTIONS – اطلب وتمنى ═══ */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">اطلب وتمنى ✨</h2>

            {/* AI Command Box */}
            <div className="premium-card p-4 space-y-3 neon-border">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">أضف زبون، مورد، حساب، منتج، أو سند قيد...</span>
              </div>
              <div className="flex items-end gap-2 min-h-[52px] bg-secondary/60 rounded-2xl px-2.5 py-2" dir="rtl">
                <button onClick={handleDbCommand} disabled={dbSending || !dbCommand.trim()} className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-40">
                  {dbSending ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" /> : <Send className="h-4 w-4 text-primary-foreground" />}
                </button>
                <textarea
                  value={dbCommand}
                  onChange={(e) => setDbCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleDbCommand();
                    }
                  }}
                  placeholder='أضف زبون أحمد جوال 0501234567'
                  className="flex-1 min-w-0 h-10 bg-transparent rounded-xl px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none text-right resize-none overflow-hidden"
                  dir="rtl"
                  rows={1}
                />
                <button
                  onClick={() => setDbCommand(dbCommand + "@")}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95"
                  title="إشارة @"
                >
                  <AtSign className="h-4 w-4 text-primary" />
                </button>
                <button onClick={() => navigate("/voice")} className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors active:scale-95">
                  <Mic className="h-5 w-5 text-primary" />
                </button>
              </div>
              {/* Definition command suggestion chips */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  "أضف زبون أحمد جوال 0501234567",
                  "أضف مورد شركة الشمال",
                  "أضف منتج سجاد شراء 80 بيع 120",
                  "أضف حساب مصروف تسويق",
                  "سند قيد مدين المشتريات دائن الصندوق 5000",
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setDbCommand(chip)}
                    className="px-2.5 py-1.5 rounded-full bg-secondary text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 neon-border"
                  >
                    {chip}
                  </button>
                ))}
                {/* Direct journal entry button */}
                <button
                  onClick={() => setShowJournalEntry(true)}
                  className="px-2.5 py-1.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary hover:bg-primary/20 transition-all active:scale-95 neon-border flex items-center gap-1"
                >
                  <BookOpen className="h-3 w-3" />
                  سند قيد جديد
                </button>
              </div>
              {/* Response bubble - same style as financial assistant */}
              {dbResponseMessage && (
                <div className="p-3.5 rounded-2xl border-2 border-primary/20 bg-primary/5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">{dbResponseMessage}</p>
                  <button
                    onClick={() => setDbResponseMessage(null)}
                    className="text-[10px] text-primary font-medium hover:underline"
                  >
                    فهمت ✓
                  </button>
                </div>
              )}
              {/* Saved custom commands */}
              <SavedCommands
                onSelect={(text, target) => {
                  if (target === "assistant") setInputValue(text);
                  else setDbCommand(text);
                }}
                currentInput={dbCommand}
                currentTarget="command"
              />
            </div>

            {/* ═══ Smart Report Quick Access ═══ */}
            <button
              onClick={(e) => smartNavigate(e, "/smart-report", navigate)}
              className="w-full premium-card p-4 neon-border hover:bg-primary/5 transition-all active:scale-[0.99] group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">التقرير الذكي</p>
                    <p className="text-[10px] text-muted-foreground">اسأل عن أرباحك، مبيعاتك، ذممك... بلغتك</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-primary/10 text-primary border-0 text-[9px] px-2 py-0.5">AI</Badge>
                  <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={(e) => smartNavigate(e, action.path, navigate)}
                  className="premium-card p-4 text-right space-y-1.5 neon-border hover:bg-secondary/50 transition-all active:scale-[0.98]"
                >
                  <action.icon className="h-5 w-5 text-primary mb-1" />
                  <p className="text-xs font-semibold text-foreground">{action.label}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded-[18px] p-[1.5px]" style={{ background: "linear-gradient(135deg, hsl(152,72%,40%), hsl(168,76%,42%))" }}>
            <div className="bg-card rounded-[17px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse-glow" />
                  <span className="text-sm font-bold text-foreground">تحليل المركز المالي</span>
                </div>
                <span className="text-[10px] text-muted-foreground">AI</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{aiInsight.text}</p>
              
              {hasTransactions && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">انضباط الدفع</span>
                    <span className="text-primary font-bold">{aiInsight.score}/100</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${aiInsight.score}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">كفاءة التحصيل</span>
                    <span className="text-accent font-bold">{aiInsight.efficiency}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-1000" style={{ width: `${aiInsight.efficiency}%` }} />
                  </div>
                </div>
              )}

              <button
                onClick={(e) => smartNavigate(e, "/smart-report?q=" + encodeURIComponent("اقترح خطة تحصيل للذمم المتأخرة"), navigate)}
                className="w-full py-2.5 rounded-xl neon-border bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-all active:scale-[0.98]"
              >
                ✨ اقترح خطة تحصيل
              </button>
            </div>
          </div>


          {/* ═══ 6. LAST TRANSACTIONS ═══ */}
          {hasTransactions && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">آخر النشاط</h2>
                <button onClick={() => navigate("/transactions")} className="text-[10px] font-medium text-primary hover:underline">عرض الكل</button>
              </div>
              <div className="space-y-1.5">
                {transactions.slice(0, 3).map((tx) => {
                  const isIncome = tx.fields["Transaction Type"] === "سند قبض";
                  const isExpense = tx.fields["Transaction Type"] === "سند صرف";
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-3 px-3 premium-card">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isIncome ? "bg-primary/15" : isExpense ? "bg-destructive/15" : "bg-secondary"}`}>
                          <span className="text-xs">{isIncome ? "💰" : isExpense ? "💸" : "📄"}</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground line-clamp-1">{tx.fields.Description || tx.fields["Transaction Type"] || "عملية"}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.fields.Date || ""}</p>
                        </div>
                      </div>
                      <p className={`text-xs font-bold tabular-nums ${isIncome ? "text-primary glow-green" : isExpense ? "text-destructive" : "text-foreground"}`}>
                        {isIncome ? "+" : isExpense ? "-" : ""}₪{(tx.fields.Amount || 0).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ 7. AI CTA ═══ */}
          <button
            onClick={() => navigate("/smart-report")}
            className="w-full flex items-center gap-4 p-5 rounded-[20px] glow-border neon-border bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98]"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary animate-pulse-glow" />
            </div>
            <div className="text-right flex-1">
              <p className="text-base font-bold text-foreground">اسأل AI عن وضعك المالي</p>
              <p className="text-xs text-muted-foreground mt-1">تقارير وتحليلات فورية بلغتك</p>
            </div>
          </button>
        </>
      )}

      {/* ── Dialogs & Wizards ── */}
      {showSetupWizard && user && !showPasskeyOnboarding && (
        <SetupWizard userId={user.id} onComplete={() => { setShowSetupWizard(false); setProfileData(prev => prev ? { ...prev, setup_completed: true } : prev); }} />
      )}
      {showPasskeyOnboarding && <PasskeyOnboarding onComplete={() => setShowPasskeyOnboarding(false)} />}
      {/* Legacy OnboardingFlow removed — handled by AppsLauncher */}
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

export default Dashboard;

import { useState, useEffect } from "react";
import { X, Send, Loader2, BookOpen, ArrowLeftRight, Calendar, FileText, DollarSign, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Account {
  id: string;
  name: string;
  type: string;
}

interface JournalEntryData {
  debitAccount: string;
  debitAccountId: string | null;
  creditAccount: string;
  creditAccountId: string | null;
  amount: number;
  description: string;
  date: string;
}

interface JournalEntryPopupProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: JournalEntryData | null;
  accounts?: Account[];
}

const JournalEntryPopup = ({ open, onClose, onSuccess, initialData, accounts: propAccounts }: JournalEntryPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>(propAccounts || []);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [debitAccount, setDebitAccount] = useState(initialData?.debitAccount || "");
  const [debitAccountId, setDebitAccountId] = useState(initialData?.debitAccountId || "");
  const [creditAccount, setCreditAccount] = useState(initialData?.creditAccount || "");
  const [creditAccountId, setCreditAccountId] = useState(initialData?.creditAccountId || "");
  const [amount, setAmount] = useState(initialData?.amount?.toString() || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split("T")[0]);

  const [debitSearch, setDebitSearch] = useState("");
  const [creditSearch, setCreditSearch] = useState("");
  const [showDebitDropdown, setShowDebitDropdown] = useState(false);
  const [showCreditDropdown, setShowCreditDropdown] = useState(false);

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setDebitAccount(initialData.debitAccount || "");
      setDebitAccountId(initialData.debitAccountId || "");
      setCreditAccount(initialData.creditAccount || "");
      setCreditAccountId(initialData.creditAccountId || "");
      setAmount(initialData.amount?.toString() || "");
      setDescription(initialData.description || "");
      setDate(initialData.date || new Date().toISOString().split("T")[0]);
    }
  }, [initialData]);

  useEffect(() => {
    if (propAccounts?.length) {
      setAccounts(propAccounts);
      return;
    }
    if (!open || !user) return;
    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setAccounts(
            (data.records || []).map((r: any) => ({
              id: r.id,
              name: r.fields?.["Account Name"] || "",
              type: r.fields?.["Account Type"] || "",
            }))
          );
        }
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      }
      setLoadingAccounts(false);
    };
    fetchAccounts();
  }, [open, user, propAccounts]);

  const filteredDebitAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes((debitSearch || debitAccount).toLowerCase())
  );
  const filteredCreditAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes((creditSearch || creditAccount).toLowerCase())
  );

  const selectDebit = (acc: Account) => {
    setDebitAccount(acc.name);
    setDebitAccountId(acc.id);
    setDebitSearch("");
    setShowDebitDropdown(false);
  };

  const selectCredit = (acc: Account) => {
    setCreditAccount(acc.name);
    setCreditAccountId(acc.id);
    setCreditSearch("");
    setShowCreditDropdown(false);
  };

  const handleSubmit = async () => {
    if (!debitAccount || !creditAccount || !amount || Number(amount) <= 0) {
      toast({ title: "بيانات ناقصة", description: "تأكد من ملء الحساب المدين والدائن والمبلغ", variant: "destructive" });
      return;
    }
    if (debitAccount === creditAccount) {
      toast({ title: "خطأ", description: "الحساب المدين والدائن لا يمكن أن يكونا متطابقين", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const text = `سند قيد: من حساب ${debitAccount} إلى حساب ${creditAccount} مبلغ ${amount} ${description ? "- " + description : ""}`;
      const { error } = await supabase.functions.invoke("send-transaction", {
        body: {
          text,
          userId: user?.id,
          email: user?.email,
          forceDebitAccount: debitAccount,
          forceCreditAccount: creditAccount,
          forceAmount: Number(amount),
          forceDate: date,
          forceDescription: description || text,
        },
      });
      if (error) throw error;
      toast({ title: "✅ تم إنشاء سند القيد بنجاح" });
      onSuccess();
      onClose();
      // Reset
      setDebitAccount(""); setCreditAccount(""); setAmount(""); setDescription("");
      setDebitAccountId(""); setCreditAccountId("");
      setDate(new Date().toISOString().split("T")[0]);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Popup */}
      <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-primary/5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">سند قيد جديد</h3>
              <p className="text-[10px] text-muted-foreground">إنشاء قيد محاسبي يدوي</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Debit Account */}
          <div className="space-y-1.5 relative">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              الحساب المدين
            </label>
            <div className="relative">
              <input
                type="text"
                value={debitAccount}
                onChange={(e) => { setDebitAccount(e.target.value); setDebitAccountId(""); setShowDebitDropdown(true); }}
                onFocus={() => setShowDebitDropdown(true)}
                placeholder="ابحث عن الحساب المدين..."
                className="w-full h-10 bg-secondary/60 rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground border border-border/30 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <ChevronDown className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
            {showDebitDropdown && filteredDebitAccounts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-border/50 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {filteredDebitAccounts.slice(0, 15).map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => selectDebit(acc)}
                    className="w-full text-right px-3 py-2 text-xs hover:bg-primary/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-foreground">{acc.name}</span>
                    <span className="text-[10px] text-muted-foreground">{acc.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowLeftRight className="h-5 w-5 text-muted-foreground rotate-90" />
          </div>

          {/* Credit Account */}
          <div className="space-y-1.5 relative">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              الحساب الدائن
            </label>
            <div className="relative">
              <input
                type="text"
                value={creditAccount}
                onChange={(e) => { setCreditAccount(e.target.value); setCreditAccountId(""); setShowCreditDropdown(true); }}
                onFocus={() => setShowCreditDropdown(true)}
                placeholder="ابحث عن الحساب الدائن..."
                className="w-full h-10 bg-secondary/60 rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground border border-border/30 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <ChevronDown className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
            {showCreditDropdown && filteredCreditAccounts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-border/50 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {filteredCreditAccounts.slice(0, 15).map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => selectCredit(acc)}
                    className="w-full text-right px-3 py-2 text-xs hover:bg-primary/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-foreground">{acc.name}</span>
                    <span className="text-[10px] text-muted-foreground">{acc.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount + Date Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" />
                المبلغ
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full h-10 bg-secondary/60 rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground border border-border/30 outline-none focus:ring-2 focus:ring-primary/20 text-center font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                التاريخ
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 bg-secondary/60 rounded-xl px-3 text-sm text-foreground border border-border/30 outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              الوصف
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف العملية (اختياري)"
              className="w-full h-10 bg-secondary/60 rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground border border-border/30 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Preview */}
          {debitAccount && creditAccount && Number(amount) > 0 && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 space-y-1.5">
              <p className="text-[10px] font-semibold text-primary">معاينة القيد:</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">مدين: <strong>{debitAccount}</strong></span>
                <span className="font-bold text-primary">₪{Number(amount).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">دائن: <strong>{creditAccount}</strong></span>
                <span className="font-bold text-destructive">₪{Number(amount).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/30 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={sending || !debitAccount || !creditAccount || !amount || Number(amount) <= 0}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "جاري الإنشاء..." : "إنشاء سند القيد"}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all active:scale-[0.98]"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

export default JournalEntryPopup;

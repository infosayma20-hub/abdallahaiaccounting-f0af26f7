import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Landmark, Loader2, FileText, Search, ChevronDown,
  Save, Trash2, Pencil, RefreshCw, ChevronRight, ChevronLeft,
  ChevronsRight, ChevronsLeft, ArrowRight, XCircle, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { multiWordMatchAny } from "@/lib/utils";

const PALESTINIAN_BANKS = [
  "البنك الإسلامي العربي", "بنك فلسطين", "البنك الأهلي الأردني", "بنك القدس",
  "البنك التجاري الفلسطيني", "بنك الاستثمار الفلسطيني", "البنك العربي",
  "البنك الأردني الكويتي", "بنك الإسكان للتجارة والتمويل", "المصرف الإسلامي الفلسطيني",
  "بنك الأردن", "البنك الوطني", "Cairo Amman Bank", "أخرى",
];

const AccountPicker = ({ accounts, value, onChange, placeholder, disabled }: {
  accounts: { account_code: string; account_name: string; account_type: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = accounts.find(a => a.account_code === value);
  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    return accounts.filter(a => multiWordMatchAny(search, a.account_code, a.account_name));
  }, [accounts, search]);

  const typeColor: Record<string, string> = {
    "أصول": "text-blue-600", "التزامات": "text-red-500", "حقوق ملكية": "text-purple-600",
    "إيرادات": "text-green-600", "مصروفات": "text-orange-500",
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="mt-1.5 w-full h-10 rounded-lg border border-border bg-background px-3 flex items-center justify-between text-sm hover:bg-muted/50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          dir="rtl"
        >
          {selected ? (
            <span className="flex items-center gap-2 font-mono text-foreground">
              <span className="font-bold">{selected.account_code}</span>
              <span className="text-muted-foreground">-</span>
              <span className="text-foreground">{selected.account_name}</span>
            </span>
          ) : value ? (
            <span className="font-mono text-foreground">{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder || "اختر حساب..."}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[var(--radix-popover-trigger-width)] p-0 rounded-xl max-h-[280px] overflow-hidden" dir="rtl">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالرقم أو الاسم..."
              className="w-full h-9 rounded-lg bg-muted/50 pr-8 pl-3 text-xs outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[220px]">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">لا توجد نتائج</p>
          ) : (
            filtered.map(acc => (
              <button
                key={acc.account_code}
                onClick={() => { onChange(acc.account_code); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-right text-xs hover:bg-muted transition-colors ${value === acc.account_code ? "bg-accent/10" : ""}`}
              >
                <span className="font-mono font-bold text-foreground min-w-[44px]">{acc.account_code}</span>
                <span className="flex-1 text-foreground truncate">{acc.account_name}</span>
                <span className={`text-[9px] ${typeColor[acc.account_type] || "text-muted-foreground"}`}>{acc.account_type}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const BankAccountsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const { toast } = useToast();

  const [banks, setBanks] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<{ account_code: string; account_name: string; account_type: string; parent_code: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  /** UI state — Dynamics-style: list ⇄ detail; detail has view / edit / new. */
  const [view, setView] = useState<"list" | "detail">("list");
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");

  // Form state (unchanged bindings)
  const [bankName, setBankName] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("current");
  const [currency, setCurrency] = useState("ILS");
  const [glAccountCode, setGlAccountCode] = useState("");
  const [commissionAccountCode, setCommissionAccountCode] = useState("");
  const [outgoingChecksAccountCode, setOutgoingChecksAccountCode] = useState("");
  const [incomingChecksAccountCode, setIncomingChecksAccountCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [minBalanceAlert, setMinBalanceAlert] = useState("");
  const [notes, setNotes] = useState("");

  const fetchBanks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: bankData }, { data: accData }] = await Promise.all([
      supabase.from("bank_accounts").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }),
      supabase.from("accounts").select("account_code, account_name, account_type, parent_code").eq("user_id", ownerId).eq("is_active", true).order("account_code"),
    ]);
    setBanks(bankData || []);
    setAccounts(accData || []);
    setLoading(false);
  }, [user, ownerId]);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  const resetForm = () => {
    setBankName(""); setCustomBankName(""); setBranch(""); setAccountName("");
    setAccountNumber(""); setAccountType("current"); setCurrency("ILS");
    setGlAccountCode(""); setCommissionAccountCode("");
    setOutgoingChecksAccountCode(""); setIncomingChecksAccountCode("");
    setIsActive(true);
    setOpeningBalance("");
    setOpeningBalanceDate(new Date().toISOString().split("T")[0]);
    setMinBalanceAlert(""); setNotes(""); setEditingBankId(null);
  };

  const loadBankIntoForm = (bank: any) => {
    const isPredefined = PALESTINIAN_BANKS.includes(bank.bank_name);
    setBankName(isPredefined ? bank.bank_name : "أخرى");
    setCustomBankName(isPredefined ? "" : bank.bank_name);
    setBranch(bank.branch || "");
    setAccountName(bank.name || "");
    setAccountNumber(bank.account_number || "");
    setAccountType(bank.account_type || "current");
    setCurrency(bank.currency || "ILS");
    setGlAccountCode(bank.gl_account_code || "");
    setCommissionAccountCode(bank.commission_account_code || "");
    setOutgoingChecksAccountCode(bank.outgoing_checks_account_code || "");
    setIncomingChecksAccountCode(bank.incoming_checks_account_code || "");
    setIsActive(bank.is_active !== false);
    setOpeningBalance(bank.opening_balance?.toString() || "");
    setOpeningBalanceDate(bank.opening_balance_date || new Date().toISOString().split("T")[0]);
    setMinBalanceAlert(bank.min_balance_alert?.toString() || "");
    setNotes(bank.notes || "");
    setEditingBankId(bank.id);
  };

  const openDetail = (bank: any) => { loadBankIntoForm(bank); setMode("view"); setView("detail"); };
  const openNew = () => { resetForm(); setMode("new"); setView("detail"); };
  const backToList = () => { setView("list"); setMode("view"); resetForm(); };

  useEffect(() => {
    if (searchParams.get("new") === "1") openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const currentIndex = useMemo(
    () => (editingBankId ? banks.findIndex(b => b.id === editingBankId) : -1),
    [banks, editingBankId],
  );
  const goTo = (idx: number) => {
    if (idx < 0 || idx >= banks.length) return;
    loadBankIntoForm(banks[idx]);
    setMode("view");
  };

  const handleSave = async () => {
    if (!user) return;
    const finalBankName = bankName === "أخرى" ? customBankName : bankName;
    if (!finalBankName || !accountName) {
      toast({ title: "خطأ", description: "اسم البنك واسم الحساب مطلوبان", variant: "destructive" });
      return;
    }

    setSaving(true);
    let finalGlCode = glAccountCode;
    const parentSet = new Set(accounts.map(a => a.parent_code).filter(Boolean) as string[]);
    const isParent = finalGlCode && parentSet.has(finalGlCode);
    const isNew = !editingBankId;

    // Duplicate gl_account_code guard (across owner's active bank accounts)
    if (finalGlCode) {
      const dup = banks.find(b => b.gl_account_code === finalGlCode && b.id !== editingBankId);
      if (dup) {
        toast({ title: "الحساب المحاسبي مستخدم", description: `الحساب ${finalGlCode} مرتبط مسبقاً بـ "${dup.name}"`, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    if (isNew && (!finalGlCode || isParent)) {
      const { data: newCode, error: rpcErr } = await supabase.rpc("create_bank_leaf_account", {
        p_user_id: ownerId,
        p_bank_name: accountName,
        p_currency: currency || "ILS",
        p_parent_code: "1120",
      });
      if (rpcErr || !newCode) {
        toast({ title: "خطأ", description: rpcErr?.message || "تعذر إنشاء حساب فرعي للبنك", variant: "destructive" });
        setSaving(false);
        return;
      }
      finalGlCode = String(newCode);
    } else if (!isNew && isParent) {
      toast({ title: "لا يمكن الترحيل على حساب أب", description: "اختر حساب فرعي (ورقة) بدل الحساب الأب 1120", variant: "destructive" });
      setSaving(false);
      return;
    }

    const payload = {
      name: accountName,
      bank_name: finalBankName,
      branch: branch || null,
      account_number: accountNumber || null,
      account_type: accountType,
      currency,
      gl_account_code: finalGlCode || null,
      commission_account_code: commissionAccountCode || null,
      outgoing_checks_account_code: outgoingChecksAccountCode || null,
      incoming_checks_account_code: incomingChecksAccountCode || null,
      is_active: isActive,
      opening_balance: Number(openingBalance) || 0,
      opening_balance_date: openingBalanceDate || null,
      min_balance_alert: minBalanceAlert ? Number(minBalanceAlert) : null,
      notes: notes || null,
    };

    const { data: saved, error } = isNew
      ? await supabase.from("bank_accounts").insert({ ...payload, user_id: ownerId }).select("*").single()
      : await supabase.from("bank_accounts").update(payload).eq("id", editingBankId!).eq("user_id", ownerId).select("*").single();

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      if (isNew && Number(openingBalance) > 0 && finalGlCode) {
        const obDate = openingBalanceDate || new Date().toISOString().split("T")[0];
        await supabase.rpc("create_opening_balance_entry", {
          p_user_id: ownerId,
          p_debit_account_code: finalGlCode,
          p_credit_account_code: "3200",
          p_amount: Number(openingBalance),
          p_balance_date: obDate,
          p_description: `رصيد افتتاحي — ${accountName}`,
          p_currency: currency || "ILS",
          p_contact_id: null,
          p_reference: `BANK-OB-${finalGlCode}`,
          p_replace_existing: false,
          p_idempotency_key: `BANK-OB-${finalGlCode}-${Date.now()}`,
        });
      }
      toast({ title: isNew ? `✅ تم إضافة حساب ${finalBankName} بنجاح` : `✅ تم تعديل حساب ${finalBankName} بنجاح` });
      await fetchBanks();
      if (saved?.id) loadBankIntoForm(saved);
      setMode("view");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!editingBankId) return;
    setDeleting(true);
    // Soft-delete: deactivate to preserve historical GL/cheque references.
    const { error } = await supabase
      .from("bank_accounts")
      .update({ is_active: false })
      .eq("id", editingBankId)
      .eq("user_id", ownerId);
    setDeleting(false);
    setDeleteOpen(false);
    if (error) {
      toast({ title: "تعذّر التعطيل", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑️ تم تعطيل الحساب البنكي (Soft Delete)" });
    await fetchBanks();
    backToList();
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const currencySymbol = (c: string) => c === "ILS" ? "₪" : c === "USD" ? "$" : "د.أ";

  const filteredBanks = useMemo(() => {
    if (!listSearch.trim()) return banks;
    return banks.filter(b => multiWordMatchAny(listSearch, b.name || "", b.bank_name || "", b.account_number || "", b.branch || ""));
  }, [banks, listSearch]);

  const readOnly = mode === "view";
  const glLocked = mode === "edit" && !!editingBankId && !!glAccountCode; // lock GL after posting

  // Leaf-only accounts (used for GL / commission / cheque accounts)
  const leafAccounts = useMemo(() => {
    const parentSet = new Set(accounts.map(a => a.parent_code).filter(Boolean) as string[]);
    return accounts.filter(a => !parentSet.has(a.account_code));
  }, [accounts]);

  // Ctrl+S save while in detail
  useEffect(() => {
    if (view !== "detail") return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly && !saving) handleSave();
      }
      // Alt+N → new record, Alt+Q → back to list (query)
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "n") { e.preventDefault(); openNew(); }
        else if (k === "q") { e.preventDefault(); backToList(); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, readOnly, saving, bankName, customBankName, accountName, accountNumber, accountType,
      branch, currency, glAccountCode, commissionAccountCode, openingBalance, openingBalanceDate,
      minBalanceAlert, notes, editingBankId, outgoingChecksAccountCode, incomingChecksAccountCode, isActive]);

  const listTabs: ActionTab[] = [{
    key: "main", label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "add", label: "حساب بنكي جديد", icon: Plus, variant: "primary", onClick: openNew, shortcut: "Alt+N" },
      ]},
      { key: "ops", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchBanks },
      ]},
    ],
  }];

  const detailTabs: ActionTab[] = [{
    key: "main", label: "عام",
    groups: [
      { key: "record", label: "السجل", items: [
        { key: "new", label: "جديد", icon: Plus, variant: "primary", onClick: openNew, shortcut: "Alt+N" },
        { key: "save", label: mode === "new" ? "حفظ" : "حفظ التعديلات", icon: Save,
          variant: "primary", disabled: saving || readOnly, onClick: handleSave, shortcut: "Ctrl+S" },
        { key: "edit", label: readOnly ? "تعديل" : "إلغاء التعديل", icon: readOnly ? Pencil : XCircle,
          disabled: !editingBankId, onClick: () => {
            if (readOnly) setMode("edit");
            else if (editingBankId) {
              const b = banks.find(x => x.id === editingBankId);
              if (b) { loadBankIntoForm(b); setMode("view"); }
            }
          }},
        { key: "delete", label: "حذف", icon: Trash2, variant: "danger",
          disabled: !editingBankId || saving, onClick: () => setDeleteOpen(true) },
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchBanks },
      ]},
      { key: "nav", label: "التنقل", items: [
        { key: "first", label: "الأول", icon: ChevronsRight, disabled: currentIndex <= 0, onClick: () => goTo(0) },
        { key: "prev",  label: "السابق", icon: ChevronRight,  disabled: currentIndex <= 0, onClick: () => goTo(currentIndex - 1) },
        { key: "next",  label: "التالي", icon: ChevronLeft,   disabled: currentIndex < 0 || currentIndex >= banks.length - 1, onClick: () => goTo(currentIndex + 1) },
        { key: "last",  label: "الأخير", icon: ChevronsLeft,  disabled: currentIndex < 0 || currentIndex >= banks.length - 1, onClick: () => goTo(banks.length - 1) },
        { key: "list",  label: "استعلام (القائمة)", icon: Search, onClick: backToList, shortcut: "Alt+Q" },
      ]},
      { key: "query", label: "استعلامات", items: [
        { key: "stmt",  label: "كشف الحساب", icon: FileText, disabled: !glAccountCode,
          onClick: () => glAccountCode && navigate(`/account-statement?code=${glAccountCode}`) },
        { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print() },
      ]},
    ],
  }];

  // ── DETAIL VIEW ────────────────────────────────────────────────────
  if (view === "detail") {
    const bank = editingBankId ? banks.find(b => b.id === editingBankId) : null;
    return (
      <>
        <FinanceShell
          title={mode === "new" ? "حساب بنكي جديد" : (accountName || "حساب بنكي")}
          subtitle={mode === "new" ? "تعريف حساب بنكي وربطه بشجرة الحسابات" : (bank?.bank_name || undefined)}
          breadcrumb={[
            { label: "المالية", href: "/finance" },
            { label: "الحسابات البنكية", href: "#" },
            { label: mode === "new" ? "جديد" : (accountName || "—") },
          ]}
          actionTabs={detailTabs}
          compact
          rightSlot={
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={backToList}>
                <ArrowRight className="h-3.5 w-3.5" /> القائمة
              </Button>
              {currentIndex >= 0 && (
                <span className="font-mono">{currentIndex + 1} / {banks.length}</span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                mode === "new" ? "bg-emerald-100 text-emerald-700" :
                mode === "edit" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-700"
              }`}>
                {mode === "new" ? "جديد" : mode === "edit" ? "تعديل" : "عرض"}
              </span>
            </div>
          }
        >
          <div className="max-w-5xl mx-auto space-y-6 pb-8" dir="rtl">
            {/* Section: Bank Info */}
            <section className="rounded-xl border bg-card">
              <header className="px-5 py-3 border-b flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>معلومات البنك</h3>
              </header>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12.5px] font-semibold">البنك *</Label>
                  <Select value={bankName} onValueChange={setBankName} disabled={readOnly}>
                    <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="اختر البنك..." /></SelectTrigger>
                    <SelectContent>
                      {PALESTINIAN_BANKS.map(b => <SelectItem key={b} value={b}>🏦 {b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {bankName === "أخرى" && (
                    <Input value={customBankName} onChange={e => setCustomBankName(e.target.value)}
                      placeholder="اسم البنك..." className="mt-2 h-10" disabled={readOnly} />
                  )}
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">الفرع</Label>
                  <Input value={branch} onChange={e => setBranch(e.target.value)}
                    placeholder="مثال: رام الله الرئيسي" className="mt-1.5 h-10" disabled={readOnly} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[12.5px] font-semibold">اسم الحساب *</Label>
                  <Input value={accountName} onChange={e => setAccountName(e.target.value)}
                    placeholder="اسم مميز يظهر في النظام" className="mt-1.5 h-10" disabled={readOnly} />
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">رقم الحساب</Label>
                  <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                    className="mt-1.5 h-10 font-mono" disabled={readOnly} />
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">نوع الحساب</Label>
                  <Select value={accountType} onValueChange={setAccountType} disabled={readOnly}>
                    <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">جاري</SelectItem>
                      <SelectItem value="savings">توفير</SelectItem>
                      <SelectItem value="loan">قرض</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">العملة *</Label>
                  <Select value={currency} onValueChange={setCurrency} disabled={readOnly}>
                    <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ILS">₪ شيكل إسرائيلي</SelectItem>
                      <SelectItem value="USD">$ دولار أمريكي</SelectItem>
                      <SelectItem value="JOD">د.أ دينار أردني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Section: GL Mapping */}
            <section className="rounded-xl border bg-card" style={{ borderColor: "hsl(40 80% 60% / 0.35)" }}>
              <header className="px-5 py-3 border-b flex items-center gap-2" style={{ background: "hsl(40 80% 60% / 0.06)" }}>
                <span className="text-amber-600">⚡</span>
                <h3 className="text-sm font-bold" style={{ color: "#B87814", fontFamily: "Tajawal, sans-serif" }}>الربط بشجرة الحسابات</h3>
              </header>
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-[12.5px] font-semibold">حساب البنك الرئيسي *</Label>
                  <AccountPicker
                    accounts={leafAccounts}
                    value={glAccountCode}
                    onChange={setGlAccountCode}
                    placeholder="اتركه فارغاً لإنشاء حساب فرعي تلقائياً تحت 1120"
                    disabled={readOnly || glLocked}
                  />
                  <p className="text-[10.5px] text-muted-foreground mt-1">
                    {glLocked
                      ? "🔒 الحساب المحاسبي مقفل بعد الإنشاء للحفاظ على تكامل الترحيلات التاريخية."
                      : "اترك الحقل فارغاً وسيتم إنشاء حساب فرعي مخصص تحت البنك (1120) تلقائياً باسم هذا الحساب. لا يمكن الترحيل على حساب أب."}
                  </p>
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">حساب عمولات البنك</Label>
                  <AccountPicker
                    accounts={leafAccounts}
                    value={commissionAccountCode}
                    onChange={setCommissionAccountCode}
                    placeholder="اختر حساب العمولات..."
                    disabled={readOnly}
                  />
                  <p className="text-[10.5px] text-muted-foreground mt-1">يُستخدم تلقائياً عند تسجيل رسوم خدمات بنكية</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[12.5px] font-semibold">حساب الشيكات الصادرة (تحت الدفع)</Label>
                    <AccountPicker
                      accounts={leafAccounts}
                      value={outgoingChecksAccountCode}
                      onChange={setOutgoingChecksAccountCode}
                      placeholder="افتراضي: 1160"
                      disabled={readOnly}
                    />
                    <p className="text-[10.5px] text-muted-foreground mt-1">يُستخدم عند إصدار شيكات من هذا البنك.</p>
                  </div>
                  <div>
                    <Label className="text-[12.5px] font-semibold">حساب الشيكات الواردة (برسم التحصيل)</Label>
                    <AccountPicker
                      accounts={leafAccounts}
                      value={incomingChecksAccountCode}
                      onChange={setIncomingChecksAccountCode}
                      placeholder="افتراضي: 1150"
                      disabled={readOnly}
                    />
                    <p className="text-[10.5px] text-muted-foreground mt-1">يُستخدم عند إيداع شيكات في هذا البنك.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Opening balance + extras */}
            <section className="rounded-xl border bg-card">
              <header className="px-5 py-3 border-b flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-primary" />
                <h3 className="text-sm font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>الرصيد الافتتاحي وإعدادات إضافية</h3>
              </header>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12.5px] font-semibold">الرصيد الافتتاحي</Label>
                  <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                    placeholder="0.00" className="mt-1.5 h-10 font-mono"
                    disabled={readOnly || mode === "edit"} />
                  {mode === "edit" && (
                    <p className="text-[10.5px] text-amber-600 mt-1">
                      الرصيد الافتتاحي لا يُعدَّل بعد الإنشاء — استخدم قيد يومي لتصحيحه للحفاظ على تكامل الترحيل.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">تاريخ الرصيد</Label>
                  <Input type="date" value={openingBalanceDate} onChange={e => setOpeningBalanceDate(e.target.value)}
                    className="mt-1.5 h-10" disabled={readOnly || mode === "edit"} />
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold">حد التنبيه عند انخفاض الرصيد</Label>
                  <Input type="number" value={minBalanceAlert} onChange={e => setMinBalanceAlert(e.target.value)}
                    placeholder="مثال: 5000" className="mt-1.5 h-10 font-mono" disabled={readOnly} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[12.5px] font-semibold">ملاحظات</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1.5" disabled={readOnly} />
                </div>
                <div className="md:col-span-2 flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                  <div>
                    <Label className="text-[12.5px] font-semibold">الحساب نشط</Label>
                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                      عند التعطيل، لن يظهر هذا الحساب في شاشات القبض/الصرف والشيكات، لكن ترحيلاته التاريخية تبقى محفوظة.
                    </p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} disabled={readOnly} />
                </div>
              </div>
            </section>

            {/* Sticky action footer */}
            <div className="sticky bottom-0 -mx-1 px-1">
              <div className="rounded-xl border bg-card/95 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
                <div className="text-[11.5px] text-muted-foreground">
                  {mode === "new" ? "سجل جديد لم يُحفظ بعد" :
                    mode === "edit" ? "وضع التعديل — لا تنسَ الحفظ (Ctrl+S)" :
                    editingBankId ? "وضع العرض" : ""}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={backToList} disabled={saving}>
                    <ArrowRight className="h-4 w-4 ml-1" /> رجوع للقائمة
                  </Button>
                  {!readOnly ? (
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {mode === "new" ? "حفظ الحساب البنكي" : "حفظ التعديلات"}
                    </Button>
                  ) : editingBankId ? (
                    <Button size="sm" onClick={() => setMode("edit")} className="gap-2">
                      <Pencil className="h-4 w-4" /> تعديل
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </FinanceShell>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تعطيل الحساب البنكي؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم تعطيل <span className="font-bold">{accountName}</span> (Soft Delete) للحفاظ على تكامل الترحيلات التاريخية
                والشيكات المرتبطة. الحساب المحاسبي ({glAccountCode || "—"}) لن يتأثر، ولن يظهر هذا الحساب في شاشات القبض/الصرف
                الجديدة. يمكن إعادة تفعيله لاحقاً من مفتاح "الحساب نشط".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Trash2 className="h-4 w-4 ml-1" />} تعطيل
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────
  return (
    <FinanceShell
      title="الحسابات البنكية"
      subtitle="قائمة الحسابات البنكية المرتبطة بشجرة الحسابات"
      breadcrumb={[{ label: "المالية", href: "/finance" }, { label: "الحسابات البنكية" }]}
      actionTabs={listTabs}
      compact
      rightSlot={
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={listSearch} onChange={e => setListSearch(e.target.value)}
            placeholder="بحث بالاسم، البنك، رقم الحساب..." className="h-8 w-64 pr-7 text-[12px]" />
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredBanks.length === 0 ? (
        <div className="text-center py-20">
          <Landmark className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            {banks.length === 0 ? "لم تُعرَّف حسابات بنكية بعد" : "لا توجد نتائج مطابقة للبحث"}
          </p>
          {banks.length === 0 && (
            <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />إضافة حساب بنكي</Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-right w-12">#</TableHead>
                <TableHead className="text-right">اسم الحساب</TableHead>
                <TableHead className="text-right">البنك</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الفرع</TableHead>
                <TableHead className="text-right">رقم الحساب</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">العملة</TableHead>
                <TableHead className="text-right">الحساب المحاسبي</TableHead>
                <TableHead className="text-left">الرصيد الافتتاحي</TableHead>
                <TableHead className="text-center w-24">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBanks.map((bank, idx) => (
                <TableRow key={bank.id} className="cursor-pointer" onDoubleClick={() => openDetail(bank)}>
                  <TableCell className="text-muted-foreground text-[11px]">{idx + 1}</TableCell>
                  <TableCell className="font-semibold">{bank.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <Landmark className="h-3.5 w-3.5 text-primary" />
                      {bank.bank_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{bank.branch || "—"}</TableCell>
                  <TableCell className="font-mono text-[12px]">{bank.account_number || "—"}</TableCell>
                  <TableCell className="text-[12px]">
                    {bank.account_type === "savings" ? "توفير" : bank.account_type === "loan" ? "قرض" : "جاري"}
                  </TableCell>
                  <TableCell className="text-[12px]">{bank.currency}</TableCell>
                  <TableCell className="font-mono text-[11.5px] text-muted-foreground">{bank.gl_account_code || "—"}</TableCell>
                  <TableCell className="text-left font-mono font-semibold">
                    {currencySymbol(bank.currency)} {formatAmount(Number(bank.opening_balance || 0))}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDetail(bank)} title="فتح">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2"
                        onClick={() => navigate(`/account-statement?code=${bank.gl_account_code || "1120"}`)}
                        title="كشف حساب">
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FinanceShell>
  );
};

export default BankAccountsPage;
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, RotateCcw, Lock, Sparkles, Wand2, ChevronLeft, FolderTree, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import SmartFormScope from "@/components/forms/SmartFormScope";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";
import { FinanceShell } from "@/components/finance/shell";
import { FastTabs, type FastTabItem } from "@/components/finance/shell/FastTabs";
import JournalAccountPicker, { type PickerAccount } from "@/components/journal/JournalAccountPicker";

const ACCOUNT_TYPES = [
  { value: "Asset", label: "أصول", bucket: "1", color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  { value: "Liability", label: "التزامات", bucket: "2", color: "text-rose-600", bg: "bg-rose-50 border-rose-200" },
  { value: "Owner's Equity", label: "حقوق الملكية", bucket: "3", color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { value: "Revenue", label: "إيرادات", bucket: "4", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  { value: "Purchases", label: "مشتريات", bucket: "5", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  { value: "Expenses", label: "مصروفات", bucket: "6", color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
];

const TYPE_BUCKET: Record<string, string> = {
  Asset: "1", Liability: "2", "Owner's Equity": "3",
  Revenue: "4", Purchases: "5", Expenses: "6",
};

const DEFAULT_BALANCE: Record<string, "debit" | "credit"> = {
  Asset: "debit", Purchases: "debit", Expenses: "debit",
  Liability: "credit", "Owner's Equity": "credit", Revenue: "credit",
};

const arabicTypeMap: Record<string, string> = {
  "إيرادات": "Revenue", "مصاريف": "Expenses", "مصروفات": "Expenses",
  "أصول": "Asset", "التزامات": "Liability", "خصوم": "Liability",
  "حقوق ملكية": "Owner's Equity", "مشتريات": "Purchases",
};
function normalizeType(t: string) { return arabicTypeMap[t] || t; }

interface AccountFormPageProps {
  mode: "create" | "edit";
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_system_protected?: boolean | null;
  currency?: string | null;
}

const CURRENCIES = [
  { value: "شيكل", label: "شيكل", symbol: "₪", code: "ILS" },
  { value: "دينار", label: "دينار", symbol: "د.أ", code: "JOD" },
  { value: "دولار", label: "دولار", symbol: "$", code: "USD" },
];

const AccountFormPage = ({ mode }: AccountFormPageProps) => {
  const navigate = useNavigate();
  const { accountId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { company } = useCompany();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [existingAccount, setExistingAccount] = useState<Account | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [parentCode, setParentCode] = useState<string | null>(null);
  const [naturalBalance, setNaturalBalance] = useState<"debit" | "credit">("debit");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [notes, setNotes] = useState("");
  const [codeError, setCodeError] = useState("");
  const [parentPrefilled, setParentPrefilled] = useState(false);
  // Track whether the user manually edited the code (disables auto-fill)
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  // ─── Account Currency ───
  const [currency, setCurrency] = useState<string>("شيكل");

  // ─── Opening Balance ───
  const [obAmount, setObAmount] = useState<number>(0);
  const [obType, setObType] = useState<"debit" | "credit">("debit");
  const [obDate, setObDate] = useState<string>(new Date().getFullYear() + "-01-01");
  const [obLoaded, setObLoaded] = useState(false);
  const [obExistingRef, setObExistingRef] = useState<string | null>(null);
  const [obExchangeRate, setObExchangeRate] = useState<number>(0);

  // Load accounts for parent selector
  useEffect(() => {
    if (!user) return;
    supabase.from("accounts").select("id, account_code, account_name, account_type, parent_code, description_ar, notes, is_system_protected, currency")
      .eq("user_id", user.id).order("account_code")
      .then(({ data }) => setAccounts(data ?? []))
      .then(() => setDraftReady(true), () => setDraftReady(true));
  }, [user]);

  // Load existing account in edit mode
  useEffect(() => {
    if (mode === "edit" && accountId && accounts.length > 0) {
      const acc = accounts.find(a => a.id === accountId);
      if (acc) {
        setExistingAccount(acc);
        setCode(acc.account_code);
        setName(acc.account_name);
        setAccountType(normalizeType(acc.account_type));
        setParentCode(acc.parent_code);
        setDescriptionAr(acc.description_ar ?? "");
        setNotes(acc.notes ?? "");
        setNaturalBalance(DEFAULT_BALANCE[normalizeType(acc.account_type)] ?? "debit");
        setCurrency(acc.currency || "شيكل");
      }
    }
  }, [mode, accountId, accounts]);

  // Pre-fill from ?parent= query param (when adding sub-account from tree)
  useEffect(() => {
    if (mode !== "create" || parentPrefilled || accounts.length === 0) return;
    const parentParam = searchParams.get("parent");
    if (!parentParam) { setParentPrefilled(true); return; }
    const parent = accounts.find(a => a.account_code === parentParam);
    if (parent) {
      setAccountType(normalizeType(parent.account_type));
      setParentCode(parent.account_code);
    }
    setParentPrefilled(true);
  }, [mode, accounts, searchParams, parentPrefilled]);

  // Auto-set balance when type changes
  useEffect(() => {
    if (accountType && DEFAULT_BALANCE[accountType]) {
      setNaturalBalance(DEFAULT_BALANCE[accountType]);
      // Default OB type follows natural balance
      if (!obLoaded) setObType(DEFAULT_BALANCE[accountType]);
    }
  }, [accountType, obLoaded]);

  // Load existing opening balance (edit mode) from journal entries
  useEffect(() => {
    if (mode !== "edit" || !existingAccount || !user) return;
    const ref = `OB-ACC-${existingAccount.id}`;
    setObExistingRef(ref);
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount, foreign_amount, exchange_rate, debit_account_code, credit_account_code, transaction_date, currency")
        .eq("user_id", user.id)
        .eq("reference", ref)
        .eq("is_opening_balance", true)
        .eq("is_deleted", false)
        .limit(1);
      const row: any = data?.[0];
      if (row) {
        const isFX = row.currency && row.currency !== "شيكل" && Number(row.foreign_amount) > 0;
        setObAmount(isFX ? Number(row.foreign_amount) : Number(row.amount) || 0);
        if (isFX) setObExchangeRate(Number(row.exchange_rate) || 0);
        setObType(row.debit_account_code === existingAccount.account_code ? "debit" : "credit");
        setObDate(row.transaction_date || obDate);
      }
      setObLoaded(true);
    })();
  }, [mode, existingAccount, user]);

  // Auto-fetch latest exchange rate when currency switches to foreign
  useEffect(() => {
    if (!user || currency === "شيكل") { setObExchangeRate(0); return; }
    if (obExchangeRate > 0) return; // keep user-edited rate
    (async () => {
      const { data } = await supabase.rpc("get_latest_exchange_rate", {
        p_user_id: user.id, p_currency_name: currency,
      });
      const r = Number(data);
      if (r > 0) setObExchangeRate(r);
    })();
  }, [currency, user]);

  // Validate code
  useEffect(() => {
    if (!code) { setCodeError(""); return; }
    if (!/^\d{3,6}$/.test(code)) { setCodeError("يجب أن يكون 3-6 أرقام"); return; }
    const exists = accounts.some(a => a.account_code === code && a.id !== accountId);
    setCodeError(exists ? "هذا الرمز مستخدم" : "");
  }, [code, accounts, accountId]);

  const eligibleParents = useMemo(() => {
    if (!accountType) return accounts;
    return accounts.filter(a => normalizeType(a.account_type) === accountType && a.id !== accountId);
  }, [accounts, accountType, accountId]);

  // Siblings = accounts sharing the same parent (or top-level of same type if no parent)
  const siblings = useMemo(() => {
    if (mode === "edit") return [];
    if (parentCode) {
      return accounts.filter(a => a.parent_code === parentCode).sort((a, b) => a.account_code.localeCompare(b.account_code));
    }
    if (accountType) {
      return accounts
        .filter(a => !a.parent_code && normalizeType(a.account_type) === accountType)
        .sort((a, b) => a.account_code.localeCompare(b.account_code));
    }
    return [];
  }, [accounts, parentCode, accountType, mode]);

  // Suggested next code: max sibling + 1 (preserving width). Falls back to parent+"01" or type bucket.
  const suggestedCode = useMemo(() => {
    if (mode === "edit") return "";
    const used = new Set(accounts.map(a => a.account_code));
    if (parentCode) {
      const childPrefix = parentCode;
      const children = accounts
        .filter(a => a.parent_code === parentCode && a.account_code.startsWith(childPrefix))
        .map(a => a.account_code);
      if (children.length === 0) {
        const c = childPrefix + "01";
        return used.has(c) ? "" : c;
      }
      const widths = children.map(c => c.length);
      const width = Math.max(...widths);
      const nums = children
        .filter(c => c.length === width)
        .map(c => parseInt(c, 10))
        .filter(n => !isNaN(n));
      let next = (nums.length ? Math.max(...nums) : parseInt(childPrefix + "00", 10)) + 1;
      while (used.has(String(next).padStart(width, "0"))) next += 1;
      return String(next).padStart(width, "0");
    }
    // Top-level: use type bucket (e.g. Asset → 1xxx)
    if (accountType && TYPE_BUCKET[accountType]) {
      const bucket = TYPE_BUCKET[accountType];
      const topAccounts = accounts
        .filter(a => !a.parent_code && a.account_code.startsWith(bucket) && a.account_code.length === 4)
        .map(a => parseInt(a.account_code, 10))
        .filter(n => !isNaN(n));
      if (topAccounts.length === 0) return bucket + "100";
      // Round up to next 100 (e.g. 3100 → 3200, 3500 → 3600)
      const max = Math.max(...topAccounts);
      let next = Math.floor(max / 100) * 100 + 100;
      while (used.has(String(next))) next += 100;
      return String(next);
    }
    return "";
  }, [accounts, parentCode, accountType, mode]);

  // Auto-fill code from suggestion when user hasn't manually edited
  useEffect(() => {
    if (mode !== "create") return;
    if (codeManuallyEdited) return;
    if (suggestedCode) setCode(suggestedCode);
    else setCode("");
  }, [suggestedCode, codeManuallyEdited, mode]);

  // Build a visual breadcrumb path: Type › Parent › New
  const typeMeta = ACCOUNT_TYPES.find(t => t.value === accountType);
  const parentAccount = parentCode ? accounts.find(a => a.account_code === parentCode) : null;

  const isProtected = existingAccount?.is_system_protected;
  const isValid = name.trim() && accountType && code && !codeError;

  // ─── Auto-Draft (تعريف حساب) ───
  const accountDraftSnapshot = useMemo(() => ({
    code, name, accountType, parentCode, descriptionAr, notes,
  }), [code, name, accountType, parentCode, descriptionAr, notes]);

  const applyAccountDraft = useCallback((d: any) => {
    if (d.code) setCode(d.code);
    if (d.name) setName(d.name);
    if (d.accountType) setAccountType(d.accountType);
    if (d.parentCode !== undefined) setParentCode(d.parentCode);
    if (d.descriptionAr) setDescriptionAr(d.descriptionAr);
    if (d.notes) setNotes(d.notes);
    toast({ title: "✅ تم استعادة المسودة" });
  }, [toast]);

  const isAccountDraftEmpty = useCallback((d: any) => {
    return !d.code && !d.name && !d.accountType && !d.descriptionAr && !d.notes;
  }, []);

  const { hasDraft, restoreDraft, clearDraft, draftSavedAt } = useFormDraft(
    "account_new",
    accountDraftSnapshot,
    applyAccountDraft,
    {
      enabled: mode === "create",
      version: 1,
      isEmpty: isAccountDraftEmpty,
      routePath: "/accounts/new",
      scope: [user?.id || "anon", company?.id || "no-company", "/accounts/new", mode].join(":"),
      ready: draftReady,
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !user) return;
    setIsLoading(true);

    try {
      let savedAccountId = accountId;
      let savedAccountCode = code;

      // Guard: prevent OB posting to a parent account (has children)
      const hasChildren = accounts.some(a => a.parent_code === code);
      if (obAmount > 0 && hasChildren) {
        toast({
          title: "⚠️ لا يمكن تسجيل رصيد افتتاحي",
          description: "هذا حساب رئيسي (له حسابات فرعية). سجّل الرصيد على حساب فرعي.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Guard: foreign currency requires an exchange rate
      if (obAmount > 0 && currency !== "شيكل" && (!obExchangeRate || obExchangeRate <= 0)) {
        toast({
          title: "⚠️ سعر الصرف مطلوب",
          description: `أدخل سعر صرف الـ${currency} مقابل الشيكل لتسجيل الرصيد الافتتاحي.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (mode === "create") {
        const { data: ins, error } = await supabase.from("accounts").insert({
          user_id: user.id,
          account_code: code,
          account_name: name.trim(),
          account_type: accountType,
          parent_code: parentCode,
          description_ar: descriptionAr.trim() || null,
          notes: notes.trim() || null,
          currency,
        }).select("id, account_code").single();
        if (error) throw error;
        savedAccountId = ins?.id;
        savedAccountCode = ins?.account_code || code;
        toast({ title: "✅ تم إنشاء الحساب", description: `${code} — ${name}` });
        clearDraft();
      } else {
        if (isProtected && code !== existingAccount!.account_code) {
          toast({ title: "⚠️ تحذير", description: "لا يمكن تغيير رمز حساب محمي", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        const updateData: Record<string, any> = {
          account_name: name.trim(),
          account_type: accountType,
          parent_code: parentCode,
          description_ar: descriptionAr.trim() || null,
          notes: notes.trim() || null,
          currency,
        };
        if (!isProtected) updateData.account_code = code;

        const { error } = await supabase.from("accounts").update(updateData).eq("id", accountId!);
        if (error) throw error;
        toast({ title: "✅ تم حفظ التغييرات" });
      }

      // ─── Opening Balance posting (idempotent via RPC) ───
      if (savedAccountId && code !== "3110") {
        const ref = `OB-ACC-${savedAccountId}`;
        if (obAmount > 0) {
          const debitCode = obType === "debit" ? savedAccountCode : "3110";
          const creditCode = obType === "debit" ? "3110" : savedAccountCode;
          const isFX = currency !== "شيكل";
          const ilsAmount = isFX ? obAmount * obExchangeRate : obAmount;
          const { data: rpcRes, error: obErr } = await supabase.rpc("create_opening_balance_entry", {
            p_user_id: user.id,
            p_debit_account_code: debitCode,
            p_credit_account_code: creditCode,
            p_amount: ilsAmount,
            p_balance_date: obDate,
            p_description: `رصيد افتتاحي - ${name.trim()}`,
            p_currency: currency,
            p_contact_id: null,
            p_reference: ref,
            p_replace_existing: true,
            p_idempotency_key: `${ref}-${Date.now()}`,
            p_foreign_amount: isFX ? obAmount : null,
            p_exchange_rate: isFX ? obExchangeRate : null,
          });
          const r = rpcRes as any;
          if (obErr || (r && r.success === false)) {
            toast({ title: "⚠ خطأ في الرصيد الافتتاحي", description: obErr?.message || r?.error || "فشل التسجيل", variant: "destructive" });
          }
        } else if (mode === "edit" && obExistingRef) {
          // Amount cleared → soft-delete existing OB transactions
          await supabase.from("transactions").update({ is_deleted: true } as any)
            .eq("user_id", user.id).eq("reference", obExistingRef).eq("is_opening_balance", true);
        }
      }

      navigate("/accounts");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (existingAccount) {
      setCode(existingAccount.account_code);
      setName(existingAccount.account_name);
      setAccountType(normalizeType(existingAccount.account_type));
      setParentCode(existingAccount.parent_code);
      setDescriptionAr(existingAccount.description_ar ?? "");
      setNotes(existingAccount.notes ?? "");
    } else {
      setCode(""); setName(""); setAccountType(""); setParentCode(null);
      setDescriptionAr(""); setNotes("");
      clearDraft();
    }
  };

  // Build picker accounts list (eligible parents only)
  const pickerAccounts: PickerAccount[] = useMemo(
    () => eligibleParents.map(p => ({
      account_code: p.account_code,
      account_name: p.account_name,
      account_type: p.account_type,
    })),
    [eligibleParents]
  );

  // FastTabs sections
  const sections: FastTabItem[] = [
    {
      key: "classification",
      title: "التصنيف",
      defaultOpen: true,
      summary: typeMeta ? (
        <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border", typeMeta.bg, typeMeta.color)}>
          {typeMeta.label} ({typeMeta.bucket}xxx)
        </span>
      ) : <span className="text-[11px] text-muted-foreground">اختر النوع</span>,
      children: (
        <div className="px-4 py-4">
          <Label className="text-[12px] font-semibold mb-2 block">
            نوع الحساب <span className="text-destructive">*</span>
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
            {ACCOUNT_TYPES.map(t => {
              const selected = accountType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  disabled={!!isProtected}
                  onClick={() => { setAccountType(t.value); setParentCode(null); setCodeManuallyEdited(false); }}
                  className={cn(
                    "px-2.5 py-2 rounded-md border-2 text-[12px] font-semibold transition-all text-center",
                    selected
                      ? cn(t.bg, t.color, "border-current ring-2 ring-current/20")
                      : "border-border bg-background text-foreground/70 hover:border-[#1B3A5C]/30 hover:shadow-sm",
                    isProtected && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="font-mono text-[10px] opacity-70 mb-0.5" dir="ltr">{t.bucket}xxx</div>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      key: "identity",
      title: "بيانات الحساب",
      defaultOpen: true,
      hasError: !!codeError,
      summary: (name || code) ? (
        <span className="flex items-center gap-1.5 text-[11px]">
          {code && <span className="font-mono font-bold text-[#1B3A5C]" dir="ltr">{code}</span>}
          {name && <span className="text-foreground/80 truncate max-w-[200px]">{name}</span>}
        </span>
      ) : <span className="text-[11px] text-muted-foreground">لم يُحدد بعد</span>,
      children: (
        <div className="px-4 py-4 space-y-4">
          {/* 1. اسم الحساب */}
          <div className="grid grid-cols-12 items-center gap-3">
            <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
              اسم الحساب <span className="text-destructive">*</span>
            </Label>
            <div className="col-span-12 sm:col-span-9">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: رأس المال — الشريك أحمد"
                dir="rtl"
                data-smart-first={isProtected ? undefined : "true"}
                className="h-10"
              />
            </div>
          </div>

          {/* 2. حساب الأب — مع بحث */}
          <div className="grid grid-cols-12 items-center gap-3">
            <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end flex sm:justify-end items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
              حساب الأب
            </Label>
            <div className="col-span-12 sm:col-span-9">
              {accountType ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <JournalAccountPicker
                      lineId="parent-account"
                      value={parentCode || ""}
                      accountName={parentAccount?.account_name || ""}
                      accounts={pickerAccounts}
                      onSelect={(a) => { setParentCode(a.account_code); setCodeManuallyEdited(false); }}
                      onClear={() => { setParentCode(null); setCodeManuallyEdited(false); }}
                      nextFocusSelector="[data-account-code-field]"
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    اتركه فارغاً لحساب رئيسي
                  </span>
                </div>
              ) : (
                <div className="h-10 px-3 rounded-md border border-dashed border-border bg-muted/30 flex items-center text-[12px] text-muted-foreground">
                  اختر نوع الحساب أولاً لتفعيل البحث
                </div>
              )}
            </div>
          </div>

          {/* 3. رقم الحساب */}
          <div className="grid grid-cols-12 items-center gap-3">
            <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
              رقم الحساب <span className="text-destructive">*</span>
            </Label>
            <div className="col-span-12 sm:col-span-9 flex items-center gap-2 flex-wrap">
              <Input
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").substring(0, 6)); setCodeManuallyEdited(true); }}
                placeholder={accountType ? "يُقترح تلقائياً…" : "اختر النوع أولاً"}
                className={cn(
                  "font-mono text-center text-[15px] font-bold tracking-wider h-10 w-44",
                  codeError && "border-destructive",
                  isProtected && "bg-muted",
                  !codeManuallyEdited && code && !isProtected && "bg-[#1B3A5C]/5 border-[#1B3A5C]/30"
                )}
                dir="ltr"
                disabled={!!isProtected}
                data-account-code-field="true"
              />
              {!isProtected && mode === "create" && !codeManuallyEdited && code && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#1B3A5C] bg-[#1B3A5C]/10 px-2 py-1 rounded border border-[#1B3A5C]/20">
                  <Wand2 className="w-3 h-3" /> تلقائي
                </span>
              )}
              {!isProtected && mode === "create" && suggestedCode && code !== suggestedCode && (
                <button
                  type="button"
                  onClick={() => { setCode(suggestedCode); setCodeManuallyEdited(false); }}
                  className="inline-flex items-center gap-1 text-[11px] text-[#1B3A5C] hover:underline font-medium"
                >
                  <Sparkles className="w-3 h-3" />
                  استخدم: <span className="font-mono font-bold">{suggestedCode}</span>
                </button>
              )}
              {codeError && <p className="text-[11px] text-destructive w-full">⚠ {codeError}</p>}
            </div>
          </div>

          {/* 4. طبيعة الحساب */}
          <div className="grid grid-cols-12 items-center gap-3">
            <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
              طبيعة الحساب <span className="text-destructive">*</span>
            </Label>
            <div className="col-span-12 sm:col-span-9 flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-md border bg-background p-0.5 gap-0.5">
                {(["debit", "credit"] as const).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNaturalBalance(val)}
                    disabled={!!isProtected}
                    className={cn(
                      "px-4 py-1.5 rounded text-[12px] font-semibold transition-all min-w-[90px]",
                      naturalBalance === val
                        ? val === "debit"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {val === "debit" ? "مدين" : "دائن"}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">تُحدّد تلقائياً حسب النوع</span>
            </div>
          </div>

          {/* 5. عملة الحساب */}
          <div className="grid grid-cols-12 items-center gap-3">
            <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
              عملة الحساب <span className="text-destructive">*</span>
            </Label>
            <div className="col-span-12 sm:col-span-9 flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-md border bg-background p-0.5 gap-0.5">
                {CURRENCIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCurrency(c.value)}
                    disabled={!!isProtected}
                    className={cn(
                      "px-4 py-1.5 rounded text-[12px] font-semibold transition-all min-w-[100px] flex items-center justify-center gap-1.5",
                      currency === c.value
                        ? "bg-[#1B3A5C]/10 text-[#1B3A5C] ring-1 ring-[#1B3A5C]/30"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <span className="font-mono text-[11px] opacity-70" dir="ltr">{c.symbol}</span>
                    {c.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">العملة الطبيعية للحساب (للحسابات البنكية وحسابات العملات الأجنبية)</span>
            </div>
          </div>

          {/* Siblings reference panel */}
          {!isProtected && mode === "create" && siblings.length > 0 && (
            <div className="mt-2 rounded-md border bg-slate-50/60 dark:bg-slate-900/20 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <FolderTree className="w-3 h-3" />
                {parentCode ? `الحسابات الفرعية تحت ${parentCode}` : "الحسابات الرئيسية بنفس النوع"}
                <span className="font-normal">({siblings.length})</span>
              </p>
              <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-0.5">
                {siblings.slice(0, 30).map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px] py-0.5">
                    <span className="font-mono text-[10px] text-[#1B3A5C] bg-white px-1.5 py-0.5 rounded border" dir="ltr">{s.account_code}</span>
                    <span className="truncate text-foreground/70">{s.account_name}</span>
                  </div>
                ))}
              </div>
              {siblings.length > 30 && (
                <p className="text-[10px] text-muted-foreground text-center pt-1.5">… و {siblings.length - 30} حساب آخر</p>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "opening_balance",
      title: "الرصيد الافتتاحي",
      defaultOpen: true,
      summary: obAmount > 0 ? (
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className={cn("px-2 py-0.5 rounded font-mono font-bold",
            obType === "debit" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")} dir="ltr">
            {obAmount.toLocaleString()} ₪
          </span>
          <span className="text-muted-foreground">{obType === "debit" ? "مدين" : "دائن"}</span>
        </span>
      ) : <span className="text-[11px] text-muted-foreground">لا يوجد رصيد افتتاحي</span>,
      children: (
        <div className="px-4 py-4 space-y-4">
          {code === "3110" ? (
            <div className="text-[12px] text-muted-foreground bg-muted/30 border border-dashed rounded-md p-3">
              لا يمكن إضافة رصيد افتتاحي لحساب الأرصدة الافتتاحية نفسه (3110).
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 items-center gap-3">
                <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
                  المبلغ
                </Label>
                <div className="col-span-12 sm:col-span-9 flex items-center gap-2">
                  <Input
                    type="number"
                    value={obAmount || ""}
                    onChange={(e) => setObAmount(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    className="h-10 w-48 font-mono"
                    dir="ltr"
                  />
                  <span className="text-[12px] text-muted-foreground">₪ شيكل</span>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-3">
                <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
                  النوع
                </Label>
                <div className="col-span-12 sm:col-span-9">
                  <div className="inline-flex rounded-md border bg-background p-0.5 gap-0.5">
                    {(["debit", "credit"] as const).map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setObType(val)}
                        className={cn(
                          "px-4 py-1.5 rounded text-[12px] font-semibold transition-all min-w-[90px]",
                          obType === val
                            ? val === "debit"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            : "text-muted-foreground hover:bg-muted/60"
                        )}
                      >
                        {val === "debit" ? "مدين" : "دائن"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-3">
                <Label className="col-span-12 sm:col-span-3 text-[12px] font-semibold sm:text-end">
                  تاريخ الرصيد
                </Label>
                <div className="col-span-12 sm:col-span-9">
                  <Input
                    type="date"
                    value={obDate}
                    onChange={(e) => setObDate(e.target.value)}
                    className="h-10 w-48"
                  />
                </div>
              </div>

              {obAmount > 0 && (
                <div className="rounded-md border bg-[#1B3A5C]/5 border-[#1B3A5C]/15 px-3 py-2 text-[11.5px] text-foreground/80 leading-relaxed">
                  <strong className="text-[#1B3A5C]">سيتم تسجيل قيد افتتاحي:</strong>{" "}
                  {obType === "debit" ? (
                    <>مدين <span className="font-mono font-bold text-emerald-700">{code || "هذا الحساب"}</span> / دائن <span className="font-mono font-bold text-rose-700">3110 — الأرصدة الافتتاحية</span></>
                  ) : (
                    <>مدين <span className="font-mono font-bold text-emerald-700">3110 — الأرصدة الافتتاحية</span> / دائن <span className="font-mono font-bold text-rose-700">{code || "هذا الحساب"}</span></>
                  )}
                  {" "}بمبلغ <span className="font-mono font-bold" dir="ltr">{obAmount.toLocaleString()} ₪</span>
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: "details",
      title: "تفاصيل إضافية",
      defaultOpen: false,
      summary: <span className="text-[11px] text-muted-foreground">اختياري — اضغط للفتح</span>,
      children: (
        <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold">الوصف</Label>
            <Textarea
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder="مثال: حساب الشريك أحمد بنسبة مساهمة 25%"
              rows={3}
              dir="rtl"
              className="bg-background resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold">ملاحظات داخلية</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات لا تظهر في التقارير…"
              rows={3}
              dir="rtl"
              className="bg-background resize-none"
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <FinanceShell
      title={mode === "create" ? "إنشاء حساب جديد" : "تعديل الحساب"}
      subtitle={mode === "create" ? "أضف حساب جديد إلى شجرة الحسابات" : existingAccount?.account_name || ""}
      breadcrumb={[
        { label: "المحاسبة" },
        { label: "شجرة الحسابات", href: "/accounts" },
        { label: mode === "create" ? "حساب جديد" : (existingAccount?.account_name || "تعديل") },
      ]}
      actionTabs={[
        {
          key: "home",
          label: "الإجراءات",
          groups: [
            {
              key: "primary",
              label: "حفظ",
              items: [
                {
                  key: "save",
                  label: isLoading ? "جاري الحفظ…" : "حفظ",
                  icon: Save,
                  variant: "primary",
                  onClick: () => {
                    const form = document.getElementById("account-form") as HTMLFormElement | null;
                    form?.requestSubmit();
                  },
                },
                {
                  key: "reset",
                  label: "إعادة تعيين",
                  icon: RotateCcw,
                  onClick: () => { handleReset(); setCodeManuallyEdited(false); },
                },
                {
                  key: "cancel",
                  label: "إلغاء",
                  icon: XIcon,
                  variant: "ghost",
                  onClick: () => { if (mode === "create") clearDraft(); navigate("/accounts"); },
                },
              ],
            },
          ],
        },
      ]}
    >
      <SmartFormScope firstFieldSelector="[data-smart-first]">
        <form id="account-form" onSubmit={handleSubmit} className="w-full px-2 sm:px-4 space-y-3">
          {/* Auto-Draft restore */}
          {hasDraft && (
            <DraftRestoreBanner
              onRestore={restoreDraft}
              onDismiss={clearDraft}
              savedAt={draftSavedAt}
              label="يوجد مسودة محفوظة لحساب جديد"
            />
          )}

          {/* Protected warning */}
          {isProtected && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg px-4 py-3">
              <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-amber-800">حساب محمي</p>
                <p className="text-[11.5px] text-amber-700">هذا الحساب مرتبط بقيود محاسبية تلقائية. لا يمكن تغيير رمزه أو حذفه. يمكنك تعديل الاسم والوصف فقط.</p>
              </div>
            </div>
          )}

          {/* Live preview breadcrumb */}
          {mode === "create" && (accountType || code || name) && (
            <div className="rounded-lg border border-[#1B3A5C]/15 bg-gradient-to-l from-[#1B3A5C]/5 to-transparent px-4 py-2.5">
              <div className="text-[10px] font-semibold text-[#1B3A5C]/70 mb-1 tracking-wide">معاينة الموقع في الشجرة</div>
              <div className="flex items-center gap-1.5 flex-wrap text-[13px]">
                {typeMeta ? (
                  <span className={cn("px-2 py-0.5 rounded-md border text-[11px] font-semibold", typeMeta.bg, typeMeta.color)}>
                    {typeMeta.label}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-[11px]">اختر النوع…</span>
                )}
                {parentAccount && (
                  <>
                    <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono text-[11px] text-foreground/70" dir="ltr">{parentAccount.account_code}</span>
                    <span className="text-foreground/70 text-[11px]">— {parentAccount.account_name}</span>
                  </>
                )}
                {(code || name) && (
                  <>
                    <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-[#1B3A5C]/30 shadow-sm">
                      {code && <span className="font-mono text-[11px] font-bold text-[#1B3A5C]" dir="ltr">{code}</span>}
                      {name && <span className="text-[11px] font-semibold text-foreground">{name}</span>}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Fast Tabs */}
          <FastTabs items={sections} />

          {/* Sticky action bar (mobile/redundancy) */}
          <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 sticky bottom-2 shadow-sm">
            <Button type="submit" disabled={isLoading || !isValid} size="sm" className="gap-1.5 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 h-8">
              <Save className="w-3.5 h-3.5" />
              {isLoading ? "جاري الحفظ…" : "حفظ"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { handleReset(); setCodeManuallyEdited(false); }} className="gap-1.5 h-8">
              <RotateCcw className="w-3.5 h-3.5" />
              إعادة تعيين
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { if (mode === "create") clearDraft(); navigate("/accounts"); }} className="h-8">
              إلغاء
            </Button>
            {isValid && (
              <span className="ms-auto text-[11px] text-emerald-600 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                جاهز للحفظ
              </span>
            )}
          </div>
        </form>
      </SmartFormScope>
    </FinanceShell>
  );
};

export default AccountFormPage;

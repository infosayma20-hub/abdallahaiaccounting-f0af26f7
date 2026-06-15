import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Save, RotateCcw, Lock, Sparkles, Wand2, ChevronLeft, Hash, Tag, FolderTree, Scale, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import SmartFormScope from "@/components/forms/SmartFormScope";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";

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
}

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

  // Load accounts for parent selector
  useEffect(() => {
    if (!user) return;
    supabase.from("accounts").select("id, account_code, account_name, account_type, parent_code, description_ar, notes, is_system_protected")
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
    }
  }, [accountType]);

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
      if (mode === "create") {
        const { error } = await supabase.from("accounts").insert({
          user_id: user.id,
          account_code: code,
          account_name: name.trim(),
          account_type: accountType,
          parent_code: parentCode,
          description_ar: descriptionAr.trim() || null,
          notes: notes.trim() || null,
        });
        if (error) throw error;
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
        };
        if (!isProtected) updateData.account_code = code;

        const { error } = await supabase.from("accounts").update(updateData).eq("id", accountId!);
        if (error) throw error;
        toast({ title: "✅ تم حفظ التغييرات" });
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

  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)] dark:bg-background" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-4">
        <PageHeader
          title={mode === "create" ? "إنشاء حساب جديد" : "تعديل الحساب"}
          breadcrumb={["المحاسبة", "شجرة الحسابات", mode === "create" ? "حساب جديد" : existingAccount?.account_name || ""]}
        />

        {/* Back button */}
        <button onClick={() => { if (mode === "create") clearDraft(); navigate("/accounts"); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowRight className="w-4 h-4" />
          رجوع لشجرة الحسابات
        </button>

        {/* Auto-Draft Restore Banner */}
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
              <p className="text-sm font-semibold text-amber-800">حساب محمي</p>
              <p className="text-xs text-amber-700">هذا الحساب مرتبط بقيود محاسبية تلقائية. لا يمكن تغيير رمزه أو حذفه. يمكنك تعديل الاسم والوصف فقط.</p>
            </div>
          </div>
        )}

        {/* Live preview breadcrumb (Dynamics-style "what you're creating") */}
        {mode === "create" && (accountType || code || name) && (
          <div className="rounded-lg border-2 border-[#1B3A5C]/15 bg-gradient-to-l from-[#1B3A5C]/5 to-transparent px-4 py-3">
            <div className="text-[10px] font-semibold text-[#1B3A5C]/70 mb-1.5 tracking-wide">معاينة الموقع في الشجرة</div>
            <div className="flex items-center gap-1.5 flex-wrap text-sm">
              {typeMeta ? (
                <span className={cn("px-2 py-0.5 rounded-md border text-xs font-semibold", typeMeta.bg, typeMeta.color)}>
                  {typeMeta.label}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">اختر نوع الحساب…</span>
              )}
              {parentAccount && (
                <>
                  <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono text-xs text-foreground/70" dir="ltr">{parentAccount.account_code}</span>
                  <span className="text-foreground/70 text-xs">— {parentAccount.account_name}</span>
                </>
              )}
              {(code || name) && (
                <>
                  <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-[#1B3A5C]/30 shadow-sm">
                    {code && <span className="font-mono text-xs font-bold text-[#1B3A5C]" dir="ltr">{code}</span>}
                    {name && <span className="text-xs font-semibold text-foreground">{name}</span>}
                    {!name && !code && <span className="text-xs text-muted-foreground">حساب جديد</span>}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <SmartFormScope firstFieldSelector="[data-smart-first]">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-card rounded-lg border shadow-sm overflow-hidden">

          {/* ─── Section 1: التصنيف ─── */}
          <section className="px-6 py-5 border-b border-border/70 bg-gradient-to-b from-slate-50/50 to-transparent dark:from-slate-900/20">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#1B3A5C] text-white text-[11px] font-bold">1</span>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-[#1B3A5C]" />
                التصنيف والموقع
              </h3>
              <span className="text-[10px] text-muted-foreground">— حدد نوع الحساب وموقعه في الشجرة</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Type — chip selector for instant visual recall */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
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
                        data-smart-first={!isProtected && !accountType ? "true" : undefined}
                        className={cn(
                          "px-2.5 py-2 rounded-md border-2 text-xs font-semibold transition-all text-center",
                          "hover:shadow-sm hover:-translate-y-0.5",
                          selected
                            ? cn(t.bg, t.color, "border-current ring-2 ring-current/20")
                            : "border-border bg-background text-foreground/70 hover:border-[#1B3A5C]/30",
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

              {/* Parent — searchable select */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
                  حساب الأب
                  <span className="text-[10px] font-normal text-muted-foreground">(اختياري — اتركه فارغاً لحساب رئيسي)</span>
                </Label>
                <Select
                  value={parentCode ?? "__none__"}
                  onValueChange={(v) => { setParentCode(v === "__none__" ? null : v); setCodeManuallyEdited(false); }}
                  dir="rtl"
                  disabled={!!isProtected || !accountType}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={accountType ? "بدون أب — حساب رئيسي" : "اختر نوع الحساب أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">— بدون أب (حساب رئيسي) —</span>
                    </SelectItem>
                    {eligibleParents.map(p => (
                      <SelectItem key={p.id} value={p.account_code}>
                        <span className="font-mono text-[11px] text-muted-foreground me-2" dir="ltr">{p.account_code}</span>
                        {p.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* ─── Section 2: التعريف ─── */}
          <section className="px-6 py-5 border-b border-border/70">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#1B3A5C] text-white text-[11px] font-bold">2</span>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-[#1B3A5C]" />
                التعريف
              </h3>
              <span className="text-[10px] text-muted-foreground">— رقم الحساب يُقترح تلقائياً</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {/* Code — 2 cols, auto-filled */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                    رقم الحساب <span className="text-destructive">*</span>
                  </span>
                  {!isProtected && mode === "create" && !codeManuallyEdited && code && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-normal text-[#1B3A5C] bg-[#1B3A5C]/10 px-1.5 py-0.5 rounded">
                      <Wand2 className="w-2.5 h-2.5" /> تلقائي
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").substring(0, 6)); setCodeManuallyEdited(true); }}
                    placeholder={accountType ? "سيُقترح تلقائياً" : "اختر النوع أولاً"}
                    className={cn(
                      "font-mono text-center text-base font-bold tracking-wider h-11",
                      codeError && "border-destructive",
                      isProtected && "bg-muted",
                      !codeManuallyEdited && code && !isProtected && "bg-[#1B3A5C]/5 border-[#1B3A5C]/30"
                    )}
                    dir="ltr"
                    disabled={!!isProtected}
                  />
                </div>
                {codeError && <p className="text-[10px] text-destructive flex items-center gap-1"><span>⚠</span>{codeError}</p>}
                {!isProtected && mode === "create" && suggestedCode && code !== suggestedCode && (
                  <button
                    type="button"
                    onClick={() => { setCode(suggestedCode); setCodeManuallyEdited(false); }}
                    className="inline-flex items-center gap-1 text-[11px] text-[#1B3A5C] hover:underline font-medium"
                  >
                    <Sparkles className="w-3 h-3" />
                    استخدم المقترح: <span className="font-mono font-bold">{suggestedCode}</span>
                  </button>
                )}
              </div>

              {/* Name — 3 cols */}
              <div className="space-y-1.5 sm:col-span-3">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  اسم الحساب <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: رأس المال — الشريك أحمد"
                  dir="rtl"
                  className="h-11"
                />
              </div>

              {/* Balance nature — full row, segmented control */}
              <div className="space-y-1.5 sm:col-span-5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                  طبيعة الحساب <span className="text-destructive">*</span>
                  <span className="text-[10px] font-normal text-muted-foreground">(تُحدد تلقائياً حسب النوع)</span>
                </Label>
                <div className="inline-flex rounded-md border bg-background p-0.5 gap-0.5">
                  {(["debit", "credit"] as const).map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNaturalBalance(val)}
                      disabled={!!isProtected}
                      className={cn(
                        "px-4 py-1.5 rounded text-xs font-semibold transition-all min-w-[90px]",
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
              </div>
            </div>

            {/* Siblings reference panel */}
            {!isProtected && mode === "create" && siblings.length > 0 && (
              <div className="mt-4 rounded-md border bg-slate-50/60 dark:bg-slate-900/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <FolderTree className="w-3 h-3" />
                  {parentCode ? `الحسابات الفرعية الموجودة تحت ${parentCode}` : "الحسابات الرئيسية بنفس النوع"}
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
          </section>

          {/* ─── Section 3: تفاصيل إضافية ─── */}
          <section className="px-6 py-5 bg-slate-50/40 dark:bg-slate-900/10">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-400 text-white text-[11px] font-bold">3</span>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-500" />
                تفاصيل إضافية
              </h3>
              <span className="text-[10px] text-muted-foreground">— اختياري</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الوصف</Label>
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
                <Label className="text-xs font-semibold">ملاحظات داخلية</Label>
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
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-card border-t border-border/70 sticky bottom-0">
            <Button type="submit" disabled={isLoading || !isValid} className="gap-2 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
              <Save className="w-4 h-4" />
              {isLoading ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { handleReset(); setCodeManuallyEdited(false); }} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              إعادة تعيين
            </Button>
            <Button type="button" variant="ghost" onClick={() => { if (mode === "create") clearDraft(); navigate("/accounts"); }}>إلغاء</Button>
            {isValid && (
              <span className="ms-auto text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                جاهز للحفظ
              </span>
            )}
          </div>
        </form>
        </SmartFormScope>
      </div>
    </div>
  );
};

export default AccountFormPage;

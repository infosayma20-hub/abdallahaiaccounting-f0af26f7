import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Save, RotateCcw, Lock, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Owner's Equity", label: "حقوق الملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Purchases", label: "مشتريات" },
  { value: "Expenses", label: "مصروفات" },
];

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
    return "";
  }, [accounts, parentCode, mode]);

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 space-y-4">
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

        {/* Form */}
        <SmartFormScope firstFieldSelector="[data-smart-first]">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-card rounded-lg border p-6 space-y-5">
          {/* Row 1: Code + Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">رقم الحساب <span className="text-destructive">*</span></Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
                placeholder="مثال: 1125"
                className={cn("font-mono text-center", codeError && "border-destructive", isProtected && "bg-muted")}
                dir="ltr"
                disabled={!!isProtected}
                data-smart-first={isProtected ? undefined : "true"}
              />
              {codeError && <p className="text-[10px] text-destructive">{codeError}</p>}
              {!isProtected && mode === "create" && suggestedCode && code !== suggestedCode && (
                <button
                  type="button"
                  onClick={() => setCode(suggestedCode)}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Sparkles className="w-3 h-3" />
                  اقتراح: <span className="font-mono">{suggestedCode}</span> — انقر للاستخدام
                </button>
              )}
              {!isProtected && mode === "create" && siblings.length > 0 && (
                <div className="mt-1 rounded-md border bg-muted/30 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {parentCode ? `الأبناء الحاليون لـ ${parentCode}` : "حسابات رئيسية بنفس النوع"} ({siblings.length})
                  </p>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {siblings.slice(0, 30).map(s => (
                      <div key={s.id} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="font-mono text-foreground/80" dir="ltr">{s.account_code}</span>
                        <span className="truncate text-muted-foreground">{s.account_name}</span>
                      </div>
                    ))}
                    {siblings.length > 30 && (
                      <p className="text-[10px] text-muted-foreground text-center pt-1">... و {siblings.length - 30} حساب آخر</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم الحساب <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: البنك - حساب جاري" dir="rtl" data-smart-first={isProtected ? "true" : undefined} />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Row 2: Type + Parent */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">نوع الحساب <span className="text-destructive">*</span></Label>
              <Select value={accountType} onValueChange={(v) => { setAccountType(v); setParentCode(null); }} dir="rtl" disabled={!!isProtected}>
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">حساب الأب</Label>
              <Select value={parentCode ?? "__none__"} onValueChange={(v) => setParentCode(v === "__none__" ? null : v)} dir="rtl" disabled={!!isProtected}>
                <SelectTrigger><SelectValue placeholder="بدون أب (رئيسي)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون أب — حساب رئيسي</SelectItem>
                  {eligibleParents.map(p => (
                    <SelectItem key={p.id} value={p.account_code}>{p.account_code} — {p.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Row 3: Balance */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">طبيعة الحساب <span className="text-destructive">*</span></Label>
            <div className="flex items-center gap-6 h-10 px-3 rounded-md border bg-background">
              {(["debit", "credit"] as const).map(val => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="balance" value={val} checked={naturalBalance === val}
                    onChange={() => setNaturalBalance(val)} disabled={!!isProtected} className="w-3.5 h-3.5 accent-primary" />
                  <span className={cn("text-xs font-medium", val === "debit" ? "text-green-600" : "text-red-600")}>
                    {val === "debit" ? "مدين" : "دائن"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Row 4: Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">الوصف (اختياري)</Label>
            <Textarea value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder="وصف أو ملاحظات حول الحساب..." rows={3} dir="rtl" />
          </div>

          {/* Row 5: Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">ملاحظات (اختياري)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية..." rows={2} dir="rtl" />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isLoading || !isValid} className="gap-2 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
              <Save className="w-4 h-4" />
              {isLoading ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              إعادة تعيين
            </Button>
            <Button type="button" variant="ghost" onClick={() => { if (mode === "create") clearDraft(); navigate("/accounts"); }}>إلغاء</Button>
          </div>
        </form>
        </SmartFormScope>
      </div>
    </div>
  );
};

export default AccountFormPage;

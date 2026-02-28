import { useState, useMemo, useEffect, useCallback } from "react";
import { Loader2, Search, ChevronDown, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_system: boolean | null;
}

const accountTypeOptions = [
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Owner's Equity", label: "حقوق الملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Expenses", label: "مصروفات" },
];

const arabicTypeMap: Record<string, string> = {
  "إيرادات": "Revenue",
  "مصاريف": "Expenses",
  "مصروفات": "Expenses",
  "أصول": "Asset",
  "التزامات": "Liability",
  "خصوم": "Liability",
  "حقوق ملكية": "Owner's Equity",
  "مشتريات": "Purchases",
};

function normalizeType(type: string): string {
  return arabicTypeMap[type] || type;
}

const typeLabels: Record<string, string> = {
  "Asset": "أصول",
  "Liability": "التزامات",
  "Owner's Equity": "حقوق ملكية",
  "Equity": "حقوق ملكية",
  "Revenue": "إيرادات",
  "Purchases": "مشتريات",
  "Expenses": "مصروفات",
};

function getNaturalBalance(type: string): "debit" | "credit" {
  if (type === "Asset" || type === "Expenses" || type === "Purchases") return "debit";
  return "credit";
}

function getLevel(code: string): number {
  if (!code) return 2;
  if (code.endsWith("00") && code[2] === "0") return 0;
  if (code.endsWith("00")) return 1;
  return 2;
}

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onAdd: (data: {
    account_code: string;
    account_name: string;
    account_type: string;
    parent_code: string | null;
    notes: string | null;
  }) => Promise<boolean>;
}

export default function AddAccountDialog({ open, onOpenChange, accounts, onAdd }: AddAccountDialogProps) {
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [parentCode, setParentCode] = useState<string | null>(null);
  const [naturalBalance, setNaturalBalance] = useState<"debit" | "credit">("debit");
  const [accountLevel, setAccountLevel] = useState<"main" | "sub">("sub");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [parentOpen, setParentOpen] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);

  // Reset form
  const resetForm = useCallback(() => {
    setAccountCode("");
    setAccountName("");
    setAccountType("");
    setParentCode(null);
    setNaturalBalance("debit");
    setAccountLevel("sub");
    setNotes("");
    setParentSearch("");
    setCodeError("");
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  // Auto-set natural balance when type changes
  useEffect(() => {
    if (accountType) {
      setNaturalBalance(getNaturalBalance(accountType));
    }
  }, [accountType]);

  // When parent is selected, auto-set type and generate code
  useEffect(() => {
    if (parentCode) {
      const parent = accounts.find(a => a.account_code === parentCode);
      if (parent) {
        const pType = normalizeType(parent.account_type);
        setAccountType(pType);
        setAccountLevel("sub");

        // Generate next code under parent
        const prefix = parentCode.substring(0, 3);
        const siblings = accounts
          .filter(a => a.account_code.startsWith(prefix) && a.account_code !== parentCode)
          .map(a => parseInt(a.account_code))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);

        const parentNum = parseInt(parentCode);
        const lastSibling = siblings.length > 0 ? siblings[siblings.length - 1] : parentNum;
        const nextCode = String(lastSibling + 1).padStart(4, "0");

        // Only auto-set if user hasn't manually typed
        if (!accountCode || accountCode === String(lastSibling).padStart(4, "0")) {
          setAccountCode(nextCode);
        }
      }
    }
  }, [parentCode, accounts]);

  // Validate code uniqueness
  useEffect(() => {
    if (!accountCode) {
      setCodeError("");
      return;
    }
    if (!/^\d{4}$/.test(accountCode)) {
      setCodeError("يجب أن يكون 4 أرقام");
      return;
    }
    const exists = accounts.some(a => a.account_code === accountCode);
    setCodeError(exists ? "هذا الرقم مستخدم بالفعل" : "");
  }, [accountCode, accounts]);

  // Parent accounts filtered by selected type
  const parentAccounts = useMemo(() => {
    let filtered = accounts.filter(a => getLevel(a.account_code) <= 1);
    if (accountType) {
      filtered = filtered.filter(a => normalizeType(a.account_type) === accountType);
    }
    if (parentSearch.trim()) {
      const q = parentSearch.toLowerCase();
      filtered = filtered.filter(a => a.account_name.toLowerCase().includes(q) || a.account_code.includes(q));
    }
    return filtered.sort((a, b) => a.account_code.localeCompare(b.account_code));
  }, [accounts, accountType, parentSearch]);

  const selectedParent = parentCode ? accounts.find(a => a.account_code === parentCode) : null;

  const isValid = accountName.trim() && accountType && accountCode && /^\d{4}$/.test(accountCode) && !codeError;

  const handleSubmit = async (andNew: boolean) => {
    if (!isValid) return;
    setAdding(true);
    try {
      const success = await onAdd({
        account_code: accountCode,
        account_name: accountName.trim(),
        account_type: accountType,
        parent_code: parentCode,
        notes: notes.trim() || null,
      });
      if (success) {
        if (andNew) {
          resetForm();
        } else {
          onOpenChange(false);
        }
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] p-0 gap-0 overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[hsl(210,14%,89%)] dark:border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[hsl(240,10%,10%)] dark:text-foreground">
              إضافة حساب جديد
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Section 1: Basic Info */}
          <div>
            <p className="text-[11px] font-bold text-[hsl(210,10%,50%)] dark:text-muted-foreground uppercase tracking-wide mb-3">المعلومات الأساسية</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Account Code */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[hsl(240,10%,20%)] dark:text-foreground/90">
                  رقم الحساب <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value.replace(/\D/g, "").substring(0, 4))}
                  placeholder="مثال: 1125"
                  className={cn(
                    "font-mono text-center tracking-widest text-sm h-10",
                    codeError && "border-destructive focus-visible:ring-destructive"
                  )}
                  dir="ltr"
                  maxLength={4}
                />
                {codeError && <p className="text-[10px] text-destructive font-medium">{codeError}</p>}
              </div>

              {/* Account Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[hsl(240,10%,20%)] dark:text-foreground/90">
                  اسم الحساب <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="مثال: البنك - حساب جاري"
                  className="text-sm h-10"
                  dir="rtl"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[hsl(210,14%,91%)] dark:bg-border" />

          {/* Section 2: Classification */}
          <div>
            <p className="text-[11px] font-bold text-[hsl(210,10%,50%)] dark:text-muted-foreground uppercase tracking-wide mb-3">التصنيف</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Account Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[hsl(240,10%,20%)] dark:text-foreground/90">
                  نوع الحساب <span className="text-destructive">*</span>
                </Label>
                <Select value={accountType} onValueChange={(v) => { setAccountType(v); setParentCode(null); }} dir="rtl">
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {accountTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Parent Account */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[hsl(240,10%,20%)] dark:text-foreground/90">
                  حساب الأب
                </Label>
                <Popover open={parentOpen} onOpenChange={setParentOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full h-10 justify-between text-sm font-normal",
                        !parentCode && "text-muted-foreground"
                      )}
                    >
                      {selectedParent
                        ? `${selectedParent.account_code} - ${selectedParent.account_name}`
                        : "بدون أب (رئيسي)"}
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <div className="p-2 border-b border-[hsl(210,14%,89%)] dark:border-border">
                      <div className="relative">
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={parentSearch}
                          onChange={(e) => setParentSearch(e.target.value)}
                          placeholder="ابحث بالاسم أو الرقم..."
                          className="pr-8 h-8 text-xs"
                          dir="rtl"
                        />
                      </div>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto p-1">
                      {/* No parent option */}
                      <button
                        onClick={() => { setParentCode(null); setAccountLevel("main"); setParentOpen(false); }}
                        className={cn(
                          "w-full text-right px-3 py-2 text-xs rounded-md transition-colors",
                          parentCode === null
                            ? "bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,35%)] font-semibold"
                            : "hover:bg-muted text-foreground"
                        )}
                      >
                        بدون أب (حساب رئيسي)
                      </button>

                      {parentAccounts.map(acc => {
                        const level = getLevel(acc.account_code);
                        return (
                          <button
                            key={acc.id}
                            onClick={() => { setParentCode(acc.account_code); setParentOpen(false); }}
                            className={cn(
                              "w-full text-right px-3 py-2 text-xs rounded-md transition-colors flex items-center gap-2",
                              parentCode === acc.account_code
                                ? "bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,35%)] font-semibold"
                                : "hover:bg-muted text-foreground"
                            )}
                            style={{ paddingRight: level === 1 ? 28 : 12 }}
                          >
                            <span className="font-mono text-[11px] text-muted-foreground shrink-0">{acc.account_code}</span>
                            <span className={cn("truncate", level === 0 && "font-bold")}>{acc.account_name}</span>
                          </button>
                        );
                      })}
                      {parentAccounts.length === 0 && (
                        <p className="text-center text-xs text-muted-foreground py-4">
                          {accountType ? "لا توجد حسابات رئيسية من هذا النوع" : "اختر نوع الحساب أولاً"}
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[hsl(210,14%,91%)] dark:bg-border" />

          {/* Section 3: Accounting Settings */}
          <div>
            <p className="text-[11px] font-bold text-[hsl(210,10%,50%)] dark:text-muted-foreground uppercase tracking-wide mb-3">الإعدادات المحاسبية</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Natural Balance */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[hsl(240,10%,20%)] dark:text-foreground/90">
                  الرصيد الطبيعي
                </Label>
                <RadioGroup
                  value={naturalBalance}
                  onValueChange={(v) => setNaturalBalance(v as "debit" | "credit")}
                  className="flex items-center gap-4 h-10 px-3 rounded-md border border-input bg-background"
                  dir="rtl"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="debit" id="debit" className="h-3.5 w-3.5" />
                    <Label htmlFor="debit" className={cn("text-xs cursor-pointer font-medium", naturalBalance === "debit" ? "text-[hsl(142,71%,40%)]" : "text-muted-foreground")}>مدين</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="credit" id="credit" className="h-3.5 w-3.5" />
                    <Label htmlFor="credit" className={cn("text-xs cursor-pointer font-medium", naturalBalance === "credit" ? "text-[hsl(0,72%,51%)]" : "text-muted-foreground")}>دائن</Label>
                  </div>
                </RadioGroup>
                {accountType && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    يتحدد تلقائياً حسب النوع
                  </p>
                )}
              </div>

              {/* Account Level */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[hsl(240,10%,20%)] dark:text-foreground/90">
                  مستوى الحساب
                </Label>
                <RadioGroup
                  value={accountLevel}
                  onValueChange={(v) => setAccountLevel(v as "main" | "sub")}
                  className="flex items-center gap-4 h-10 px-3 rounded-md border border-input bg-background"
                  dir="rtl"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="main" id="main" className="h-3.5 w-3.5" />
                    <Label htmlFor="main" className="text-xs cursor-pointer font-medium">رئيسي</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="sub" id="sub" className="h-3.5 w-3.5" />
                    <Label htmlFor="sub" className="text-xs cursor-pointer font-medium">فرعي</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[hsl(210,14%,91%)] dark:bg-border" />

          {/* Section 4: Notes */}
          <div>
            <p className="text-[11px] font-bold text-[hsl(210,10%,50%)] dark:text-muted-foreground uppercase tracking-wide mb-3">ملاحظات (اختياري)</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="وصف أو ملاحظات حول الحساب..."
              className="text-sm resize-none h-16"
              dir="rtl"
            />
          </div>
        </div>

        {/* Live Preview */}
        {(accountCode || accountName) && (
          <div className="px-6 py-2.5 bg-[hsl(210,20%,97%)] dark:bg-muted/20 border-t border-[hsl(210,14%,89%)] dark:border-border">
            <p className="text-[11px] text-[hsl(210,10%,42%)] dark:text-muted-foreground">
              <span className="font-semibold">سيتم إنشاء:</span>{" "}
              <span className="font-mono font-bold text-[hsl(240,10%,10%)] dark:text-foreground">[{accountCode || "----"}]</span>{" "}
              <span className="font-bold text-[hsl(240,10%,10%)] dark:text-foreground">{accountName || "---"}</span>
              {selectedParent && (
                <>
                  {" "}
                  <span className="text-muted-foreground">تحت:</span>{" "}
                  <span className="font-mono">{selectedParent.account_code}</span>{" "}
                  <span>{selectedParent.account_name}</span>
                </>
              )}
              {" | "}
              <span className={cn(
                "font-semibold",
                naturalBalance === "debit" ? "text-[hsl(142,71%,40%)]" : "text-[hsl(0,72%,51%)]"
              )}>
                {naturalBalance === "debit" ? "مدين" : "دائن"}
              </span>
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[hsl(210,14%,89%)] dark:border-border flex items-center gap-2 bg-white dark:bg-card">
          <Button
            onClick={() => handleSubmit(false)}
            disabled={adding || !isValid}
            className="flex-1 h-10 bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,38%)] text-white rounded-lg text-sm font-semibold"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            disabled={adding || !isValid}
            variant="outline"
            className="h-10 rounded-lg text-sm font-medium"
          >
            إضافة وجديد
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="ghost"
            className="h-10 rounded-lg text-sm text-muted-foreground"
          >
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

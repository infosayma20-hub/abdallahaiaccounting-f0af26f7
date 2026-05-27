import { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Send, Loader2, BookOpen, Calendar, FileText, DollarSign,
  Plus, Trash2, ChevronDown, Search, AlertTriangle, Eye, Copy,
  Bookmark, CheckCircle2, UserPlus, Building2, PlusCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { multiWordMatchAny } from "@/lib/utils";
import useModalDraft from "@/hooks/useModalDraft";
import useJournalKeyboard, { focusNextJournalCell } from "@/hooks/useJournalKeyboard";
import JournalBalanceBar from "@/components/journal/JournalBalanceBar";
import JournalTemplatesPicker from "@/components/journal/JournalTemplatesPicker";
import type { JournalTemplate as SavedJournalTemplate } from "@/hooks/useJournalTemplates";
import { useSaveJournalVoucher } from "@/hooks/useSaveJournalVoucher";
import AccountCombobox from "@/components/finance/AccountCombobox";

/* ── Types ── */
interface AccountRow {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string;
}

interface JournalEntryPopupProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
  accounts?: { id: string; name: string; type: string }[];
}

const uid = () => Math.random().toString(36).slice(2, 9);

const emptyLine = (): JournalLine => ({
  id: uid(),
  account_code: "",
  account_name: "",
  debit: 0,
  credit: 0,
  memo: "",
});

/* ── Account Search Dropdown ── */
const AccountSearchDropdown = ({
  accounts,
  value,
  onSelect,
  onAddAccount,
  onAddContact,
}: {
  accounts: AccountRow[];
  value: string;
  onSelect: (acc: AccountRow) => void;
  onAddAccount: () => void;
  onAddContact: (type: "customer" | "supplier") => void;
}) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    return accounts
      .filter(a => multiWordMatchAny(search, a.account_code, a.account_name))
      .slice(0, 20);
  }, [accounts, search]);

  // Group by type
  const grouped = useMemo(() => {
    const map = new Map<string, AccountRow[]>();
    filtered.forEach(a => {
      const g = a.account_type || "أخرى";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(a);
    });
    return map;
  }, [filtered]);

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-1 h-9 bg-secondary/50 rounded-lg px-2 cursor-pointer border border-border/30 hover:border-primary/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3 w-3 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={open ? search : value}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="ابحث بالرقم أو الاسم..."
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-w-0"
        />
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-150">
          {grouped.size === 0 && (
            <div className="p-3 text-xs text-muted-foreground text-center">لا توجد نتائج</div>
          )}
          {Array.from(grouped.entries()).map(([type, accs]) => (
            <div key={type}>
              <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground bg-muted/30 sticky top-0">
                ── {type} ──
              </div>
              {accs.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { onSelect(acc); setSearch(""); setOpen(false); }}
                  className="w-full text-right px-3 py-2 text-xs hover:bg-primary/10 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="font-mono text-muted-foreground text-[10px]">{acc.account_code}</span>
                  <span className="flex-1 text-foreground truncate">{acc.account_name}</span>
                </button>
              ))}
            </div>
          ))}
          {/* Quick-add actions */}
          <div className="border-t border-border/40 p-1.5 space-y-0.5">
            <button onClick={() => { onAddAccount(); setOpen(false); }}
              className="w-full text-right px-3 py-2 text-xs hover:bg-primary/10 rounded-lg flex items-center gap-2 text-primary font-medium">
              <PlusCircle className="h-3.5 w-3.5" /> إضافة حساب جديد
            </button>
            <button onClick={() => { onAddContact("customer"); setOpen(false); }}
              className="w-full text-right px-3 py-2 text-xs hover:bg-primary/10 rounded-lg flex items-center gap-2 text-primary font-medium">
              <UserPlus className="h-3.5 w-3.5" /> إضافة زبون جديد
            </button>
            <button onClick={() => { onAddContact("supplier"); setOpen(false); }}
              className="w-full text-right px-3 py-2 text-xs hover:bg-primary/10 rounded-lg flex items-center gap-2 text-primary font-medium">
              <Building2 className="h-3.5 w-3.5" /> إضافة مورد جديد
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Quick Add Account Dialog ── */
const QuickAddAccountDialog = ({
  open, onClose, accounts, userId, onCreated,
}: {
  open: boolean; onClose: () => void; accounts: AccountRow[]; userId: string;
  onCreated: (acc: AccountRow) => void;
}) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState("أصول");
  const [parentCode, setParentCode] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestedCode = useMemo(() => {
    if (!parentCode) return "";
    const children = accounts.filter(a => a.account_code.startsWith(parentCode) && a.account_code.length === parentCode.length + 2);
    const maxSuffix = children.reduce((m, a) => Math.max(m, parseInt(a.account_code.slice(parentCode.length)) || 0), 0);
    return parentCode + String(maxSuffix + 1).padStart(2, "0");
  }, [parentCode, accounts]);

  const parentAccounts = useMemo(() =>
    accounts.filter(a => a.account_code.length <= 4).sort((a, b) => a.account_code.localeCompare(b.account_code)),
    [accounts]
  );

  const handleSave = async () => {
    if (!name || !suggestedCode) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("accounts").insert({
        user_id: userId,
        account_code: suggestedCode,
        account_name: name,
        account_type: type,
        parent_code: parentCode || null,
      }).select().single();
      if (error) throw error;
      toast({ title: "✅ تم إضافة الحساب" });
      onCreated(data as AccountRow);
      onClose();
      setName(""); setParentCode("");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" /> حساب جديد سريع
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">حساب الأب</label>
            <Select value={parentCode} onValueChange={setParentCode}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر حساب الأب" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {parentAccounts.map(a => (
                  <SelectItem key={a.account_code} value={a.account_code} className="text-xs">
                    {a.account_code} - {a.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">رقم الحساب</label>
            <Input value={suggestedCode} readOnly className="h-9 text-xs bg-muted/50 font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">اسم الحساب*</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-xs" placeholder="مثال: سلف رهام حسون" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">نوع الحساب</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["أصول", "التزامات", "حقوق ملكية", "إيرادات", "مصروفات"].map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving || !name || !suggestedCode} className="w-full h-9 text-xs gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            إضافة واختيار
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Quick Add Contact Dialog ── */
const QuickAddContactDialog = ({
  open, onClose, contactType, userId, onCreated,
}: {
  open: boolean; onClose: () => void; contactType: "customer" | "supplier";
  userId: string; onCreated: (acc: AccountRow) => void;
}) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const isCustomer = contactType === "customer";
  const accountPrefix = isCustomer ? "1130" : "2110";

  // ─── Auto-draft للـ modal: عزل كامل حسب user + نوع جهة الاتصال ───
  const { clearModalDraft } = useModalDraft(
    "quick_add_contact",
    { name, phone },
    (d) => {
      if (typeof d?.name === "string") setName(d.name);
      if (typeof d?.phone === "string") setPhone(d.phone);
    },
    {
      enabled: open && !!userId,
      scope: `${userId || "anon"}:${contactType}`,
      isEmpty: (d) => !d.name?.trim() && !d.phone?.trim(),
      version: 1,
    }
  );

  const handleDismiss = () => {
    clearModalDraft();
    setName(""); setPhone("");
    onClose();
  };

  const handleSave = async () => {
    if (!name) return;
    setSaving(true);
    try {
      // Create contact
      const { error: contactErr } = await supabase.from("contacts").insert({
        user_id: userId,
        contact_name: name,
        contact_type: isCustomer ? "عميل" : "مورد",
        phone: phone || null,
        linked_account_code: accountPrefix,
      });
      if (contactErr) throw contactErr;

      toast({ title: `✅ تم إضافة ${isCustomer ? "الزبون" : "المورد"}` });

      // Return a virtual account row pointing to the master account
      const masterAcc: AccountRow = {
        id: uid(),
        account_code: accountPrefix,
        account_name: isCustomer ? `ذمم عملاء - ${name}` : `ذمم موردين - ${name}`,
        account_type: isCustomer ? "أصول" : "التزامات",
      };
      onCreated(masterAcc);
      clearModalDraft();
      onClose();
      setName(""); setPhone("");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            {isCustomer ? <UserPlus className="h-4 w-4 text-primary" /> : <Building2 className="h-4 w-4 text-primary" />}
            {isCustomer ? "زبون جديد سريع" : "مورد جديد سريع"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">الاسم*</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">الهاتف</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-9 text-xs" dir="ltr" />
          </div>
          <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">سيُنشأ تلقائياً:</p>
            <p>✅ حساب محاسبي: {accountPrefix}</p>
            <p>✅ كرت في {isCustomer ? "الزبائن" : "الموردين"}</p>
          </div>
          <Button onClick={handleSave} disabled={saving || !name} className="w-full h-9 text-xs gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            إضافة واختيار
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ══════════════════════════════════════════════════════════
   ██  MAIN COMPONENT
   ══════════════════════════════════════════════════════════ */
const JournalEntryPopup = ({ open, onClose, onSuccess, initialData, accounts: propAccounts }: JournalEntryPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { save: saveJournalVoucher } = useSaveJournalVoucher();

  // Data
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Form state
  const [entryType, setEntryType] = useState("عادي");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);

  // UI state
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactType, setAddContactType] = useState<"customer" | "supplier">("customer");
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedEntryRef, setSavedEntryRef] = useState("");
  const [showTemplatesLibrary, setShowTemplatesLibrary] = useState(false);

  // Load accounts from Supabase
  useEffect(() => {
    if (!open || !user) return;
    const load = async () => {
      setLoadingAccounts(true);
      const { data } = await supabase
        .from("accounts")
        .select("id, account_code, account_name, account_type")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("account_code");
      setAccounts(data || []);
      setLoadingAccounts(false);
    };
    load();
  }, [open, user]);

  // Generate sequential reference from DB
  useEffect(() => {
    if (open && !reference && user) {
      (async () => {
        const { data } = await supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }).limit(1);
        const lastRef = (data || [])[0]?.ref_number || "";
        const match = lastRef.match(/(\d+)$/);
        const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
        setReference(`QV-${new Date().getFullYear()}-${nextNum}`);
      })();
    }
  }, [open, user]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setLines([emptyLine(), emptyLine()]);
      setDescription(""); setNotes(""); setReference("");
      setEntryType("عادي"); setShowPreview(false); setShowSuccess(false);
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [open]);

  /* ── Calculations ── */
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && totalCredit > 0 && difference === 0;

  /* ── Validation ── */
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (lines.length < 2) errs.push("القيد يحتاج على الأقل سطرين");
    if (totalDebit !== totalCredit) errs.push(`الميزان غير متوازن: مدين ₪${totalDebit.toLocaleString()} ≠ دائن ₪${totalCredit.toLocaleString()} | الفرق: ₪${difference.toLocaleString()}`);
    lines.forEach((l, i) => {
      if (!l.account_code) errs.push(`السطر ${i + 1}: يجب اختيار حساب`);
      if (l.debit === 0 && l.credit === 0) errs.push(`السطر ${i + 1}: يجب إدخال مبلغ`);
      if (l.debit > 0 && l.credit > 0) errs.push(`السطر ${i + 1}: لا يمكن مدين ودائن معاً`);
    });
    if (!description.trim()) errs.push("يجب إدخال وصف للقيد");
    return errs;
  }, [lines, totalDebit, totalCredit, difference, description]);

  const canSubmit = validationErrors.length === 0 && !sending;

  /* ── Line operations ── */
  const updateLine = (idx: number, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      // Auto-clear opposite side
      if (field === "debit" && value > 0) updated.credit = 0;
      if (field === "credit" && value > 0) updated.debit = 0;
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const removeLineById = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const duplicateLineById = (id: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const copy: JournalLine = { ...prev[idx], id: uid() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const addLineAndFocus = () => {
    const newLine = emptyLine();
    setLines(prev => [...prev, newLine]);
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-journal-debit="${newLine.id}"]`)?.focus();
    }, 50);
  };

  // Power-user keyboard shortcuts (only active when modal is open)
  useJournalKeyboard({
    enabled: open && !showSuccess && !showPreview,
    onSave: () => { if (canSubmit) handleSubmit(); },
    onAddRow: addLineAndFocus,
    onDuplicateRow: duplicateLineById,
    onDeleteRow: removeLineById,
  });

  /* ── Apply a SAVED template (from DB library — single source of truth) ── */
  const applySavedTemplate = (tpl: SavedJournalTemplate) => {
    const newLines: JournalLine[] = tpl.lines.map(l => {
      const acc = accounts.find(a => a.account_code === l.account_code);
      return {
        id: uid(),
        account_code: l.account_code || "",
        account_name: acc?.account_name || l.account_name || "",
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        memo: l.memo || "",
      };
    });
    while (newLines.length < 2) newLines.push(emptyLine());
    setLines(newLines);
    if (!description && tpl.description) setDescription(tpl.description);
    if (!description && tpl.name) setDescription(tpl.name);
    if (tpl.default_subtype) {
      const map: Record<string, string> = { normal: "عادي", opening: "افتتاحي", adjustment: "تسوية", closing: "إقفال" };
      setEntryType(map[tpl.default_subtype] || "عادي");
    }
  };

  /* ── Account selection from dropdown ── */
  const handleAccountSelect = (idx: number, acc: AccountRow) => {
    updateLine(idx, "account_code", acc.account_code);
    updateLine(idx, "account_name", acc.account_name);
  };

  const handleAccountCreated = (acc: AccountRow) => {
    setAccounts(prev => [...prev, acc]);
    handleAccountSelect(activeLineIdx, acc);
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSending(true);
    try {
      // ✅ Source of Truth الموحّد: ينشئ voucher + voucher_lines + transactions atomically
      const subtypeMap: Record<string, "normal" | "opening" | "adjustment" | "closing"> = {
        "عادي": "normal",
        "افتتاحي": "opening",
        "تسوية": "adjustment",
        "إقفال": "closing",
        "إقفالي": "closing",
      };
      const subtype = subtypeMap[entryType] || "normal";

      const result = await saveJournalVoucher({
        ref_number: reference,
        date,
        subtype,
        description,
        notes: notes || null,
        contact_id: null,
        lines: lines.map((l) => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          line_comment: l.memo || null,
        })),
        mode: "posted",
      });

      if (!result.success) {
        throw new Error(result.error || "فشل حفظ السند");
      }

      setSavedEntryRef(result.ref_number || reference);
      setShowSuccess(true);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setShowSuccess(false);
    onClose();
  };

  const handleSuccessNewEntry = async () => {
    setShowSuccess(false);
    setLines([emptyLine(), emptyLine()]);
    setDescription(""); setNotes(""); setReference("");
    setDate(new Date().toISOString().split("T")[0]);
    // Re-generate sequential ref
    if (user) {
      const { data } = await supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }).limit(1);
      const lastRef = (data || [])[0]?.ref_number || "";
      const match = lastRef.match(/(\d+)$/);
      const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
      setReference(`QV-${new Date().getFullYear()}-${nextNum}`);
    }
    onSuccess();
  };

  if (!open) return null;

  /* ── Success Screen ── */
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative w-full max-w-sm mx-4 bg-card rounded-2xl border border-border/50 shadow-2xl p-6 animate-in zoom-in-95 duration-300 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">تم إنشاء القيد بنجاح ✅</h3>
          <p className="text-sm text-muted-foreground font-mono">{savedEntryRef}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => { onSuccess(); handleClose(); }} className="gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" /> عرض في اليومية
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(savedEntryRef); toast({ title: "تم النسخ" }); }}>
              <Copy className="h-3.5 w-3.5" /> نسخ المرجع
            </Button>
          </div>
          <Button onClick={handleSuccessNewEntry} className="w-full gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> قيد جديد
          </Button>
        </div>
      </div>
    );
  }

  /* ── Preview Screen ── */
  if (showPreview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
        <div className="relative w-full max-w-lg mx-4 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-4 border-b border-border/30 bg-primary/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">معاينة القيد المحاسبي</h3>
              <p className="text-[10px] text-muted-foreground">{reference} | {date}</p>
            </div>
            <button onClick={() => setShowPreview(false)} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs font-medium text-foreground">{description}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-right py-2 font-semibold text-muted-foreground">الحساب</th>
                  <th className="text-left py-2 font-semibold text-primary w-24">مدين ₪</th>
                  <th className="text-left py-2 font-semibold text-destructive w-24">دائن ₪</th>
                </tr>
              </thead>
              <tbody>
                {lines.filter(l => l.account_code).map(l => (
                  <tr key={l.id} className="border-b border-border/20">
                    <td className="py-2 text-foreground">{l.account_code} {l.account_name}</td>
                    <td className="py-2 text-left font-bold text-primary tabular-nums">{l.debit > 0 ? `₪${l.debit.toLocaleString()}` : "—"}</td>
                    <td className="py-2 text-left font-bold text-destructive tabular-nums">{l.credit > 0 ? `₪${l.credit.toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary/20 font-bold">
                  <td className="py-2 text-foreground">الإجمالي</td>
                  <td className="py-2 text-left text-primary tabular-nums">₪{totalDebit.toLocaleString()}</td>
                  <td className="py-2 text-left text-destructive tabular-nums">₪{totalCredit.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            {isBalanced && (
              <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 rounded-lg p-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> القيد متوازن ✅
              </div>
            )}
          </div>
          <div className="p-4 border-t border-border/30 flex gap-2">
            <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1 text-xs">تعديل</Button>
            <Button onClick={() => { setShowPreview(false); handleSubmit(); }} disabled={!canSubmit} className="flex-1 text-xs gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> تأكيد وحفظ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ══ MAIN FORM ══ */
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl mx-4 mb-4 sm:mb-0 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-primary/5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">سند قيد جديد</h3>
              <p className="text-[10px] text-muted-foreground font-mono">{reference}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Templates button — opens unified library (single source of truth) */}
            <button
              onClick={() => setShowTemplatesLibrary(true)}
              className="h-8 px-3 rounded-lg bg-secondary hover:bg-secondary/80 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Bookmark className="h-3.5 w-3.5" /> القوالب
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Entry type selector */}
          <div className="flex items-center gap-2">
            {["عادي", "افتتاحي", "تسوية", "إقفال"].map(t => (
              <button
                key={t}
                onClick={() => setEntryType(t)}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                  entryType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Date + Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> التاريخ
              </label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> المرجع
              </label>
              <Input value={reference} onChange={e => setReference(e.target.value)} className="h-9 text-xs font-mono" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">الوصف *</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="مثال: سلفة راتب - رهام حسون" className="h-9 text-xs" />
          </div>

          {/* Lines table */}
          <div className="border border-border/40 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[32px_1fr_100px_100px_32px] gap-1 bg-muted/40 px-2 py-2 text-[10px] font-bold text-muted-foreground">
              <span>#</span>
              <span>الحساب</span>
              <span className="text-center text-primary">مدين ₪</span>
              <span className="text-center text-destructive">دائن ₪</span>
              <span></span>
            </div>

            {/* Lines */}
            {lines.map((line, idx) => (
              <div key={line.id} data-journal-line-id={line.id} className="grid grid-cols-[32px_1fr_100px_100px_32px] gap-1 px-2 py-1.5 border-t border-border/20 items-center hover:bg-muted/10">
                <span className="text-[10px] text-muted-foreground text-center">{idx + 1}</span>
                <AccountSearchDropdown
                  accounts={accounts}
                  value={line.account_code ? `${line.account_code} ${line.account_name}` : ""}
                  onSelect={(acc) => handleAccountSelect(idx, acc)}
                  onAddAccount={() => { setActiveLineIdx(idx); setShowAddAccount(true); }}
                  onAddContact={(t) => { setActiveLineIdx(idx); setAddContactType(t); setShowAddContact(true); }}
                />
                <input
                  type="number"
                  value={line.debit || ""}
                  onChange={e => updateLine(idx, "debit", Number(e.target.value) || 0)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      focusNextJournalCell("debit", line.id, lines.map(l => l.id), addLineAndFocus);
                    }
                  }}
                  data-journal-debit={line.id}
                  placeholder="0"
                  className="h-8 w-full bg-primary/5 rounded-lg px-2 text-xs text-center font-bold text-primary outline-none focus:ring-1 focus:ring-primary/30 tabular-nums"
                  dir="ltr"
                />
                <input
                  type="number"
                  value={line.credit || ""}
                  onChange={e => updateLine(idx, "credit", Number(e.target.value) || 0)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      focusNextJournalCell("credit", line.id, lines.map(l => l.id), addLineAndFocus);
                    }
                  }}
                  data-journal-credit={line.id}
                  placeholder="0"
                  className="h-8 w-full bg-destructive/5 rounded-lg px-2 text-xs text-center font-bold text-destructive outline-none focus:ring-1 focus:ring-destructive/30 tabular-nums"
                  dir="ltr"
                />
                <button
                  onClick={() => removeLine(idx)}
                  disabled={lines.length <= 2}
                  className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center transition-colors disabled:opacity-20"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}

            {/* Add line */}
            <button onClick={addLineAndFocus} className="w-full px-4 py-2 text-xs text-primary font-medium hover:bg-primary/5 transition-colors flex items-center gap-1.5 border-t border-border/20">
              <Plus className="h-3.5 w-3.5" /> إضافة سطر
              <span className="ms-auto hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border/40 font-mono">Enter</kbd>
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border/40 font-mono">Alt+N</kbd>
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border/40 font-mono">Ctrl+Enter</kbd>
              </span>
            </button>
          </div>

          {/* High-visibility balance bar */}
          <JournalBalanceBar totalDebit={totalDebit} totalCredit={totalCredit} variant="inline" />

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">ملاحظات (اختياري)</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." className="text-xs min-h-[60px] resize-none" />
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (totalDebit > 0 || totalCredit > 0) && (
            <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/15 space-y-1">
              {validationErrors.map((err, i) => (
                <p key={i} className="text-[11px] text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {err}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/30 flex gap-2 shrink-0">
          <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1 gap-1.5 text-xs h-10">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "جاري الإنشاء..." : "إنشاء القيد"}
          </Button>
          <Button variant="outline" onClick={() => setShowPreview(true)} disabled={lines.filter(l => l.account_code).length < 2} className="gap-1.5 text-xs h-10">
            <Eye className="h-4 w-4" /> معاينة
          </Button>
          <Button variant="ghost" onClick={onClose} className="text-xs h-10">إلغاء</Button>
        </div>
      </div>

      {/* Sub-dialogs */}
      <QuickAddAccountDialog
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        accounts={accounts}
        userId={user?.id || ""}
        onCreated={handleAccountCreated}
      />
      <QuickAddContactDialog
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        contactType={addContactType}
        userId={user?.id || ""}
        onCreated={handleAccountCreated}
      />

      {/* Saved templates library (DB-backed) */}
      <JournalTemplatesPicker
        open={showTemplatesLibrary}
        onClose={() => setShowTemplatesLibrary(false)}
        onApply={applySavedTemplate}
        currentSnapshot={{
          name: description || "قالب جديد",
          description: description,
          default_subtype: entryType === "افتتاحي" ? "opening" : entryType === "تسوية" ? "adjustment" : entryType === "إقفال" ? "closing" : "normal",
          default_contact_id: null,
          lines: lines.map(l => ({
            account_code: l.account_code,
            account_name: l.account_name,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            memo: l.memo || "",
          })),
        }}
      />
    </div>
  );
};

export default JournalEntryPopup;

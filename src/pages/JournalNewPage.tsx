import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate, useSearchParams } from "react-router-dom";
import DuplicateBanner from "@/components/DuplicateBanner";
import {
  CheckCircle, Printer, Save, Search, Plus, Trash2, Loader2,
  BookOpen, User, Building2, Users, X, UserPlus, Upload, Paperclip, ChevronDown, Clock,
  FileText, Scale, AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VoucherNavToolbar from "@/components/VoucherNavToolbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SmartFormScope from "@/components/forms/SmartFormScope";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { multiWordMatchAny } from "@/lib/utils";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";
import { useFastEntryMode } from "@/hooks/useFastEntryMode";
import useJournalKeyboard, { focusNextJournalCell } from "@/hooks/useJournalKeyboard";
import JournalBalanceBar from "@/components/journal/JournalBalanceBar";
import JournalTemplatesPicker from "@/components/journal/JournalTemplatesPicker";
import type { JournalTemplate } from "@/hooks/useJournalTemplates";
import { Bookmark } from "lucide-react";
import { useSaveJournalVoucher } from "@/hooks/useSaveJournalVoucher";
import AccountingShell from "@/components/layout/AccountingShell";

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  contact_id?: string;
  contact_name?: string;
  line_comment?: string;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  current_balance: number;
}

const subtypeLabels: Record<string, string> = { normal: "عادي", opening: "افتتاحي", adjustment: "تسوية", closing: "إقفالي" };

const JournalNewPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { company } = useCompany();
  const { save: saveJournalVoucher } = useSaveJournalVoucher();

  const fromDuplicate = searchParams.get("from_duplicate") === "true";
  const [duplicateSourceRef, setDuplicateSourceRef] = useState<string | null>(null);

  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formSubtype, setFormSubtype] = useState("normal");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedRefNumber, setSavedRefNumber] = useState("");
  const [fastEntryEnabled] = useFastEntryMode();
  const [lineSortOrder, setLineSortOrder] = useState<"debit_first" | "original">("original");
  const [draftReady, setDraftReady] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size: number; type: string; uploaded_at: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accountSearches, setAccountSearches] = useState<Record<string, string>>({});
  const [lineContactSearches, setLineContactSearches] = useState<Record<string, string>>({});

  // Invalid line IDs (highlighted on failed save attempt)
  const [invalidLineIds, setInvalidLineIds] = useState<Set<string>>(new Set());

  // Postable accounts only (exclude parents — any code referenced as parent_code is a parent)
  const postableAccounts = useMemo(() => {
    const parentCodes = new Set(
      accounts.map((a: any) => a.parent_code).filter(Boolean)
    );
    return accounts.filter((a: any) => !parentCodes.has(a.account_code));
  }, [accounts]);

  // Quick-add contact state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForLineId, setQuickAddForLineId] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddType, setQuickAddType] = useState<"customer" | "supplier">("customer");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [lines, setLines] = useState<JournalLine[]>([
    { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
    { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
  ]);

  // ─── Auto-Draft (سند القيد) ───
  const journalDraftSnapshot = useMemo(() => ({
    formDate, formRefNumber, formSubtype, formDescription, formNotes,
    formContactId, lines, attachments, lineSortOrder,
  }), [formDate, formRefNumber, formSubtype, formDescription, formNotes, formContactId, lines, attachments, lineSortOrder]);

  const applyJournalDraft = useCallback((d: any) => {
    if (d.formDate) setFormDate(d.formDate);
    if (d.formRefNumber) setFormRefNumber(d.formRefNumber);
    if (d.formSubtype) setFormSubtype(d.formSubtype);
    if (d.formDescription !== undefined) setFormDescription(d.formDescription);
    if (d.formNotes !== undefined) setFormNotes(d.formNotes);
    if (d.formContactId !== undefined) setFormContactId(d.formContactId);
    if (Array.isArray(d.lines) && d.lines.length >= 2) setLines(d.lines);
    if (Array.isArray(d.attachments)) setAttachments(d.attachments);
    if (d.lineSortOrder) setLineSortOrder(d.lineSortOrder);
    toast.success("تم استعادة المسودة");
  }, []);

  const isJournalDraftEmpty = useCallback((d: any) => {
    const hasContent = d.formDescription || d.formNotes || d.formContactId ||
      (d.lines || []).some((l: any) => l.account_code || Number(l.debit) > 0 || Number(l.credit) > 0);
    return !hasContent;
  }, []);

  const { hasDraft, restoreDraft, clearDraft, draftSavedAt } = useFormDraft(
    "journal_new",
    journalDraftSnapshot,
    applyJournalDraft,
    {
      enabled: !fromDuplicate,
      version: 1,
      isEmpty: isJournalDraftEmpty,
      routePath: "/finance/journal/new",
      scope: [user?.id || "anon", company?.id || "no-company", "/finance/journal/new", "new"].join(":"),
      ready: draftReady,
    }
  );

  // ─── Load Duplicate Data ───
  useEffect(() => {
    if (!fromDuplicate) return;
    const draftKey = "draft_journal_new";
    const draft = localStorage.getItem(draftKey);
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      localStorage.removeItem(draftKey);
      setDuplicateSourceRef(data._sourceRef || null);
      if (data.description) setFormDescription(data.description);
      if (data.notes) setFormNotes(data.notes);
      if (data.subtype) setFormSubtype(data.subtype);
      if (data.contactId) setFormContactId(data.contactId);
      if (data.lines?.length) {
        setLines(data.lines.map((l: any, i: number) => ({
          id: String(Date.now() + i),
          account_code: l.account_code || "",
          account_name: l.account_name || "",
          debit: l.debit || 0,
          credit: l.credit || 0,
          contact_id: l.contact_id || "",
          contact_name: l.contact_name || "",
        })));
      }
      // Date is today (default), ref number auto-generated
    } catch (e) { /* ignore */ }
  }, [fromDuplicate]);

  // Load data
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true).order("account_code"),
      supabase.from("contacts").select("id, contact_name, contact_type, current_balance").eq("user_id", user.id).neq("is_archived", true),
    ]).then(([aRes, cRes]) => {
      setAccounts(aRes.data || []);
      setContacts(cRes.data || []);
    }).finally(() => setDraftReady(true));
  }, [user]);

  // Auto-generate ref number
  useEffect(() => {
    if (!user) return;
    supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => {
        const lastRef = (data || [])[0]?.ref_number || "";
        const match = lastRef.match(/(\d+)$/);
        const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
        setFormRefNumber(`QV-${new Date().getFullYear()}-${nextNum}`);
      });
  }, [user]);

  const isCustomer = (c: any) => ["customer", "عميل", "زبون"].includes(c.contact_type);
  const isSupplier = (c: any) => ["supplier", "مورد"].includes(c.contact_type);
  const isEmployee = (c: any) => ["employee", "موظف"].includes(c.contact_type);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    return contacts.filter(c => multiWordMatchAny(contactSearch, c.contact_name));
  }, [contacts, contactSearch]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff = Math.abs(totalDebit - totalCredit);

  const addLine = () => {
    setLines(prev => [...prev, { id: String(Date.now()), account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  // Duplicate a row in place (Ctrl+D shortcut)
  const duplicateLine = (id: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: JournalLine = {
        ...src,
        id: String(Date.now()),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  // Add a row and immediately focus its debit cell — used by Alt+N and Enter overflow
  const addLineAndFocus = () => {
    const newId = String(Date.now());
    setLines(prev => [
      ...prev,
      { id: newId, account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
    ]);
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-journal-debit="${newId}"]`)?.focus();
    }, 50);
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (field === "account_code") {
        const acct = accounts.find(a => a.account_code === value);
        return { ...l, account_code: value, account_name: acct?.account_name || "" };
      }
      if (field === "contact_id") {
        const cleanVal = value === "__none__" ? "" : value;
        const c = contacts.find(c => c.id === cleanVal);
        return { ...l, contact_id: cleanVal, contact_name: c?.contact_name || "" };
      }
      return { ...l, [field]: value };
    }));
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // Apply a saved template into the form (overwrites lines, prefills metadata)
  const applyTemplate = useCallback((tpl: JournalTemplate) => {
    if (tpl.default_subtype) setFormSubtype(tpl.default_subtype);
    if (tpl.default_contact_id) setFormContactId(tpl.default_contact_id);
    if (!formDescription && tpl.description) setFormDescription(tpl.description);

    const newLines: JournalLine[] = tpl.lines.map((l, i) => {
      const acct = accounts.find(a => a.account_code === l.account_code);
      return {
        id: String(Date.now() + i),
        account_code: l.account_code || "",
        account_name: acct?.account_name || l.account_name || "",
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        contact_id: l.contact_id || "",
        contact_name: l.contact_name || "",
        line_comment: l.memo || "",
      };
    });
    if (newLines.length < 2) {
      while (newLines.length < 2) {
        newLines.push({
          id: String(Date.now() + newLines.length + 99),
          account_code: "", account_name: "", debit: 0, credit: 0,
          contact_id: "", contact_name: "", line_comment: "",
        });
      }
    }
    setLines(newLines);
    toast.success(`تم تطبيق القالب: ${tpl.name}`);
    // Focus first empty amount cell
    setTimeout(() => {
      const firstEmpty = newLines.find(l => !l.debit && !l.credit);
      if (firstEmpty) {
        document.querySelector<HTMLInputElement>(`[data-journal-debit="${firstEmpty.id}"]`)?.focus();
      }
    }, 100);
  }, [accounts, formDescription]);

  // Power-user keyboard shortcuts
  useJournalKeyboard({
    enabled: !showQuickAdd && !saved,
    onSave: () => { if (isBalanced && !saving) handleSave("posted"); },
    onAddRow: addLineAndFocus,
    onDuplicateRow: duplicateLine,
    onDeleteRow: (id) => removeLine(id),
  });

  const handleQuickAddContact = async () => {
    if (!user || !quickAddName.trim()) return;
    setQuickAddSaving(true);
    try {
      const contactType = quickAddType === "customer" ? "عميل" : "مورد";
      const { data, error } = await supabase.from("contacts").insert({
        user_id: user.id,
        contact_name: quickAddName.trim(),
        contact_type: contactType,
        current_balance: 0,
      }).select("id, contact_name, contact_type, current_balance").single();
      if (error) throw error;
      setContacts(prev => [...prev, data]);
      if (quickAddForLineId) {
        updateLine(quickAddForLineId, "contact_id", data.id);
      }
      toast.success(`تم إضافة ${contactType}: ${data.contact_name}`);
      setShowQuickAdd(false);
      setQuickAddName("");
      setQuickAddForLineId(null);
    } catch (err: any) {
      toast.error(err.message || "خطأ في الإضافة");
    } finally {
      setQuickAddSaving(false);
    }
  };


  const handleSave = async (mode: "draft" | "posted" | "deferred" = "posted") => {
    if (!user) return;
    if (!formDescription.trim()) { toast.error("الوصف مطلوب"); return; }
    if (mode === "posted" && !isBalanced) { toast.error("القيد غير متوازن"); return; }

    // Auto-assign account codes for contact-only lines before validation
    const preparedLines = lines.map(l => {
      if (!l.account_code && l.contact_id && l.contact_id !== "__none__") {
        const c = contacts.find(ct => ct.id === l.contact_id);
        const autoCode = c && isCustomer(c) ? "1130" : c && isSupplier(c) ? "2110" : c && isEmployee(c) ? "2180" : "";
        const acct = accounts.find(a => a.account_code === autoCode);
        return { ...l, account_code: autoCode, account_name: acct?.account_name || "" };
      }
      return l;
    });

    // Strict accounting validation: a line is "active" if it has any value or any account/contact selected.
    // - Fully empty rows are silently dropped.
    // - Active rows MUST have a postable account_code AND at least one of debit/credit > 0.
    const postableSet = new Set(postableAccounts.map((a: any) => a.account_code));
    const invalids: string[] = [];
    const cleanLines = preparedLines.filter(l => {
      const hasAmount = Number(l.debit) > 0 || Number(l.credit) > 0;
      const hasAccount = !!l.account_code;
      const hasContact = !!l.contact_id && l.contact_id !== "__none__";
      const isEmpty = !hasAmount && !hasAccount && !hasContact && !l.line_comment;
      if (isEmpty) return false; // auto-drop fully empty rows

      // Active row — must have an account
      if (!hasAccount) { invalids.push(l.id); return true; }
      // Account must be postable (not a parent)
      if (!postableSet.has(l.account_code)) { invalids.push(l.id); return true; }
      // Must have an amount
      if (!hasAmount) { invalids.push(l.id); return true; }
      return true;
    });

    if (invalids.length > 0) {
      setInvalidLineIds(new Set(invalids));
      toast.error("يرجى تحديد حساب قابل للترحيل ومبلغ لكل سطر قبل الحفظ");
      return;
    }
    setInvalidLineIds(new Set());

    const validLines = cleanLines.filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast.error("أدخل سطرين على الأقل"); return; }

    setSaving(true);
    try {
      // ✅ Source of Truth الموحّد — نفس المنطق المستخدم في JournalEntryPopup
      const result = await saveJournalVoucher({
        ref_number: formRefNumber,
        date: formDate,
        subtype: formSubtype as any,
        description: formDescription,
        notes: formNotes || null,
        contact_id: formContactId || null,
        lines: validLines.map((l) => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          contact_id: l.contact_id && l.contact_id !== "__none__" ? l.contact_id : null,
          contact_name: l.contact_name || null,
          line_comment: l.line_comment || null,
        })),
        mode,
        attachments,
        line_sort_order: lineSortOrder,
      });

      if (!result.success) {
        throw new Error(result.error || "فشل حفظ السند");
      }

      const savedRef = result.ref_number || formRefNumber;
      const modeLabel =
        mode === "posted" ? `تم ترحيل سند القيد ${savedRef}` :
        mode === "deferred" ? `تم حفظ سند القيد كمؤجل ${savedRef}` :
        "تم حفظ المسودة";
      setSavedRefNumber(savedRef || "");
      clearDraft();
      if (fastEntryEnabled && mode === "posted") {
        toast.success(modeLabel, { duration: 2500 });
        // Auto-reset for fast entry — keep date + subtype as last-used context.
        setFormDescription("");
        setFormNotes("");
        setFormContactId("");
        setContactSearch("");
        setAttachments([]);
        setLines([
          { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
          { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
        ]);
        setAccountSearches({});
        setLineContactSearches({});
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>("[data-smart-first]")?.focus();
        });
      } else {
        toast.success(modeLabel);
        setSaved(true);
      }
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  // File upload handler
  const handleFileUpload = async (file: File) => {
    if (!user) return;
    if (attachments.length >= 5) { toast.error("الحد الأقصى 5 ملفات"); return; }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!allowedTypes.includes(file.type)) { toast.error("نوع الملف غير مدعوم. يُقبل: PDF, JPG, PNG, XLSX"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("حجم الملف يتجاوز 10MB"); return; }

    setUploadingFile(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("journal-attachments").upload(filePath, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("journal-attachments").getPublicUrl(filePath);
      setAttachments(prev => [...prev, {
        name: file.name, url: urlData.publicUrl, size: file.size, type: file.type, uploaded_at: new Date().toISOString(),
      }]);
      toast.success(`تم رفع ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "خطأ في الرفع");
    } finally {
      setUploadingFile(false);
    }
  };

  const handlePrint = () => { /* no browser print */ };

  if (saved) {
    return (
      <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">تم حفظ سند القيد بنجاح</h2>
          <p className="text-muted-foreground">رقم السند: <span className="font-mono font-bold text-foreground">{savedRefNumber}</span></p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">
              <Printer className="h-4 w-4" /> طباعة
            </button>
            <button onClick={() => navigate("/finance/journals")} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">
              العودة للسندات
            </button>
            <button onClick={() => {
              setSaved(false);
              setFormDescription("");
              setFormNotes("");
              setFormContactId("");
              setAttachments([]);
              setLines([
                { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
                { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
              ]);
            }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all">
              سند قيد جديد
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AccountingShell>
    <SmartFormScope
      className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 pb-32 space-y-5"
      firstFieldSelector="[data-smart-first]"
    >
    <div dir="rtl" className="contents">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}

      {/* Auto-Draft Restore Banner */}
      {hasDraft && (
        <DraftRestoreBanner
          onRestore={restoreDraft}
          onDismiss={clearDraft}
          savedAt={draftSavedAt}
          label="يوجد مسودة محفوظة لسند القيد"
        />
      )}

      <PageHeader title="سند قيد جديد" breadcrumb={["المحاسبة", "القيود", "سند قيد جديد"]} />

      {/* Navigation Toolbar */}
      <VoucherNavToolbar
        voucherType="journal"
        currentRef={formRefNumber}
        onPrint={handlePrint}
        onSaveDraft={() => handleSave("draft")}
        onSavePost={() => handleSave("posted")}
        saving={saving}
        saveDraftDisabled={saving}
        savePostDisabled={saving || !isBalanced}
        savePostDisabledReason={!isBalanced ? "القيد غير متوازن — تحقق من المدين والدائن" : undefined}
        onNew={() => {
          setSaved(false);
          setFormDescription("");
          setFormNotes("");
          setFormContactId("");
          setAttachments([]);
          setLines([
            { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
            { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
          ]);
        }}
        onNewSimilar={saved ? () => {
          const draftData = {
            _sourceRef: formRefNumber,
            description: formDescription,
            notes: formNotes,
            subtype: formSubtype,
            contactId: formContactId,
            lines: lines.map(l => ({
              account_code: l.account_code,
              account_name: l.account_name,
              debit: l.debit,
              credit: l.credit,
              contact_id: l.contact_id,
              contact_name: l.contact_name,
            })),
          };
          localStorage.setItem("draft_journal_new", JSON.stringify(draftData));
          navigate("/finance/journal/new?from_duplicate=true");
        } : undefined}
      />

      {/* ═══════════════════════════════════════════════════════════════
          12-COLUMN MASTER GRID — Odoo / QuickBooks Journal style
          Left  (col-span-8): Header → Lines → Notes/Attachments
          Right (col-span-4): Sticky balance summary (Debit/Credit/Diff)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

      {/* ═══ LEFT COLUMN — Main content (8 cols) ═══ */}
      <div className="lg:col-span-8 min-w-0 space-y-5">

      {/* ═══ Header Card: Subtype + Date/Ref/Contact/Type + Description (12-col grid) ═══ */}
      <Card className="border border-border/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-[13px] font-bold text-foreground">بيانات السند</h2>
        </div>
        <CardContent className="p-5 space-y-5">
          {/* Subtype Tabs — chip strip, single row */}
          <div className="flex flex-wrap gap-2">
            {(["normal", "opening", "adjustment", "closing"] as const).map(st => (
              <button key={st} onClick={() => setFormSubtype(st)} className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${formSubtype === st ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {subtypeLabels[st]}
              </button>
            ))}
          </div>

          {/* Header fields — 12-col grid: 3 / 3 / 3 / 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-3">
              <Label className="text-xs mb-1.5 block">التاريخ</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} data-smart-first />
            </div>
            <div className="lg:col-span-3">
              <Label className="text-xs mb-1.5 block">رقم السند</Label>
              <Input value={formRefNumber} readOnly className="font-mono bg-muted/50 cursor-default" />
            </div>
            <div className="lg:col-span-3">
              <Label className="text-xs mb-1.5 block">جهة الاتصال (اختياري)</Label>
              <Select value={formContactId} onValueChange={setFormContactId}>
                <SelectTrigger><SelectValue placeholder="اختر جهة الاتصال..." /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <div className="px-2 py-1.5 sticky top-0 bg-background z-10">
                    <div className="relative">
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        className="w-full h-8 pr-8 pl-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="بحث..."
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  {filteredContacts.filter(isCustomer).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" /> الزبائن</SelectLabel>
                      {filteredContacts.filter(isCustomer).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${c.current_balance > 0 ? "text-emerald-600" : c.current_balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(c.current_balance || 0))}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {filteredContacts.filter(isSupplier).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><Building2 className="h-3 w-3" /> الموردين</SelectLabel>
                      {filteredContacts.filter(isSupplier).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${c.current_balance > 0 ? "text-emerald-600" : c.current_balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(c.current_balance || 0))}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {filteredContacts.filter(isEmployee).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><Users className="h-3 w-3" /> موظفون</SelectLabel>
                      {filteredContacts.filter(isEmployee).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-3">
              <Label className="text-xs mb-1.5 block">نوع السند</Label>
              <div className="h-10 px-3 inline-flex items-center rounded-md border border-input bg-muted/40 text-xs font-semibold text-foreground w-full">
                {subtypeLabels[formSubtype]}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block font-semibold">الوصف *</Label>
            <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="مثال: سلفة راتب - رهام حسون" />
          </div>
        </CardContent>
      </Card>

      {/* Journal Lines */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              أسطر القيد
            </h3>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">Enter</kbd>
                <span>التالي</span>
                <span className="text-muted-foreground/50">•</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">Alt+N</kbd>
                <span>سطر</span>
                <span className="text-muted-foreground/50">•</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">Ctrl+D</kbd>
                <span>نسخ</span>
                <span className="text-muted-foreground/50">•</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">Ctrl+Enter</kbd>
                <span>حفظ</span>
              </span>
              <Button variant="outline" size="sm" onClick={addLineAndFocus} className="gap-1 text-xs h-8">
                <Plus className="h-3 w-3" /> إضافة سطر
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)} className="gap-1 text-xs h-8">
                <Bookmark className="h-3 w-3" /> القوالب
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-right" style={{ background: "#0D1B2A" }}>
                  <th className="p-2.5 text-white font-medium w-10">#</th>
                  <th className="p-2.5 text-white font-medium w-24">رقم الحساب</th>
                  <th className="p-2.5 text-white font-medium" style={{ width: "30%" }}>الحساب / الجهة</th>
                  <th className="p-2.5 text-white font-medium w-28">مدين ₪</th>
                  <th className="p-2.5 text-white font-medium w-28">دائن ₪</th>
                  <th className="p-2.5 text-white font-medium" style={{ width: "18%" }}>تعليق</th>
                  <th className="p-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const displayLines = lineSortOrder === "debit_first"
                    ? [...lines].sort((a, b) => {
                        const aIsDebit = Number(a.debit) > 0 ? 0 : 1;
                        const bIsDebit = Number(b.debit) > 0 ? 0 : 1;
                        return aIsDebit - bIsDebit;
                      })
                    : lines;
                  return displayLines.map((line, i) => {
                  return (
                  <tr key={line.id} className={`border-t border-border/30 ${i % 2 === 0 ? "bg-background" : "bg-secondary/20"}`}>
                    <td data-journal-line-id={line.id} className="p-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="p-2.5">
                      <Input
                        value={line.account_code}
                        onChange={e => {
                          const code = e.target.value;
                          const acct = accounts.find(a => a.account_code === code);
                          setLines(prev => prev.map(l => l.id !== line.id ? l : {
                            ...l, account_code: code, account_name: acct?.account_name || l.account_name,
                          }));
                        }}
                        className="h-9 font-mono text-xs w-20"
                        placeholder="1110"
                        dir="ltr"
                        data-smart-first={i === 0 ? "true" : undefined}
                      />
                    </td>
                    <td className="p-2.5">
                      <Select 
                        value={line.contact_id && line.contact_id !== "__none__" ? `contact:${line.contact_id}` : line.account_code ? `account:${line.account_code}` : ""}
                        onValueChange={v => {
                          if (v === "__quick_add__") {
                            setQuickAddForLineId(line.id);
                            setQuickAddName("");
                            setShowQuickAdd(true);
                            return;
                          }
                          if (v === "__clear__") {
                            setLines(prev => prev.map(l => l.id !== line.id ? l : { ...l, account_code: "", account_name: "", contact_id: "", contact_name: "" }));
                            return;
                          }
                          if (v.startsWith("contact:")) {
                            const contactId = v.replace("contact:", "");
                            const c = contacts.find(ct => ct.id === contactId);
                            const autoAccount = c && isCustomer(c) ? "1130" : c && isSupplier(c) ? "2110" : c && isEmployee(c) ? "2180" : "";
                            const acct = accounts.find(a => a.account_code === autoAccount);
                            setLines(prev => prev.map(l => l.id !== line.id ? l : {
                              ...l, contact_id: contactId, contact_name: c?.contact_name || "",
                              account_code: autoAccount, account_name: acct?.account_name || "",
                            }));
                          } else if (v.startsWith("account:")) {
                            const code = v.replace("account:", "");
                            const acct = accounts.find(a => a.account_code === code);
                            setLines(prev => prev.map(l => l.id !== line.id ? l : {
                              ...l, account_code: code, account_name: acct?.account_name || "",
                              contact_id: "", contact_name: "",
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          {(line.account_code || (line.contact_id && line.contact_id !== "__none__")) ? (
                            <span className="truncate flex items-center gap-2">
                              {line.contact_id && line.contact_id !== "__none__" && (
                                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">
                                  {isCustomer(contacts.find(c => c.id === line.contact_id) || {} as any) ? <User className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                                  {contacts.find(c => c.id === line.contact_id)?.contact_name}
                                </span>
                              )}
                              {line.account_code && (
                                <span className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{line.account_code}</span>
                                  <span className="text-foreground">{line.account_name}</span>
                                </span>
                              )}
                            </span>
                          ) : (
                            <SelectValue placeholder="ابحث عن حساب أو جهة..." />
                          )}
                        </SelectTrigger>
                        <SelectContent className="max-h-[420px] min-w-[380px]">
                          <div className="px-2 py-1.5 sticky top-0 bg-background z-10 space-y-1">
                            <div className="relative">
                              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <input
                                className="w-full h-8 pr-8 pl-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                placeholder="ابحث بالرقم أو الاسم..."
                                value={accountSearches[line.id] || ""}
                                onChange={e => setAccountSearches(prev => ({ ...prev, [line.id]: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <SelectItem value="__quick_add__">
                            <span className="flex items-center gap-1.5 text-primary font-medium">
                              <UserPlus className="h-3.5 w-3.5" /> إضافة زبون / مورد جديد
                            </span>
                          </SelectItem>
                          {(line.account_code || (line.contact_id && line.contact_id !== "__none__")) && (
                            <SelectItem value="__clear__">
                              <span className="text-muted-foreground flex items-center gap-1.5"><X className="h-3 w-3" /> تفريغ</span>
                            </SelectItem>
                          )}
                          {(() => {
                            const q = (accountSearches[line.id] || "");
                            const fa = postableAccounts.filter(a => !q.trim() || multiWordMatchAny(q, a.account_code, a.account_name));
                            const fc = q.trim() ? contacts.filter(c => multiWordMatchAny(q, c.contact_name)) : contacts;
                            const hasSearch = q.trim().length > 0;

                            const accountsSection = fa.length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><BookOpen className="h-3 w-3" /> الحسابات</SelectLabel>
                                {fa.map(a => (
                                  <SelectItem key={`a-${a.account_code}`} value={`account:${a.account_code}`}>
                                    <span className="flex items-center gap-3">
                                      <span className="font-mono text-muted-foreground text-[10px] bg-muted px-1.5 py-0.5 rounded">{a.account_code}</span>
                                      <span>{a.account_name}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            );

                            const contactsSection = (
                              <>
                                {fc.filter(isCustomer).length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel className="flex items-center gap-1.5 text-[10px] text-primary"><User className="h-3 w-3" /> زبائن</SelectLabel>
                                    {fc.filter(isCustomer).map(c => (
                                      <SelectItem key={`c-${c.id}`} value={`contact:${c.id}`}>
                                        <span className="flex items-center gap-2">
                                          <span className="font-medium">{c.contact_name}</span>
                                          <span className={`text-[10px] font-mono ${c.current_balance > 0 ? "text-emerald-600" : c.current_balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>₪{formatAmount(Math.abs(c.current_balance || 0))}</span>
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}
                                {fc.filter(isSupplier).length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel className="flex items-center gap-1.5 text-[10px] text-primary"><Building2 className="h-3 w-3" /> موردين</SelectLabel>
                                    {fc.filter(isSupplier).map(c => (
                                      <SelectItem key={`c-${c.id}`} value={`contact:${c.id}`}>
                                        <span className="flex items-center gap-2">
                                          <span className="font-medium">{c.contact_name}</span>
                                          <span className={`text-[10px] font-mono ${c.current_balance > 0 ? "text-emerald-600" : c.current_balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>₪{formatAmount(Math.abs(c.current_balance || 0))}</span>
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}
                                {fc.filter(isEmployee).length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel className="flex items-center gap-1.5 text-[10px] text-primary"><Users className="h-3 w-3" /> موظفون</SelectLabel>
                                    {fc.filter(isEmployee).map(c => (
                                      <SelectItem key={`c-${c.id}`} value={`contact:${c.id}`}>{c.contact_name}</SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}
                              </>
                            );

                            return hasSearch ? (
                              <>
                                {accountsSection}
                                {fa.length > 0 && fc.length > 0 && <div className="border-t border-border my-1" />}
                                {contactsSection}
                              </>
                            ) : (
                              <>
                                {contactsSection}
                                {fc.length > 0 && fa.length > 0 && <div className="border-t border-border my-1" />}
                                {accountsSection}
                              </>
                            );
                          })()}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2.5">
                      <Input
                        type="text" inputMode="decimal"
                        value={line.debit || ""}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === "=" || val === "=") {
                            // Auto-balance: remaining = totalCredit(others) - totalDebit(others)
                            const otherDebit = lines.filter(l => l.id !== line.id).reduce((s, l) => s + (Number(l.debit) || 0), 0);
                            const currentTotalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                            const remaining = Math.max(0, currentTotalCredit - otherDebit);
                            updateLine(line.id, "debit", remaining);
                          } else {
                            updateLine(line.id, "debit", Number(val) || 0);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            focusNextJournalCell("debit", line.id, lines.map(l => l.id), addLineAndFocus);
                          }
                        }}
                        data-journal-debit={line.id}
                        className="h-9 font-mono text-xs" placeholder="0"
                      />
                    </td>
                    <td className="p-2.5">
                      <Input
                        type="text" inputMode="decimal"
                        value={line.credit || ""}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === "=" || val === "=") {
                            const otherCredit = lines.filter(l => l.id !== line.id).reduce((s, l) => s + (Number(l.credit) || 0), 0);
                            const currentTotalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                            const remaining = Math.max(0, currentTotalDebit - otherCredit);
                            updateLine(line.id, "credit", remaining);
                          } else {
                            updateLine(line.id, "credit", Number(val) || 0);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            focusNextJournalCell("credit", line.id, lines.map(l => l.id), addLineAndFocus);
                          }
                        }}
                        data-journal-credit={line.id}
                        className="h-9 font-mono text-xs" placeholder="0"
                      />
                    </td>
                    <td className="p-2.5">
                      <Input
                        value={line.line_comment || ""}
                        onChange={e => updateLine(line.id, "line_comment" as any, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            focusNextJournalCell("memo", line.id, lines.map(l => l.id), addLineAndFocus);
                          }
                        }}
                        data-journal-memo={line.id}
                        className="h-9 text-xs"
                        placeholder="تعليق على هذا السطر..."
                      />
                    </td>
                    <td className="p-2.5">
                      <button onClick={() => removeLine(line.id)} className="p-1 hover:text-destructive text-muted-foreground" disabled={lines.length <= 2}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  );
                });
                })()}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold bg-primary/5">
                  <td colSpan={3} className="p-2.5 text-xs">الإجمالي</td>
                  <td className="p-2.5 font-mono text-xs">₪{formatAmount(totalDebit)}</td>
                  <td className="p-2.5 font-mono text-xs text-destructive">₪{formatAmount(totalCredit)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Sort Order Radio */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground font-medium">ترتيب البنود:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="sortOrder" checked={lineSortOrder === "debit_first"} onChange={() => setLineSortOrder("debit_first")} className="accent-primary" />
              <span className={lineSortOrder === "debit_first" ? "font-bold text-foreground" : "text-muted-foreground"}>المدين ثم الدائن</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="sortOrder" checked={lineSortOrder === "original"} onChange={() => setLineSortOrder("original")} className="accent-primary" />
              <span className={lineSortOrder === "original" ? "font-bold text-foreground" : "text-muted-foreground"}>الترتيب الأصلي</span>
            </label>
          </div>

          {/* Balance Status — high-visibility, color-coded */}
          <JournalBalanceBar totalDebit={totalDebit} totalCredit={totalCredit} variant="inline" />
        </CardContent>
      </Card>

      {/* ═══ Bottom row INSIDE left column: Notes (7) + Attachments (5) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <Card className="lg:col-span-7 border border-border/60 shadow-sm rounded-2xl">
        <CardContent className="p-5">
          <Label className="text-xs mb-1.5 block flex items-center gap-2 font-semibold">
            ملاحظات
          </Label>
          <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={5} className="resize-none" />
        </CardContent>
      </Card>

      {/* Attachments Section */}
      <Card className="lg:col-span-5 border border-border/60 shadow-sm rounded-2xl">
        <CardContent className="p-0">
          <button
            onClick={() => setAttachmentsOpen(!attachmentsOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors rounded-xl"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Paperclip className="h-4 w-4 text-primary" />
              المرفقات {attachments.length > 0 && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{attachments.length}</span>}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${attachmentsOpen ? "rotate-180" : ""}`} />
          </button>
          {attachmentsOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div
                ref={dropZoneRef}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); const files = e.dataTransfer.files; if (files.length) handleFileUpload(files[0]); }}
                className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">اسحب الملفات هنا أو اضغط للرفع</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">PDF, JPG, PNG, XLSX — حد أقصى 10MB / 5 ملفات</p>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ""; }} />
              {uploadingFile && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ الرفع...</div>}
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{att.name}</a>
                    <span className="text-muted-foreground">({(att.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="p-1 hover:text-destructive text-muted-foreground">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* ═══ END LEFT COLUMN ═══ */}
      </div>

      {/* ═══ RIGHT COLUMN — Sticky Balance Summary (4 cols) ═══
          Always visible while scrolling; mirrors SmartSummary pattern. */}
      <aside className="lg:col-span-4 lg:sticky lg:top-4 self-start w-full">
        <Card className="border border-border/60 shadow-md rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <h3 className="text-[13px] font-bold text-foreground">ملخص القيد</h3>
          </div>
          <CardContent className="p-4 space-y-3">
            {/* Status badge */}
            {(() => {
              const diff = totalDebit - totalCredit;
              const isZero = totalDebit === 0 && totalCredit === 0;
              if (isZero) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 text-muted-foreground text-xs">
                    <FileText className="h-3.5 w-3.5" />
                    <span>أدخل المبالغ للتحقق من التوازن</span>
                  </div>
                );
              }
              if (isBalanced) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                    <CheckCircle className="h-4 w-4" />
                    <span>القيد متوازن — جاهز للترحيل</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20">
                  <AlertTriangle className="h-4 w-4" />
                  <span>القيد غير متوازن</span>
                </div>
              );
            })()}

            {/* Debit / Credit / Diff */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                <span className="text-[11px] text-muted-foreground font-medium">إجمالي مدين</span>
                <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400 text-sm">₪{formatAmount(totalDebit)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-destructive/5 border border-destructive/15">
                <span className="text-[11px] text-muted-foreground font-medium">إجمالي دائن</span>
                <span className="font-bold tabular-nums text-destructive text-sm">₪{formatAmount(totalCredit)}</span>
              </div>
              <div className="h-px bg-border/60 my-1" />
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/40">
                <span className="text-[12px] font-semibold">الفرق</span>
                <span className={`font-extrabold tabular-nums text-base ${isBalanced ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                  ₪{formatAmount(Math.abs(totalDebit - totalCredit))}
                </span>
              </div>
            </div>

            {/* Meta */}
            <div className="pt-2 mt-1 border-t border-border/50 space-y-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>عدد الأسطر</span>
                <span className="font-semibold text-foreground tabular-nums">{lines.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>نوع السند</span>
                <span className="font-semibold text-foreground">{subtypeLabels[formSubtype]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>التاريخ</span>
                <span className="font-semibold text-foreground tabular-nums">{formDate}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* ═══ END MASTER GRID ═══ */}
      </div>

      {/* ═══ Sticky Bottom Action Bar ═══ */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-3 pb-3 bg-background/95 backdrop-blur-md border-t border-border/60 z-40">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mini status pill */}
          <div className={`hidden md:flex items-center gap-2 px-3 h-11 rounded-xl text-[11px] font-semibold tabular-nums ${isBalanced && totalDebit > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : totalDebit > 0 ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground"}`}>
            <span>مدين ₪{formatAmount(totalDebit)}</span>
            <span className="opacity-40">·</span>
            <span>دائن ₪{formatAmount(totalCredit)}</span>
          </div>

          {/* Ghost: Print */}
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 h-11 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
            <Printer className="h-4 w-4" /> طباعة
          </button>

          {/* Secondary: Draft */}
          <button onClick={() => handleSave("draft")} disabled={saving}
            className="px-4 h-11 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all disabled:opacity-50">
            حفظ كمسودة
          </button>

          {/* Secondary warning: Deferred */}
          <button onClick={() => handleSave("deferred")} disabled={saving || !isBalanced}
            className="flex items-center gap-1.5 px-4 h-11 rounded-xl border-2 border-yellow-500/70 text-yellow-700 dark:text-yellow-400 text-sm font-semibold hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-all disabled:opacity-50">
            <Clock className="h-4 w-4" />
            حفظ مع التأجيل
          </button>

          {/* PRIMARY — dominant */}
          <button onClick={() => handleSave("posted")} disabled={saving || !isBalanced}
            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/25">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "جارٍ الحفظ..." : "حفظ وترحيل"}
          </button>
        </div>
      </div>

      {/* Quick Add Contact Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة جهة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs mb-1.5 block">نوع الجهة</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setQuickAddType("customer")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${quickAddType === "customer" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  <User className="h-3.5 w-3.5" /> زبون
                </button>
                <button
                  onClick={() => setQuickAddType("supplier")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${quickAddType === "supplier" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  <Building2 className="h-3.5 w-3.5" /> مورد
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">اسم الجهة *</Label>
              <Input
                value={quickAddName}
                onChange={e => setQuickAddName(e.target.value)}
                placeholder={quickAddType === "customer" ? "مثال: أحمد محمد" : "مثال: شركة التوريدات"}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && quickAddName.trim()) handleQuickAddContact(); }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowQuickAdd(false)}>إلغاء</Button>
              <Button size="sm" onClick={handleQuickAddContact} disabled={!quickAddName.trim() || quickAddSaving} className="gap-1">
                {quickAddSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                حفظ وربط
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Templates Picker */}
      <JournalTemplatesPicker
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApply={applyTemplate}
        currentSnapshot={{
          name: formDescription || "قالب جديد",
          description: formDescription,
          default_subtype: formSubtype,
          default_contact_id: formContactId || null,
          lines: lines.map(l => ({
            account_code: l.account_code,
            account_name: l.account_name,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            memo: l.line_comment || "",
            contact_id: l.contact_id || null,
            contact_name: l.contact_name || null,
          })),
        }}
      />
    </div>
    </SmartFormScope>
    </AccountingShell>
  );
};

export default JournalNewPage;

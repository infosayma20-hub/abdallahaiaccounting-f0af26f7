import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate, useSearchParams } from "react-router-dom";
import DuplicateBanner from "@/components/DuplicateBanner";
import {
  CheckCircle, Printer, Save, Search, Plus, Trash2, Loader2,
  BookOpen, User, Building2, Users, X, UserPlus
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VoucherNavToolbar from "@/components/VoucherNavToolbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { multiWordMatchAny } from "@/lib/utils";

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  contact_id?: string;
  contact_name?: string;
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

  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accountSearches, setAccountSearches] = useState<Record<string, string>>({});
  const [lineContactSearches, setLineContactSearches] = useState<Record<string, string>>({});

  // Quick-add contact state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForLineId, setQuickAddForLineId] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddType, setQuickAddType] = useState<"customer" | "supplier">("customer");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [lines, setLines] = useState<JournalLine[]>([
    { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" },
    { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" },
  ]);

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
    });
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
    setLines(prev => [...prev, { id: String(Date.now()), account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
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


  const handleSave = async (asDraft = false) => {
    if (!user) return;
    if (!formDescription.trim()) { toast.error("الوصف مطلوب"); return; }
    if (!asDraft && !isBalanced) { toast.error("القيد غير متوازن"); return; }

    // Auto-assign account codes for contact-only lines before validation
    const preparedLines = lines.map(l => {
      if (!l.account_code && l.contact_id && l.contact_id !== "__none__") {
        const c = contacts.find(ct => ct.id === l.contact_id);
        const autoCode = c && isCustomer(c) ? "1130" : c && isSupplier(c) ? "2110" : c && isEmployee(c) ? "1180" : "";
        const acct = accounts.find(a => a.account_code === autoCode);
        return { ...l, account_code: autoCode, account_name: acct?.account_name || "" };
      }
      return l;
    });

    const validLines = preparedLines.filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast.error("أدخل سطرين على الأقل"); return; }

    setSaving(true);
    try {
      const { data: voucher, error } = await supabase.from("vouchers").insert({
        user_id: user.id,
        type: "journal",
        subtype: formSubtype,
        ref_number: formRefNumber || "",
        date: formDate,
        contact_id: formContactId || null,
        amount: totalDebit,
        amount_ils: totalDebit,
        description: formDescription,
        notes: formNotes || null,
        status: asDraft ? "draft" : "posted",
        posted_by: !asDraft ? user.id : null,
        posted_at: !asDraft ? new Date().toISOString() : null,
      }).select("id, ref_number").single();

      if (error) throw error;

      // Insert voucher lines
      await supabase.from("voucher_lines").insert(
        validLines.map((l, i) => ({
          voucher_id: voucher.id,
          account_code: l.account_code,
          account_name: l.account_name,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          line_order: i + 1,
          contact_id: l.contact_id && l.contact_id !== "__none__" ? l.contact_id : null,
          contact_name: l.contact_name || null,
        }))
      );

      // If posted, create transactions (one per debit-credit pair, with contact_id)
      if (!asDraft) {
        const debitLines = validLines.filter(l => Number(l.debit) > 0);
        const creditLines = validLines.filter(l => Number(l.credit) > 0);
        
        // Create individual transactions for each debit line paired with credit lines
        const txns: any[] = [];
        for (const dl of debitLines) {
          for (const cl of creditLines) {
            const amount = Math.min(Number(dl.debit), Number(cl.credit));
            if (amount <= 0) continue;
            const lineContactId = dl.contact_id && dl.contact_id !== "__none__" ? dl.contact_id : 
                                  cl.contact_id && cl.contact_id !== "__none__" ? cl.contact_id : 
                                  formContactId || null;
            const contactName = lineContactId ? contacts.find(c => c.id === lineContactId)?.contact_name || "" : "";
            txns.push({
              user_id: user.id,
              transaction_date: formDate,
              description: contactName ? `${formDescription} - ${contactName}` : formDescription,
              debit_account_code: dl.account_code,
              credit_account_code: cl.account_code,
              amount,
              currency: "شيكل",
              transaction_type: formSubtype === "opening" ? "opening_balance" : "journal",
              reference: voucher.ref_number,
              contact_id: lineContactId,
              idempotency_key: `VOUCHER-${voucher.id}-${dl.account_code}-${cl.account_code}`,
            });
          }
        }
        
        // Fallback: if no pairs created, use simple approach
        if (txns.length === 0 && debitLines.length > 0 && creditLines.length > 0) {
          txns.push({
            user_id: user.id,
            transaction_date: formDate,
            description: formDescription,
            debit_account_code: debitLines[0].account_code,
            credit_account_code: creditLines[0].account_code,
            amount: totalDebit,
            currency: "شيكل",
            transaction_type: formSubtype === "opening" ? "opening_balance" : "journal",
            reference: voucher.ref_number,
            contact_id: formContactId || null,
            idempotency_key: `VOUCHER-${voucher.id}`,
          });
        }
        
        if (txns.length > 0) {
          await supabase.from("transactions").insert(txns);
        }
      }

      toast.success(asDraft ? "تم حفظ المسودة" : `تم ترحيل سند القيد ${voucher.ref_number}`);
      setSaved(true);
      setSavedRefNumber(voucher.ref_number || "");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => { window.print(); };

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
              setLines([
                { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" },
                { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" },
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
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}
      <PageHeader title="سند قيد جديد" breadcrumb={["المحاسبة", "القيود", "سند قيد جديد"]} />

      {/* Navigation Toolbar */}
      <VoucherNavToolbar
        voucherType="journal"
        currentRef={formRefNumber}
        onPrint={handlePrint}
        onNew={() => {
          setSaved(false);
          setFormDescription("");
          setFormNotes("");
          setFormContactId("");
          setLines([
            { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" },
            { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "" },
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

      {/* Subtype Tabs */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex gap-2">
            {(["normal", "opening", "adjustment", "closing"] as const).map(st => (
              <button key={st} onClick={() => setFormSubtype(st)} className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${formSubtype === st ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {subtypeLabels[st]}
              </button>
            ))}
          </div>

          {/* Date & Ref & Description */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">التاريخ</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">رقم السند</Label>
              <Input value={formRefNumber} readOnly className="font-mono bg-muted/50 cursor-default" />
            </div>
            <div>
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
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">الوصف *</Label>
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
            <Button variant="outline" size="sm" onClick={addLine} className="gap-1 text-xs h-8">
              <Plus className="h-3 w-3" /> إضافة سطر
            </Button>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-right" style={{ background: "#0D1B2A" }}>
                  <th className="p-2.5 text-white font-medium w-10">#</th>
                  <th className="p-2.5 text-white font-medium w-24">رقم الحساب</th>
                  <th className="p-2.5 text-white font-medium" style={{ width: "40%" }}>الحساب / الجهة</th>
                  <th className="p-2.5 text-white font-medium w-28">مدين ₪</th>
                  <th className="p-2.5 text-white font-medium w-28">دائن ₪</th>
                  <th className="p-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  return (
                  <tr key={line.id} className={`border-t border-border/30 ${i % 2 === 0 ? "bg-background" : "bg-secondary/20"}`}>
                    <td className="p-2.5 text-muted-foreground">{i + 1}</td>
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
                            const autoAccount = c && isCustomer(c) ? "1130" : c && isSupplier(c) ? "2110" : c && isEmployee(c) ? "1180" : "";
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
                            const fa = accounts.filter(a => !q.trim() || multiWordMatchAny(q, a.account_code, a.account_name));
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
                        className="h-9 font-mono text-xs" placeholder="0"
                      />
                    </td>
                    <td className="p-2.5">
                      <button onClick={() => removeLine(line.id)} className="p-1 hover:text-destructive text-muted-foreground" disabled={lines.length <= 2}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold bg-primary/5">
                  <td colSpan={3} className="p-2.5 text-xs">الإجمالي</td>
                  <td className="p-2.5 font-mono text-xs">₪{formatAmount(totalDebit)}</td>
                  <td className="p-2.5 font-mono text-xs text-destructive">₪{formatAmount(totalCredit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Status */}
          <div className={`rounded-xl p-3 text-xs font-medium ${isBalanced ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : diff > 0 ? "bg-destructive/5 text-destructive" : "bg-muted text-muted-foreground"}`}>
            {isBalanced ? (
              <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> متوازن — المدين = الدائن = ₪{formatAmount(totalDebit)}</span>
            ) : totalDebit > 0 || totalCredit > 0 ? (
              <span>✗ غير متوازن — فرق: ₪{formatAmount(diff)}</span>
            ) : (
              <span>أدخل المبالغ للتحقق من التوازن</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="p-5">
          <Label className="text-xs mb-1.5 block">ملاحظات</Label>
          <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={3} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4">
        <button onClick={() => handleSave(true)} disabled={saving}
          className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all disabled:opacity-50">
          حفظ كمسودة
        </button>
        <div className="flex items-center gap-3">
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || !isBalanced}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50">
            <Save className="h-4 w-4" />
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
    </div>
  );
};

export default JournalNewPage;

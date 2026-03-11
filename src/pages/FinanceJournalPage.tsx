import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Loader2, Plus, Search, X, Trash2,
  FileText, BookOpen, Save, User, Building2, Users, Check, DollarSign
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import BackButton from "@/components/BackButton";

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

const FinanceJournalPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [saving, setSaving] = useState(false);

  // Form
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formSubtype, setFormSubtype] = useState("normal");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { id: "1", account_code: "", account_name: "", debit: 0, credit: 0 },
    { id: "2", account_code: "", account_name: "", debit: 0, credit: 0 },
  ]);

  // Quick add contact
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState("عميل");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [accountSearches, setAccountSearches] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vRes, aRes, cRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }),
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true).order("account_code"),
      supabase.from("contacts").select("id, contact_name, contact_type, current_balance").eq("user_id", user.id),
    ]);
    setVouchers(vRes.data || []);
    setAccounts(aRes.data || []);
    setContacts(cRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      openVoucherForEdit(editId);
    } else if (searchParams.get("new") === "1") {
      setModalOpen(true);
    }
  }, [searchParams]);

  // Auto-generate ref number when modal opens
  const generateRefNumber = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }).limit(1);
    const lastRef = (data || [])[0]?.ref_number || "";
    const match = lastRef.match(/(\d+)$/);
    const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
    setFormRefNumber(`QV-${new Date().getFullYear()}-${nextNum}`);
  }, [user]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff = Math.abs(totalDebit - totalCredit);

  // Helper to normalize contact types (handle both EN and AR values)
  const isCustomer = (c: any) => ["customer", "عميل", "زبون"].includes(c.contact_type);
  const isSupplier = (c: any) => ["supplier", "مورد"].includes(c.contact_type);
  const isEmployee = (c: any) => ["employee", "موظف"].includes(c.contact_type);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => c.contact_name?.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const addLine = () => {
    setLines(prev => [...prev, { id: String(Date.now()), account_code: "", account_name: "", debit: 0, credit: 0 }]);
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
      return { ...l, [field]: value };
    }));
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormRefNumber("");
    setFormSubtype("normal");
    setFormDescription("");
    setFormNotes("");
    setFormContactId("");
    setContactSearch("");
    setShowQuickAdd(false);
    setEditingVoucherId(null);
    setLines([
      { id: "1", account_code: "", account_name: "", debit: 0, credit: 0 },
      { id: "2", account_code: "", account_name: "", debit: 0, credit: 0 },
    ]);
    generateRefNumber();
  };

  const openVoucherForEdit = async (voucherId: string) => {
    const [vRes, lRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("id", voucherId).single(),
      supabase.from("voucher_lines").select("*").eq("voucher_id", voucherId).order("line_order"),
    ]);
    if (vRes.data) {
      const v = vRes.data;
      setFormDate(v.date || new Date().toISOString().split("T")[0]);
      setFormRefNumber(v.ref_number || "");
      setFormSubtype(v.subtype || "normal");
      setFormDescription(v.description || "");
      setFormNotes(v.notes || "");
      setFormContactId(v.contact_id || "");
      setEditingVoucherId(voucherId);
      if (lRes.data && lRes.data.length > 0) {
        setLines(lRes.data.map((l: any) => ({
          id: String(l.id),
          account_code: l.account_code || "",
          account_name: l.account_name || "",
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })));
      }
      setModalOpen(true);
    }
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleQuickAddContact = async () => {
    if (!user || !quickName.trim()) return;
    setQuickSaving(true);
    const { data, error } = await supabase.from("contacts").insert({
      user_id: user.id,
      contact_name: quickName.trim(),
      contact_type: quickType,
      phone: quickPhone || null,
    }).select("id, contact_name, contact_type, current_balance").single();
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else if (data) {
      setContacts(prev => [...prev, data]);
      setFormContactId(data.id);
      setShowQuickAdd(false);
      toast({ title: `✅ تم إضافة ${data.contact_name}` });
    }
    setQuickSaving(false);
  };

  const handleSave = async (status: "draft" | "posted") => {
    if (!user) return;
    if (!formDescription.trim()) { toast({ title: "خطأ", description: "الوصف مطلوب", variant: "destructive" }); return; }
    if (status === "posted" && !isBalanced) { toast({ title: "خطأ", description: "القيد غير متوازن", variant: "destructive" }); return; }

    const validLines = lines.filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast({ title: "خطأ", description: "أدخل سطرين على الأقل", variant: "destructive" }); return; }

    setSaving(true);

    const voucherPayload = {
      user_id: user.id,
      type: "journal" as const,
      subtype: formSubtype,
      ref_number: formRefNumber || "",
      date: formDate,
      contact_id: formContactId || null,
      amount: totalDebit,
      amount_ils: totalDebit,
      description: formDescription,
      notes: formNotes || null,
      status,
      posted_by: status === "posted" ? user.id : null,
      posted_at: status === "posted" ? new Date().toISOString() : null,
    };

    let voucher: any = null;
    let error: any = null;

    if (editingVoucherId) {
      const res = await supabase.from("vouchers").update(voucherPayload).eq("id", editingVoucherId).select().single();
      voucher = res.data;
      error = res.error;
      if (voucher) await supabase.from("voucher_lines").delete().eq("voucher_id", editingVoucherId);
    } else {
      const res = await supabase.from("vouchers").insert(voucherPayload).select().single();
      voucher = res.data;
      error = res.error;
    }

    if (error || !voucher) {
      toast({ title: "خطأ", description: error?.message || "حدث خطأ", variant: "destructive" });
      setSaving(false);
      return;
    }

    // Insert voucher lines
    await supabase.from("voucher_lines").insert(
      validLines.map((l, i) => ({
        voucher_id: voucher.id,
        account_code: l.account_code,
        account_name: l.account_name,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        line_order: i + 1,
      }))
    );

    // If posted, create transactions for each debit/credit pair
    if (status === "posted") {
      const debitLines = validLines.filter(l => Number(l.debit) > 0);
      const creditLines = validLines.filter(l => Number(l.credit) > 0);
      // Create a single compound entry using first debit/credit
      if (debitLines.length > 0 && creditLines.length > 0) {
        await supabase.from("transactions").insert({
          user_id: user.id,
          transaction_date: formDate,
          description: formDescription,
          debit_account_code: debitLines[0].account_code,
          credit_account_code: creditLines[0].account_code,
          amount: totalDebit,
          currency: "شيكل",
          transaction_type: formSubtype === "opening" ? "opening_balance" : "journal",
          reference: voucher.ref_number,
          idempotency_key: `VOUCHER-${voucher.id}`,
        });
      }
    }

    toast({ title: status === "posted" ? `✅ تم ترحيل سند القيد ${voucher.ref_number}` : "تم الحفظ كمسودة" });
    setSaving(false);
    setModalOpen(false);
    resetForm();
    fetchData();
  };

  const filtered = useMemo(() => {
    return vouchers.filter(v => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!v.ref_number?.toLowerCase().includes(q) && !v.description?.toLowerCase().includes(q)) return false;
      }
      if (filterStatus !== "all" && v.status !== filterStatus) return false;
      return true;
    });
  }, [vouchers, searchQuery, filterStatus]);

  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount || 0), 0);
  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  // formatAmount defined above

  const subtypeLabels: Record<string, string> = { normal: "عادي", opening: "افتتاحي", adjustment: "تسوية", closing: "إقفالي" };

  return (
    <div className="px-4 lg:px-8 pt-6 pb-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">سندات القيد</h1>
            <p className="text-xs text-muted-foreground">إدارة القيود المحاسبية اليدوية</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { resetForm(); setModalOpen(true); }}>
          <Plus className="h-4 w-4" />سند قيد جديد
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold text-foreground">{vouchers.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي السندات</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-lg font-bold text-foreground">{fmt(totalAll)}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي المبالغ المرحّلة</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BookOpen className="h-5 w-5 mx-auto text-blue-500 mb-1" />
          <p className="text-2xl font-bold text-foreground">{vouchers.filter(v => v.status === "posted").length}</p>
          <p className="text-[10px] text-muted-foreground">مرحّل</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-orange-500 mb-1" />
          <p className="text-2xl font-bold text-foreground">{vouchers.filter(v => v.status === "draft").length}</p>
          <p className="text-[10px] text-muted-foreground">مسودة</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ابحث بالمرجع، الوصف..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="posted">مرحّل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">لا توجد سندات قيد بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الرقم</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="text-xs font-medium">
                        <button
                          className="text-primary hover:underline font-mono cursor-pointer bg-transparent border-none p-0"
                          onClick={() => openVoucherForEdit(v.id)}
                        >
                          {v.ref_number}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs">{v.date}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{subtypeLabels[v.subtype] || "عادي"}</Badge></TableCell>
                      <TableCell className="text-xs truncate max-w-[250px]">{v.description}</TableCell>
                      <TableCell className="text-xs font-bold">{fmt(Number(v.amount || 0))}</TableCell>
                      <TableCell>
                        {v.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge> :
                         v.status === "cancelled" ? <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge> :
                         <Badge variant="secondary" className="text-[10px]">مسودة</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Screen Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="p-4 text-white rounded-t-lg" style={{ background: "linear-gradient(135deg, #050F1E, #0A2342)" }}>
            <div className="flex items-center justify-between" dir="rtl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">سند قيد جديد</h2>
                  {formRefNumber && <p className="text-[11px] text-white/60">{formRefNumber}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5" dir="rtl">
            {/* Subtype Tabs */}
            <div className="flex gap-2">
              {(["normal", "opening", "adjustment", "closing"] as const).map(st => (
                <button key={st} onClick={() => setFormSubtype(st)} className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${formSubtype === st ? "bg-[#0A2342] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {subtypeLabels[st]}
                </button>
              ))}
            </div>

            {/* Date & Ref */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">رقم السند</Label>
                <Input value={formRefNumber} readOnly className="mt-1 font-mono bg-muted/50 cursor-default" />
              </div>
            </div>

            {/* Contact */}
            <div>
              <Label className="text-xs">جهة الاتصال (اختياري)</Label>
              <Select value={formContactId} onValueChange={setFormContactId}>
                <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="اختر جهة الاتصال..." /></SelectTrigger>
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
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" /> العملاء</SelectLabel>
                      {filteredContacts.filter(isCustomer).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(Number(c.current_balance || 0)))}
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
                            <span className={`text-[10px] font-mono ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(Number(c.current_balance || 0)))}
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

              {/* Quick Add Contact */}
              {!showQuickAdd ? (
                <button
                  onClick={() => { setShowQuickAdd(true); setQuickName(""); setQuickPhone(""); setQuickType("عميل"); }}
                  className="mt-2 text-xs flex items-center gap-1 text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> إضافة جهة اتصال جديدة
                </button>
              ) : (
                <div className="mt-2.5 rounded-xl border p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">إضافة جهة اتصال سريعة</span>
                    <button onClick={() => setShowQuickAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">الاسم *</Label>
                      <Input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="اسم جهة الاتصال" className="mt-1 h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">النوع *</Label>
                      <Select value={quickType} onValueChange={setQuickType}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="عميل">عميل</SelectItem>
                          <SelectItem value="مورد">مورد</SelectItem>
                          <SelectItem value="أخرى">أخرى</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">رقم الهاتف</Label>
                    <Input value={quickPhone} onChange={e => setQuickPhone(e.target.value)} placeholder="اختياري" className="mt-1 h-9" />
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={!quickName.trim() || quickSaving}
                    onClick={handleQuickAddContact}
                  >
                    {quickSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    حفظ واختيار
                  </Button>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs">الوصف *</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="مثال: سلفة راتب - رهام حسون" className="mt-1" />
            </div>

            {/* Journal Lines Table */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-right py-2.5 px-3 w-10">#</th>
                    <th className="text-right py-2.5 px-3">الحساب</th>
                    <th className="text-right py-2.5 px-3 w-32">مدين ₪</th>
                    <th className="text-right py-2.5 px-3 w-32">دائن ₪</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-2 px-3 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3">
                        <Select value={line.account_code} onValueChange={v => updateLine(line.id, "account_code", v)}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="ابحث بالرقم أو الاسم..." /></SelectTrigger>
                          <SelectContent className="max-h-[250px]">
                            <div className="px-2 py-1.5 sticky top-0 bg-background z-10">
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
                            {accounts
                              .filter(a => {
                                const q = (accountSearches[line.id] || "").toLowerCase();
                                if (!q) return true;
                                return a.account_code?.toLowerCase().includes(q) || a.account_name?.toLowerCase().includes(q);
                              })
                              .map(a => (
                              <SelectItem key={a.account_code} value={a.account_code}>
                                <span className="font-mono text-muted-foreground ml-2">{a.account_code}</span>
                                {a.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" value={line.debit || ""} onChange={e => updateLine(line.id, "debit", Number(e.target.value) || 0)} className="h-9 font-mono text-xs" placeholder="0" />
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" value={line.credit || ""} onChange={e => updateLine(line.id, "credit", Number(e.target.value) || 0)} className="h-9 font-mono text-xs bg-red-50/50" placeholder="0" />
                      </td>
                      <td className="py-2 px-1">
                        <button onClick={() => removeLine(line.id)} className="p-1 hover:text-red-500 text-muted-foreground" disabled={lines.length <= 2}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={5} className="py-2 px-3">
                      <button onClick={addLine} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" />إضافة سطر
                      </button>
                    </td>
                  </tr>
                  <tr className="border-t font-bold bg-muted/30">
                    <td colSpan={2} className="py-2.5 px-3 text-xs">الإجمالي</td>
                    <td className="py-2.5 px-3 font-mono text-xs">₪{formatAmount(totalDebit)}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-red-600">₪{formatAmount(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance Status */}
            <div className={`rounded-lg p-3 text-xs font-medium ${isBalanced ? "bg-emerald-50 text-emerald-700" : diff > 0 ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground"}`}>
              {isBalanced ? (
                <span>✓ متوازن — المدين = الدائن = ₪{formatAmount(totalDebit)}</span>
              ) : totalDebit > 0 || totalCredit > 0 ? (
                <span>✗ غير متوازن — فرق: ₪{formatAmount(diff)}</span>
              ) : (
                <span>أدخل المبالغ للتحقق من التوازن</span>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="mt-1" placeholder="ملاحظات إضافية..." />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-background border-t p-4 flex items-center gap-2 flex-wrap" dir="rtl">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>حفظ كمسودة</Button>
            <Button className="flex-1 bg-[#0A2342] hover:bg-[#0D1B2A]" onClick={() => handleSave("posted")} disabled={saving || !isBalanced}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              ✓ إنشاء القيد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceJournalPage;

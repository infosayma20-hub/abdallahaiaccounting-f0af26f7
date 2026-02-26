import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, Phone, Mail, Building2, MapPin, User, Users, ShoppingBag, Search, ChevronDown, ChevronUp, Sparkles, Receipt, TrendingUp, TrendingDown, Calendar, FileText, Wallet, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import ContactStatementDialog from "@/components/ContactStatementDialog";

interface Contact {
  id: string;
  fields: {
    "Contact Name"?: string;
    "Contact Type"?: string;
    "Phone"?: string;
    "Email"?: string;
    "Company"?: string;
    "Address"?: string;
    "Credit Limit"?: number;
    "Payment Days"?: number;
  };
}

interface ContactTransaction {
  id: string;
  fields: {
    Description?: string;
    "Transaction Type"?: string;
    "Debit Account Name"?: string;
    "Credit Account Name"?: string;
    Amount?: number;
    Currency?: string;
    Date?: string;
  };
}

interface ContactFinancials {
  balance: number;
  invoiceCount: number;
  lastTxDate: string;
  totalDealing: number;
  lastTransactions: ContactTransaction[];
  totalSales: number;
  totalCollections: number;
  loading: boolean;
}

const typeConfig: Record<string, { color: string; bgColor: string; icon: typeof Users; label: string }> = {
  "زبون": { color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", icon: Users, label: "زبون" },
  "مورد": { color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30", icon: ShoppingBag, label: "مورد" },
  "زبون ومورد": { color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30", icon: User, label: "زبون ومورد" },
};

const contactTypeOptions = [
  { value: "زبون", label: "زبون" },
  { value: "مورد", label: "مورد" },
  { value: "زبون ومورد", label: "زبون ومورد" },
];

function classifyContactAmount(tx: ContactTransaction, contactName: string, isSupplier: boolean): { debit: number; credit: number } {
  const amount = tx.fields.Amount || 0;
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim().toLowerCase();
  const debitAcc = (tx.fields["Debit Account Name"] || "").toLowerCase();
  const creditAcc = (tx.fields["Credit Account Name"] || "").toLowerCase();
  const nameL = contactName.toLowerCase();

  const contactInDebit = debitAcc.includes(nameL);
  const contactInCredit = creditAcc.includes(nameL);

  if (contactInDebit) return { debit: amount, credit: 0 };
  if (contactInCredit) return { debit: 0, credit: amount };

  if (isSupplier) {
    if (type === "فاتورة مشتريات" || desc.includes("شراء")) return { debit: 0, credit: amount };
    if (type === "سند صرف" || desc.includes("دفع") || desc.includes("سداد")) return { debit: amount, credit: 0 };
    return { debit: 0, credit: amount };
  } else {
    if (type === "فاتورة مبيعات" || desc.includes("بيع")) return { debit: amount, credit: 0 };
    if (type === "سند قبض" || desc.includes("قبض") || desc.includes("تحصيل")) return { debit: 0, credit: amount };
    return { debit: amount, credit: 0 };
  }
}

const ContactsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newContact, setNewContact] = useState({
    name: "", type: "", phone: "", email: "", company: "", address: "", creditLimit: "", paymentDays: "30",
  });
  const [statementContact, setStatementContact] = useState<{ id: string; name: string; type: string } | null>(null);
  const [contactFinancials, setContactFinancials] = useState<Record<string, ContactFinancials>>({});
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editData, setEditData] = useState({ name: "", type: "", phone: "", email: "", company: "", address: "", creditLimit: "", paymentDays: "" });
  const [editing, setEditing] = useState(false);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchContacts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user.id}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setContacts(data?.records || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContacts(); }, [user]);

  // Fetch financials for all contacts once contacts are loaded
  useEffect(() => {
    if (!user || contacts.length === 0) return;
    contacts.forEach((contact) => {
      const contactId = contact.id;
      if (contactFinancials[contactId]) return; // already fetched
      setContactFinancials(prev => ({ ...prev, [contactId]: { balance: 0, invoiceCount: 0, lastTxDate: "-", totalDealing: 0, lastTransactions: [], totalSales: 0, totalCollections: 0, loading: true } }));
      
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contact-transactions?contactId=${contactId}&clientId=${user.id}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      )
        .then(res => res.json())
        .then(data => {
          const txs: ContactTransaction[] = data?.records || [];
          const contactName = contact.fields["Contact Name"] || "";
          const isSupplier = (contact.fields["Contact Type"] || "").includes("مورد");

          let totalDebit = 0;
          let totalCredit = 0;
          let invoiceCount = 0;
          let totalDealing = 0;

          txs.forEach(tx => {
            const { debit, credit } = classifyContactAmount(tx, contactName, isSupplier);
            totalDebit += debit;
            totalCredit += credit;
            totalDealing += (tx.fields.Amount || 0);
            const type = tx.fields["Transaction Type"] || "";
            if (type.includes("فاتورة")) invoiceCount++;
          });

          const balance = totalDebit - totalCredit;
          const sorted = [...txs].sort((a, b) => (b.fields.Date || "").localeCompare(a.fields.Date || ""));
          const lastTxDate = sorted[0]?.fields.Date || "-";
          const last3 = sorted.slice(0, 3);

          setContactFinancials(prev => ({
            ...prev,
            [contactId]: {
              balance,
              invoiceCount,
              lastTxDate,
              totalDealing,
              lastTransactions: last3,
              totalSales: totalDebit,
              totalCollections: totalCredit,
              loading: false,
            }
          }));
        })
        .catch(() => {
          setContactFinancials(prev => ({
            ...prev,
            [contactId]: { balance: 0, invoiceCount: 0, lastTxDate: "-", totalDealing: 0, lastTransactions: [], totalSales: 0, totalCollections: 0, loading: false }
          }));
        });
    });
  }, [user, contacts]);

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.type) return;
    setAdding(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user?.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactName: newContact.name.trim(),
            contactType: newContact.type,
            phone: newContact.phone,
            email: newContact.email,
            company: newContact.company,
            address: newContact.address,
            creditLimit: newContact.creditLimit,
            paymentDays: newContact.paymentDays,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create contact");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      toast({ title: "تم إضافة جهة الاتصال بنجاح ✅" });
      setNewContact({ name: "", type: "", phone: "", email: "", company: "", address: "", creditLimit: "", paymentDays: "30" });
      setShowAddDialog(false);
      setContactFinancials({});
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleEditContact = async () => {
    if (!editContact || !editData.name.trim()) return;
    setEditing(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user?.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactId: editContact.id,
            contactName: editData.name.trim(),
            contactType: editData.type,
            phone: editData.phone,
            email: editData.email,
            company: editData.company,
            address: editData.address,
            creditLimit: editData.creditLimit,
            paymentDays: editData.paymentDays,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to update contact");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      toast({ title: "تم تعديل جهة الاتصال بنجاح ✅" });
      setEditContact(null);
      setContactFinancials({});
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteContact) return;
    const fin = contactFinancials[deleteContact.id];
    if (fin && !fin.loading && fin.totalDealing > 0) {
      toast({ title: "لا يمكن حذف جهة اتصال مرتبطة بمعاملات مالية", variant: "destructive" });
      setDeleteContact(null);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user?.id}&contactId=${deleteContact.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }
      );
      if (!res.ok) throw new Error("Failed to delete contact");
      toast({ title: "تم حذف جهة الاتصال ✅" });
      setDeleteContact(null);
      setContactFinancials({});
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openEditDialog = (contact: Contact) => {
    const f = contact.fields;
    setEditData({
      name: f["Contact Name"] || "",
      type: f["Contact Type"] || "",
      phone: f["Phone"] || "",
      email: f["Email"] || "",
      company: f["Company"] || "",
      address: f["Address"] || "",
      creditLimit: f["Credit Limit"]?.toString() || "",
      paymentDays: f["Payment Days"]?.toString() || "30",
    });
    setEditContact(contact);
  };

  const contactTypes = [...new Set(contacts.map(c => c.fields["Contact Type"]).filter(Boolean))];
  
  const filtered = contacts.filter(c => {
    const matchesType = !filterType || c.fields["Contact Type"] === filterType;
    const matchesSearch = !searchQuery || 
      (c.fields["Contact Name"] || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.fields["Company"] || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.fields["Phone"] || "").includes(searchQuery);
    return matchesType && matchesSearch;
  });

  // Stats
  const customerCount = contacts.filter(c => c.fields["Contact Type"] === "زبون" || c.fields["Contact Type"] === "زبون ومورد").length;
  const supplierCount = contacts.filter(c => c.fields["Contact Type"] === "مورد" || c.fields["Contact Type"] === "زبون ومورد").length;

  // Smart Summary
  const smartSummary = useMemo(() => {
    const allFinancials = Object.entries(contactFinancials).filter(([_, f]) => !f.loading);
    if (allFinancials.length === 0) return null;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let topCustomer = { name: "-", amount: 0 };
    let topSupplier = { name: "-", amount: 0 };
    let needFollowUp: string[] = [];
    let totalOpenReceivables = 0;
    let totalOpenPayables = 0;

    contacts.forEach(c => {
      const fin = contactFinancials[c.id];
      if (!fin || fin.loading) return;
      const name = c.fields["Contact Name"] || "";
      const isSupplier = (c.fields["Contact Type"] || "").includes("مورد");
      const isCustomer = (c.fields["Contact Type"] || "").includes("زبون");

      if (isCustomer && fin.totalDealing > topCustomer.amount) {
        topCustomer = { name, amount: fin.totalDealing };
      }
      if (isSupplier && fin.totalDealing > topSupplier.amount) {
        topSupplier = { name, amount: fin.totalDealing };
      }

      // Need follow-up: balance > 0 for customers (they owe us) and no tx in last 30 days
      if (isCustomer && fin.balance > 0) {
        totalOpenReceivables += fin.balance;
        if (fin.lastTxDate !== "-") {
          const daysDiff = Math.floor((now.getTime() - new Date(fin.lastTxDate).getTime()) / 86400000);
          if (daysDiff > 30) needFollowUp.push(name);
        }
      }
      if (isSupplier && fin.balance < 0) {
        totalOpenPayables += Math.abs(fin.balance);
      }
    });

    return { topCustomer, topSupplier, needFollowUp, totalOpenReceivables, totalOpenPayables };
  }, [contacts, contactFinancials]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return name[0] || "?";
  };

  const formatDate = (d: string) => {
    if (!d || d === "-") return "-";
    try {
      const date = new Date(d);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    } catch { return d; }
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-emerald-600"; // لك (مدين)
    if (balance < 0) return "text-destructive"; // عليك (دائن)
    return "text-muted-foreground"; // صفر
  };

  const getBalanceLabel = (balance: number, isSupplier: boolean) => {
    if (balance === 0) return "مسدد";
    if (isSupplier) {
      return balance > 0 ? "لك" : "عليك";
    }
    return balance > 0 ? "لك" : "عليك";
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">جهات الاتصال</h1>
            <p className="text-xs text-muted-foreground">{contacts.length} جهة اتصال</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            إضافة
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setContactFinancials({}); fetchContacts(); }} disabled={loading} className="rounded-xl">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && contacts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 p-3 text-center border border-emerald-200/30">
            <Users className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{customerCount}</p>
            <p className="text-[10px] text-emerald-600/70 font-medium">زبائن</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 p-3 text-center border border-amber-200/30">
            <ShoppingBag className="h-5 w-5 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{supplierCount}</p>
            <p className="text-[10px] text-amber-600/70 font-medium">موردين</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 p-3 text-center border border-blue-200/30">
            <User className="h-5 w-5 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{contacts.length}</p>
            <p className="text-[10px] text-blue-600/70 font-medium">الإجمالي</p>
          </div>
        </div>
      )}

      {/* Smart Summary Panel */}
      {smartSummary && (
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">ملخص ذكي</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-background/80 backdrop-blur-sm rounded-xl p-2.5 border border-border/30">
                <p className="text-[10px] text-muted-foreground mb-0.5">أعلى زبون</p>
                <p className="text-xs font-bold text-foreground truncate">{smartSummary.topCustomer.name}</p>
                {smartSummary.topCustomer.amount > 0 && (
                  <p className="text-[10px] text-emerald-600 font-medium">₪{smartSummary.topCustomer.amount.toLocaleString()}</p>
                )}
              </div>
              <div className="bg-background/80 backdrop-blur-sm rounded-xl p-2.5 border border-border/30">
                <p className="text-[10px] text-muted-foreground mb-0.5">أعلى مورد</p>
                <p className="text-xs font-bold text-foreground truncate">{smartSummary.topSupplier.name}</p>
                {smartSummary.topSupplier.amount > 0 && (
                  <p className="text-[10px] text-amber-600 font-medium">₪{smartSummary.topSupplier.amount.toLocaleString()}</p>
                )}
              </div>
              <div className="bg-background/80 backdrop-blur-sm rounded-xl p-2.5 border border-border/30">
                <p className="text-[10px] text-muted-foreground mb-0.5">ذمم مفتوحة (لك)</p>
                <p className={`text-sm font-bold ${smartSummary.totalOpenReceivables > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                  ₪{smartSummary.totalOpenReceivables.toLocaleString()}
                </p>
              </div>
              <div className="bg-background/80 backdrop-blur-sm rounded-xl p-2.5 border border-border/30">
                <p className="text-[10px] text-muted-foreground mb-0.5">التزامات (عليك)</p>
                <p className={`text-sm font-bold ${smartSummary.totalOpenPayables > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  ₪{smartSummary.totalOpenPayables.toLocaleString()}
                </p>
              </div>
            </div>
            {smartSummary.needFollowUp.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2.5 border border-amber-200/30">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400">بحاجة متابعة ({smartSummary.needFollowUp.length})</p>
                  <p className="text-[10px] text-amber-600/80">{smartSummary.needFollowUp.slice(0, 3).join("، ")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search */}
      {!loading && contacts.length > 0 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو الشركة أو الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 rounded-xl border-border/50 bg-muted/30"
            dir="rtl"
          />
        </div>
      )}

      {/* Filters */}
      {!loading && contactTypes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType(null)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              !filterType 
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            الكل ({contacts.length})
          </button>
          {contactTypes.map((type) => {
            const count = contacts.filter(c => c.fields["Contact Type"] === type).length;
            return (
              <button
                key={type}
                onClick={() => setFilterType(type!)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filterType === type 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {type} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جاري تحميل جهات الاتصال...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 rounded-2xl">
          <CardContent className="p-5 text-center">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={fetchContacts}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && contacts.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Users className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد جهات اتصال بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أضف زبائنك ومورديك لتنظيم أعمالك</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" /> إضافة جهة اتصال
          </Button>
        </div>
      )}

      {/* Contacts List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((contact) => {
            const f = contact.fields;
            const isExpanded = expandedId === contact.id;
            const config = typeConfig[f["Contact Type"] || ""] || { color: "text-muted-foreground", bgColor: "bg-muted", icon: User, label: "غير محدد" };
            const TypeIcon = config.icon;
            const name = f["Contact Name"] || "بدون اسم";
            const isSupplier = (f["Contact Type"] || "").includes("مورد");
            const fin = contactFinancials[contact.id];

            return (
              <Card
                key={contact.id}
                className={`border-0 shadow-sm rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer ${
                  isExpanded ? "shadow-lg ring-1 ring-primary/10" : "hover:shadow-md"
                }`}
                onClick={() => setExpandedId(isExpanded ? null : contact.id)}
              >
                <CardContent className="p-0">
                  {/* Main Row */}
                  <div className="flex items-start gap-3 p-4">
                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-2xl ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <span className={`text-sm font-bold ${config.color}`}>
                        {getInitials(name)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-foreground truncate">{name}</p>
                      </div>
                      {f["Phone"] && (
                        <div className="flex items-center gap-1 mb-1">
                          <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <p className="text-[11px] text-muted-foreground" dir="ltr">{f["Phone"]}</p>
                        </div>
                      )}
                      {/* Financial Quick Info */}
                      {fin && !fin.loading && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                          <div className="flex items-center gap-1">
                            <Wallet className="h-3 w-3 text-muted-foreground/60" />
                            <span className={`text-[11px] font-bold ${getBalanceColor(fin.balance)}`}>
                              ₪{Math.abs(fin.balance).toLocaleString()}
                            </span>
                            <span className={`text-[9px] ${getBalanceColor(fin.balance)}`}>
                              ({getBalanceLabel(fin.balance, isSupplier)})
                            </span>
                          </div>
                          {fin.invoiceCount > 0 && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3 text-muted-foreground/60" />
                              <span className="text-[11px] text-muted-foreground">{fin.invoiceCount} فاتورة</span>
                            </div>
                          )}
                          {fin.lastTxDate !== "-" && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground/60" />
                              <span className="text-[11px] text-muted-foreground">{formatDate(fin.lastTxDate)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {fin?.loading && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
                          <span className="text-[10px] text-muted-foreground/40">جاري التحميل...</span>
                        </div>
                      )}
                    </div>

                    {/* Type Badge + Balance Indicator */}
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`text-[10px] px-2.5 py-0.5 rounded-lg font-semibold border-0 ${config.bgColor} ${config.color}`}>
                        <TypeIcon className="h-3 w-3 ml-1" />
                        {config.label}
                      </Badge>
                      {fin && !fin.loading && fin.totalDealing > 0 && (
                        <span className="text-[10px] text-muted-foreground">₪{fin.totalDealing.toLocaleString()}</span>
                      )}
                      <div className="text-muted-foreground/50">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: Mini Summary */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t border-border/50 pt-3 space-y-3">
                        {/* Financial Summary Grid */}
                        {fin && !fin.loading && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-muted/30 rounded-xl p-2.5 text-center">
                              <p className="text-[9px] text-muted-foreground mb-0.5">{isSupplier ? "إجمالي المشتريات" : "إجمالي المبيعات"}</p>
                              <p className="text-xs font-bold text-foreground">₪{fin.totalSales.toLocaleString()}</p>
                            </div>
                            <div className="bg-muted/30 rounded-xl p-2.5 text-center">
                              <p className="text-[9px] text-muted-foreground mb-0.5">{isSupplier ? "إجمالي المدفوع" : "إجمالي التحصيل"}</p>
                              <p className="text-xs font-bold text-foreground">₪{fin.totalCollections.toLocaleString()}</p>
                            </div>
                            <div className={`rounded-xl p-2.5 text-center ${fin.balance > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : fin.balance < 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/30"}`}>
                              <p className="text-[9px] text-muted-foreground mb-0.5">الرصيد</p>
                              <p className={`text-xs font-bold ${getBalanceColor(fin.balance)}`}>
                                ₪{Math.abs(fin.balance).toLocaleString()}
                              </p>
                              <p className={`text-[8px] ${getBalanceColor(fin.balance)}`}>{getBalanceLabel(fin.balance, isSupplier)}</p>
                            </div>
                          </div>
                        )}

                        {/* Last 3 Transactions */}
                        {fin && !fin.loading && fin.lastTransactions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">آخر المعاملات</p>
                            <div className="space-y-1">
                              {fin.lastTransactions.map((tx, i) => (
                                <div key={i} className="flex items-center justify-between py-1.5 px-2 bg-muted/20 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[10px] text-muted-foreground">{formatDate(tx.fields.Date || "")}</span>
                                    <span className="text-[11px] text-foreground truncate">{tx.fields["Transaction Type"] || tx.fields.Description || "-"}</span>
                                  </div>
                                  <span className="text-[11px] font-bold text-foreground flex-shrink-0">₪{(tx.fields.Amount || 0).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Edit & Delete Buttons */}
                        <div className="flex gap-2">
                          <button
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors flex-1"
                            onClick={(e) => { e.stopPropagation(); openEditDialog(contact); }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                            <span className="text-[11px] font-medium text-foreground">تعديل</span>
                          </button>
                          <button
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setDeleteContact(contact); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            <span className="text-[11px] font-medium text-destructive">حذف</span>
                          </button>
                        </div>

                        {/* Statement Button */}
                        <button
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors w-full"
                          onClick={(e) => { e.stopPropagation(); setStatementContact({ id: contact.id, name, type: f["Contact Type"] || "" }); }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Receipt className="h-4 w-4 text-primary" />
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-primary">كشف حساب كامل</p>
                            <p className="text-[10px] text-muted-foreground">عرض جميع المعاملات المالية</p>
                          </div>
                        </button>

                        {/* Contact details */}
                        <div className="flex flex-wrap gap-2">
                          {f["Phone"] && (
                            <a href={`tel:${f["Phone"]}`} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors" onClick={e => e.stopPropagation()}>
                              <Phone className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="text-[11px] text-foreground" dir="ltr">{f["Phone"]}</span>
                            </a>
                          )}
                          {f["Email"] && (
                            <a href={`mailto:${f["Email"]}`} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors" onClick={e => e.stopPropagation()}>
                              <Mail className="h-3.5 w-3.5 text-blue-600" />
                              <span className="text-[11px] text-foreground" dir="ltr">{f["Email"]}</span>
                            </a>
                          )}
                          {f["Company"] && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30">
                              <Building2 className="h-3.5 w-3.5 text-purple-600" />
                              <span className="text-[11px] text-foreground">{f["Company"]}</span>
                            </div>
                          )}
                          {f["Address"] && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30">
                              <MapPin className="h-3.5 w-3.5 text-rose-600" />
                              <span className="text-[11px] text-foreground">{f["Address"]}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* No search results */}
      {!loading && !error && contacts.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد نتائج للبحث</p>
        </div>
      )}

      {/* Add Contact Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center">إضافة جهة اتصال جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2" dir="rtl">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">الاسم *</label>
              <Input value={newContact.name} onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">النوع *</label>
              <Select value={newContact.type} onValueChange={(v) => setNewContact(p => ({ ...p, type: v }))} dir="rtl">
                <SelectTrigger className="rounded-xl text-right"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {contactTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">رقم الهاتف</label>
              <Input value={newContact.phone} onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">البريد الإلكتروني</label>
              <Input value={newContact.email} onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">الشركة</label>
              <Input value={newContact.company} onChange={(e) => setNewContact(p => ({ ...p, company: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">العنوان</label>
              <Input value={newContact.address} onChange={(e) => setNewContact(p => ({ ...p, address: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block text-right">سقف الدين (₪)</label>
                <Input type="number" value={newContact.creditLimit} onChange={(e) => setNewContact(p => ({ ...p, creditLimit: e.target.value }))} dir="rtl" className="rounded-xl text-right" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block text-right">أيام التسديد</label>
                <Input type="number" value={newContact.paymentDays} onChange={(e) => setNewContact(p => ({ ...p, paymentDays: e.target.value }))} dir="rtl" className="rounded-xl text-right" placeholder="30" />
              </div>
            </div>
            <Button onClick={handleAddContact} className="w-full gap-2 rounded-xl h-11 shadow-md shadow-primary/20" disabled={adding || !newContact.name.trim() || !newContact.type}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة جهة الاتصال
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={!!editContact} onOpenChange={(v) => !v && setEditContact(null)}>
        <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center">تعديل جهة الاتصال</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2" dir="rtl">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">الاسم *</label>
              <Input value={editData.name} onChange={(e) => setEditData(p => ({ ...p, name: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">النوع *</label>
              <Select value={editData.type} onValueChange={(v) => setEditData(p => ({ ...p, type: v }))} dir="rtl">
                <SelectTrigger className="rounded-xl text-right"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {contactTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">رقم الهاتف</label>
              <Input value={editData.phone} onChange={(e) => setEditData(p => ({ ...p, phone: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">البريد الإلكتروني</label>
              <Input value={editData.email} onChange={(e) => setEditData(p => ({ ...p, email: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">الشركة</label>
              <Input value={editData.company} onChange={(e) => setEditData(p => ({ ...p, company: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-right">العنوان</label>
              <Input value={editData.address} onChange={(e) => setEditData(p => ({ ...p, address: e.target.value }))} dir="rtl" className="rounded-xl text-right" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block text-right">سقف الدين (₪)</label>
                <Input type="number" value={editData.creditLimit} onChange={(e) => setEditData(p => ({ ...p, creditLimit: e.target.value }))} dir="rtl" className="rounded-xl text-right" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block text-right">أيام التسديد</label>
                <Input type="number" value={editData.paymentDays} onChange={(e) => setEditData(p => ({ ...p, paymentDays: e.target.value }))} dir="rtl" className="rounded-xl text-right" placeholder="30" />
              </div>
            </div>
            <Button onClick={handleEditContact} className="w-full gap-2 rounded-xl h-11 shadow-md shadow-primary/20" disabled={editing || !editData.name.trim()}>
              {editing && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteContact} onOpenChange={(v) => !v && setDeleteContact(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف جهة الاتصال</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {deleteContact && contactFinancials[deleteContact.id]?.totalDealing > 0
                ? "لا يمكن حذف هذه الجهة لأنها مرتبطة بمعاملات مالية. قم بحذف أو نقل المعاملات أولاً."
                : `هل أنت متأكد من حذف "${deleteContact?.fields["Contact Name"]}"؟ لا يمكن التراجع عن هذا الإجراء.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            {deleteContact && !(contactFinancials[deleteContact.id]?.totalDealing > 0) && (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl gap-2"
                onClick={handleDeleteContact}
                disabled={deleting}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                حذف
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contact Statement Dialog */}
      {statementContact && (
        <ContactStatementDialog
          open={!!statementContact}
          onClose={() => setStatementContact(null)}
          contactId={statementContact.id}
          contactName={statementContact.name}
          contactType={statementContact.type}
        />
      )}
    </div>
  );
};

export default ContactsPage;

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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  linked_account_code: string | null;
  notes: string | null;
  is_active: boolean | null;
}

interface Transaction {
  id: string;
  description: string;
  transaction_type: string;
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  currency: string;
  transaction_date: string;
}

interface ContactFinancials {
  balance: number;
  invoiceCount: number;
  lastTxDate: string;
  totalDealing: number;
  lastTransactions: Transaction[];
  loading: boolean;
}

const typeConfig: Record<string, { color: string; bgColor: string; icon: typeof Users; label: string }> = {
  "عميل": { color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", icon: Users, label: "عميل" },
  "زبون": { color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", icon: Users, label: "زبون" },
  "مورد": { color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30", icon: ShoppingBag, label: "مورد" },
  "زبون ومورد": { color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30", icon: User, label: "زبون ومورد" },
};

const contactTypeOptions = [
  { value: "عميل", label: "عميل" },
  { value: "مورد", label: "مورد" },
  { value: "زبون ومورد", label: "زبون ومورد" },
];

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
  const [newContact, setNewContact] = useState({ name: "", type: "", phone: "", email: "", address: "" });
  const [contactFinancials, setContactFinancials] = useState<Record<string, ContactFinancials>>({});
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editData, setEditData] = useState({ name: "", type: "", phone: "", email: "", address: "" });
  const [editing, setEditing] = useState(false);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchContacts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('contacts').select('*').eq('user_id', user.id).order('contact_name');
      if (error) throw error;
      setContacts(data || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContacts(); }, [user]);

  // Fetch financials for expanded contact
  useEffect(() => {
    if (!user || !expandedId || contactFinancials[expandedId]) return;
    setContactFinancials(prev => ({ ...prev, [expandedId]: { balance: 0, invoiceCount: 0, lastTxDate: "-", totalDealing: 0, lastTransactions: [], loading: true } }));
    
    supabase.from('transactions').select('*').eq('user_id', user.id).eq('contact_id', expandedId).eq('is_deleted', false).order('transaction_date', { ascending: false }).limit(50)
      .then(({ data }) => {
        const txs = data || [];
        let totalDebit = 0, totalCredit = 0, invoiceCount = 0, totalDealing = 0;
        txs.forEach(tx => {
          totalDealing += tx.amount || 0;
          if (tx.transaction_type?.includes("فاتورة")) invoiceCount++;
          // Simple heuristic: debit = owed to us, credit = paid
          totalDebit += tx.amount || 0;
        });
        const lastTxDate = txs[0]?.transaction_date || "-";
        setContactFinancials(prev => ({
          ...prev,
          [expandedId]: { balance: totalDebit - totalCredit, invoiceCount, lastTxDate, totalDealing, lastTransactions: txs.slice(0, 3), loading: false }
        }));
      });
  }, [user, expandedId]);

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.type || !user) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('contacts').insert({
        user_id: user.id,
        contact_name: newContact.name.trim(),
        contact_type: newContact.type,
        phone: newContact.phone || null,
        email: newContact.email || null,
        address: newContact.address || null,
      });
      if (error) throw error;
      toast({ title: "تم إضافة جهة الاتصال بنجاح ✅" });
      setNewContact({ name: "", type: "", phone: "", email: "", address: "" });
      setShowAddDialog(false);
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
      const { error } = await supabase.from('contacts').update({
        contact_name: editData.name.trim(),
        contact_type: editData.type,
        phone: editData.phone || null,
        email: editData.email || null,
        address: editData.address || null,
      }).eq('id', editContact.id);
      if (error) throw error;
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
    setDeleting(true);
    try {
      // Check if contact has transactions
      const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('contact_id', deleteContact.id);
      if (count && count > 0) {
        toast({ title: "لا يمكن حذف جهة اتصال مرتبطة بمعاملات مالية", variant: "destructive" });
        setDeleteContact(null);
        setDeleting(false);
        return;
      }
      const { error } = await supabase.from('contacts').delete().eq('id', deleteContact.id);
      if (error) throw error;
      toast({ title: "تم حذف جهة الاتصال ✅" });
      setDeleteContact(null);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openEditDialog = (contact: Contact) => {
    setEditData({
      name: contact.contact_name,
      type: contact.contact_type,
      phone: contact.phone || "",
      email: contact.email || "",
      address: contact.address || "",
    });
    setEditContact(contact);
  };

  const filtered = contacts.filter(c => {
    const matchesType = !filterType || c.contact_type === filterType;
    const matchesSearch = !searchQuery || c.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery);
    return matchesType && matchesSearch;
  });

  const customerCount = contacts.filter(c => c.contact_type === "عميل" || c.contact_type === "زبون" || c.contact_type === "زبون ومورد").length;
  const supplierCount = contacts.filter(c => c.contact_type === "مورد" || c.contact_type === "زبون ومورد").length;

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return name[0] || "?";
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors"><ArrowRight className="h-5 w-5 text-foreground" /></button>
          <div>
            <h1 className="text-xl font-bold text-foreground">جهات الاتصال</h1>
            <p className="text-xs text-muted-foreground">{contacts.length} جهة اتصال</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowAddDialog(true)}><Plus className="h-4 w-4" />إضافة</Button>
          <Button variant="ghost" size="icon" onClick={() => { setContactFinancials({}); fetchContacts(); }} disabled={loading} className="rounded-xl"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {!loading && contacts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 p-3 text-center border border-emerald-200/30">
            <Users className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{customerCount}</p>
            <p className="text-[10px] text-muted-foreground">عملاء</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 p-3 text-center border border-amber-200/30">
            <ShoppingBag className="h-5 w-5 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{supplierCount}</p>
            <p className="text-[10px] text-muted-foreground">موردين</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 p-3 text-center border border-blue-200/30">
            <User className="h-5 w-5 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{contacts.length}</p>
            <p className="text-[10px] text-muted-foreground">الكل</p>
          </div>
        </div>
      )}

      {!loading && contacts.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث..." className="pr-9 rounded-xl text-sm" dir="rtl" />
          </div>
          <div className="flex gap-1">
            <Button variant={filterType === null ? "default" : "outline"} size="sm" className="rounded-xl text-xs" onClick={() => setFilterType(null)}>الكل</Button>
            {contactTypeOptions.map(opt => (
              <Button key={opt.value} variant={filterType === opt.value ? "default" : "outline"} size="sm" className="rounded-xl text-xs" onClick={() => setFilterType(opt.value)}>{opt.label}</Button>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchContacts}>إعادة المحاولة</Button>
        </CardContent></Card>
      )}

      {!loading && !error && (
        <div className="space-y-2.5">
          {filtered.map(contact => {
            const config = typeConfig[contact.contact_type] || typeConfig["عميل"];
            const Icon = config.icon;
            const isExpanded = expandedId === contact.id;
            const fin = contactFinancials[contact.id];

            return (
              <Card key={contact.id} className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : contact.id)}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${config.bgColor} ${config.color}`}>
                      {getInitials(contact.contact_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{contact.contact_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className={`text-[10px] ${config.bgColor} ${config.color}`}>{config.label}</Badge>
                        {contact.phone && <span className="text-[10px] text-muted-foreground">{contact.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditDialog(contact); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteContact(contact); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
                      {contact.email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" />{contact.email}</div>}
                      {contact.address && <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{contact.address}</div>}
                      
                      {fin && !fin.loading && fin.totalDealing > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="rounded-xl bg-background p-2 text-center border">
                            <p className="text-xs text-muted-foreground">إجمالي التعاملات</p>
                            <p className="text-sm font-bold text-foreground">{fin.totalDealing.toLocaleString()}</p>
                          </div>
                          <div className="rounded-xl bg-background p-2 text-center border">
                            <p className="text-xs text-muted-foreground">عدد الفواتير</p>
                            <p className="text-sm font-bold text-foreground">{fin.invoiceCount}</p>
                          </div>
                        </div>
                      )}
                      {fin?.loading && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full rounded-xl gap-2 mt-1"
                        onClick={() => navigate(`/account-statement?contact_id=${contact.id}&contact_name=${encodeURIComponent(contact.contact_name)}&contact_type=${encodeURIComponent(contact.contact_type)}`)}
                      >
                        <FileText className="h-4 w-4" />
                        كشف حساب
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-16"><p className="text-sm text-muted-foreground">لا توجد جهات اتصال</p></div>}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة جهة اتصال</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="الاسم" value={newContact.name} onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))} dir="rtl" />
            <Select value={newContact.type} onValueChange={(v) => setNewContact(p => ({ ...p, type: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {contactTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="الهاتف" value={newContact.phone} onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))} />
            <Input placeholder="البريد الإلكتروني" value={newContact.email} onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="العنوان" value={newContact.address} onChange={(e) => setNewContact(p => ({ ...p, address: e.target.value }))} dir="rtl" />
            <Button onClick={handleAddContact} disabled={adding || !newContact.name.trim() || !newContact.type} className="w-full rounded-xl">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editContact} onOpenChange={(o) => !o && setEditContact(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>تعديل جهة الاتصال</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editData.name} onChange={(e) => setEditData(p => ({ ...p, name: e.target.value }))} dir="rtl" />
            <Select value={editData.type} onValueChange={(v) => setEditData(p => ({ ...p, type: v }))} dir="rtl">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {contactTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={editData.phone} onChange={(e) => setEditData(p => ({ ...p, phone: e.target.value }))} placeholder="الهاتف" />
            <Input value={editData.email} onChange={(e) => setEditData(p => ({ ...p, email: e.target.value }))} placeholder="البريد" />
            <Input value={editData.address} onChange={(e) => setEditData(p => ({ ...p, address: e.target.value }))} placeholder="العنوان" dir="rtl" />
            <Button onClick={handleEditContact} disabled={editing} className="w-full rounded-xl">
              {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteContact} onOpenChange={(o) => !o && setDeleteContact(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف جهة الاتصال</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف "{deleteContact?.contact_name}"؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleDeleteContact} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ContactsPage;

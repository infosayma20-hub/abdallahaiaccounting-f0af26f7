import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, Phone, Mail, Building2, MapPin, User, Users, ShoppingBag, Search, ChevronDown, ChevronUp, Sparkles, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  };
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
    name: "", type: "", phone: "", email: "", company: "", address: "",
  });
  const [statementContact, setStatementContact] = useState<{ id: string; name: string; type: string } | null>(null);

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
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create contact");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      toast({ title: "تم إضافة جهة الاتصال بنجاح ✅" });
      setNewContact({ name: "", type: "", phone: "", email: "", company: "", address: "" });
      setShowAddDialog(false);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
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

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return name[0] || "?";
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")} className="p-2 rounded-xl hover:bg-muted transition-colors">
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
          <Button variant="ghost" size="icon" onClick={fetchContacts} disabled={loading} className="rounded-xl">
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
            const config = typeConfig[type!] || {};
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
            const hasDetails = true; // Always allow expand for statement button

            return (
              <Card
                key={contact.id}
                className={`border-0 shadow-sm rounded-2xl overflow-hidden transition-all duration-300 ${
                  isExpanded ? "shadow-lg ring-1 ring-primary/10" : "hover:shadow-md"
                }`}
                onClick={() => setExpandedId(isExpanded ? null : contact.id)}
              >
                <CardContent className="p-0">
                  {/* Main Row */}
                  <div className="flex items-center gap-3 p-4">
                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-2xl ${config.bgColor} flex items-center justify-center flex-shrink-0 relative`}>
                      <span className={`text-sm font-bold ${config.color}`}>
                        {getInitials(name)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-foreground truncate">{name}</p>
                      </div>
                      {f["Company"] && (
                        <div className="flex items-center gap-1 mb-1">
                          <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <p className="text-[11px] text-muted-foreground truncate">{f["Company"]}</p>
                        </div>
                      )}
                      {f["Phone"] && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <p className="text-[11px] text-muted-foreground" dir="ltr">{f["Phone"]}</p>
                        </div>
                      )}
                    </div>

                    {/* Type Badge + Expand */}
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`text-[10px] px-2.5 py-0.5 rounded-lg font-semibold border-0 ${config.bgColor} ${config.color}`}>
                        <TypeIcon className="h-3 w-3 ml-1" />
                        {config.label}
                      </Badge>
                      {hasDetails && (
                        <div className="text-muted-foreground/50">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && hasDetails && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t border-border/50 pt-3 space-y-3">
                        {/* Statement Button */}
                        <button
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors w-full"
                          onClick={(e) => { e.stopPropagation(); setStatementContact({ id: contact.id, name, type: f["Contact Type"] || "" }); }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Receipt className="h-4 w-4 text-primary" />
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-primary">كشف حساب</p>
                            <p className="text-[10px] text-muted-foreground">عرض جميع المعاملات المالية</p>
                          </div>
                        </button>
                        {f["Phone"] && (
                          <a href={`tel:${f["Phone"]}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors" onClick={e => e.stopPropagation()}>
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                              <Phone className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground">الهاتف</p>
                              <p className="text-xs font-medium text-foreground" dir="ltr">{f["Phone"]}</p>
                            </div>
                          </a>
                        )}
                        {f["Email"] && (
                          <a href={`mailto:${f["Email"]}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors" onClick={e => e.stopPropagation()}>
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground">البريد الإلكتروني</p>
                              <p className="text-xs font-medium text-foreground" dir="ltr">{f["Email"]}</p>
                            </div>
                          </a>
                        )}
                        {f["Company"] && (
                          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30">
                            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground">الشركة</p>
                              <p className="text-xs font-medium text-foreground">{f["Company"]}</p>
                            </div>
                          </div>
                        )}
                        {f["Address"] && (
                          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                              <MapPin className="h-4 w-4 text-rose-600" />
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground">العنوان</p>
                              <p className="text-xs font-medium text-foreground">{f["Address"]}</p>
                            </div>
                          </div>
                        )}
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
            <Button onClick={handleAddContact} className="w-full gap-2 rounded-xl h-11 shadow-md shadow-primary/20" disabled={adding || !newContact.name.trim() || !newContact.type}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة جهة الاتصال
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, Phone, Mail, Building2, MapPin, User, Users, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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

const typeColors: Record<string, string> = {
  "زبون": "bg-primary/10 text-primary",
  "مورد": "bg-warning/10 text-warning",
  "زبون ومورد": "bg-accent text-accent-foreground",
};

const typeIcons: Record<string, typeof Users> = {
  "زبون": Users,
  "مورد": ShoppingBag,
  "زبون ومورد": User,
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
  const [newContact, setNewContact] = useState({
    name: "", type: "", phone: "", email: "", company: "", address: "",
  });

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
  const filtered = filterType ? contacts.filter(c => c.fields["Contact Type"] === filterType) : contacts;

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">جهات الاتصال</h1>
            <p className="text-xs text-muted-foreground">{contacts.length} جهة اتصال</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchContacts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {!loading && contactTypes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              !filterType ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
            }`}
          >
            الكل
          </button>
          {contactTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type!)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterType === type ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchContacts}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">لا توجد جهات اتصال بعد</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-3 w-3 ml-1" /> إضافة جهة اتصال
              </Button>
            </div>
          )}
          {filtered.map((contact) => {
            const f = contact.fields;
            const isExpanded = expandedId === contact.id;
            const TypeIcon = typeIcons[f["Contact Type"] || ""] || User;
            return (
              <Card
                key={contact.id}
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setExpandedId(isExpanded ? null : contact.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <TypeIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f["Contact Name"] || "بدون اسم"}</p>
                        {f["Company"] && (
                          <p className="text-[10px] text-muted-foreground">{f["Company"]}</p>
                        )}
                      </div>
                    </div>
                    {f["Contact Type"] && (
                      <Badge variant="secondary" className={`text-[10px] ${typeColors[f["Contact Type"]] || ""}`}>
                        {f["Contact Type"]}
                      </Badge>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2.5">
                      {f["Phone"] && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground" dir="ltr">{f["Phone"]}</span>
                        </div>
                      )}
                      {f["Email"] && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground" dir="ltr">{f["Email"]}</span>
                        </div>
                      )}
                      {f["Address"] && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground">{f["Address"]}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Contact Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة جهة اتصال</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="الاسم *" value={newContact.name} onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))} dir="rtl" />
            <Select value={newContact.type} onValueChange={(v) => setNewContact(p => ({ ...p, type: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="النوع *" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {contactTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="رقم الهاتف" value={newContact.phone} onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
            <Input placeholder="البريد الإلكتروني" value={newContact.email} onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))} dir="ltr" />
            <Input placeholder="الشركة" value={newContact.company} onChange={(e) => setNewContact(p => ({ ...p, company: e.target.value }))} dir="rtl" />
            <Input placeholder="العنوان" value={newContact.address} onChange={(e) => setNewContact(p => ({ ...p, address: e.target.value }))} dir="rtl" />
            <Button onClick={handleAddContact} className="w-full gap-2" disabled={adding || !newContact.name.trim() || !newContact.type}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactsPage;

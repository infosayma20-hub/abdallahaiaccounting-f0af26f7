import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Undo2, Search, Save } from "lucide-react";

/**
 * Rep Returns — مردود مبيعات بسيط للمندوب.
 * يستخدم RPC الموحد create_return_with_entry (Dr 4110 / Cr 1130).
 * بدون ربط بفاتورة محددة — مبلغ + عميل + ملاحظة.
 */
export default function RepReturnsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name")
        .eq("auth_user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      setRep(r);
      const { data: cts } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", r.user_id)
        .in("contact_type", ["عميل", "عميل ومورد"])
        .eq("is_active", true).eq("is_archived", false)
        .limit(500);
      setContacts((cts || []).map((c: any) => ({ ...c, name: c.contact_name })));
      setLoading(false);
    })();
  }, [user?.id]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts.filter((c) => (c.name || "").toLowerCase().includes(q)).slice(0, 50);
  }, [search, contacts]);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const handleSave = async () => {
    if (!rep) return;
    if (!contactId) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "أدخل مبلغًا صحيحًا", variant: "destructive" }); return; }
    if (saving) return;
    setSaving(true);
    try {
      const idem = `RET-REP-${rep.id}-${Date.now()}`;
      const { data, error } = await (supabase as any).rpc("create_return_with_entry", {
        p_user_id: rep.user_id,
        p_contact_id: contactId,
        p_amount: amt,
        p_kind: "sale",
        p_description: description || `مردود مبيعات — ${selectedContact?.name || ""}`,
        p_idempotency_key: idem,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل التسجيل");
      toast({ title: "تم تسجيل المردود", description: `مرجع: ${data.reference || "-"}` });
      navigate("/rep/home");
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!rep) return <div className="p-6 text-center text-muted-foreground">لم يتم العثور على بيانات المندوب</div>;

  return (
    <div dir="rtl" className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Undo2 className="w-5 h-5 text-rose-500" />
        <h1 className="text-xl font-bold text-foreground">مردود مبيعات</h1>
      </div>

      <Card className="p-4 space-y-3">
        <Label>العميل</Label>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث بالاسم..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {selectedContact ? (
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
            <span className="font-medium">{selectedContact.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setContactId("")}>تغيير</Button>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-3 text-sm text-muted-foreground">لا توجد نتائج</div>
            ) : filteredContacts.map((c) => (
              <button key={c.id} onClick={() => { setContactId(c.id); setSearch(""); }}
                className="w-full text-right p-2.5 hover:bg-muted/60 text-sm">
                {c.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <Label>المبلغ (₪)</Label>
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" dir="ltr" />
        </div>
        <div>
          <Label>السبب / وصف</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="بضاعة تالفة، خطأ في الكمية..." rows={2} />
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving || !contactId || !amount} className="w-full h-12 text-base">
        {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Save className="w-5 h-5 ml-2" />}
        تسجيل المردود
      </Button>
    </div>
  );
}
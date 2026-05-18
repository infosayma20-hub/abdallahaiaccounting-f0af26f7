import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Save, Search } from "lucide-react";
import { callCreateReceiptRpc } from "@/lib/voucher-rpc";

/**
 * Rep Collect — Mobile-first تحصيل بسيط للمندوب.
 * - يختار العميل
 * - يعرض الرصيد المستحق
 * - يدخل المبلغ
 * - يحفظ سند قبض عبر RPC الموحد (create_receipt_with_entry)
 *   نقدي → 1110 (الصندوق)، عميل → 1130 (ذمم العملاء).
 * لا يفتح أي شاشة محاسبية معقدة — UI مبسط فقط.
 */
export default function RepCollectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name, cash_box_id")
        .eq("auth_user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      let cashAccountCode: string | null = null;
      let cashBoxName: string | null = null;
      if (r.cash_box_id) {
        const { data: cb } = await (supabase as any)
          .from("cash_boxes")
          .select("id, name, gl_account_code, is_active")
          .eq("id", r.cash_box_id)
          .maybeSingle();
        if (cb && cb.is_active && cb.gl_account_code) {
          cashAccountCode = cb.gl_account_code;
          cashBoxName = cb.name;
        }
      }
      setRep({ ...r, cash_account_code: cashAccountCode, cash_box_name: cashBoxName });
      const { data: cts } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", r.user_id)
        .in("contact_type", ["عميل", "عميل ومورد"])
        .eq("is_active", true)
        .eq("is_archived", false)
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

  const loadBalance = async (id: string) => {
    if (!rep) return;
    setLoadingBalance(true);
    setBalance(null);
    try {
      const { data, error: txErr } = await (supabase as any)
        .from("transactions")
        .select("amount, debit_account_code, credit_account_code")
        .eq("user_id", rep.user_id)
        .eq("contact_id", id)
        .eq("is_deleted", false);
      if (txErr) throw txErr;
      const rows = data || [];
      // ذمم عملاء: نقبل عائلة 113 كاملة (1130/1131/1135...) لأنها قد تُعرّف
      // كحسابات فرعية محاسبياً بدون أن يكون رقمها بادئاً بـ 1130 نصياً.
      // ونقبل أيضاً 2115 (دفعات مقدمة من العملاء) كدائن طبيعي.
      const arRoots = ["113", "2115"];
      const matchesAR = (code: string | null | undefined) =>
        !!code && arRoots.some((r) => code === r || code.startsWith(r));
      const debit = rows
        .filter((t: any) => matchesAR(t.debit_account_code))
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const credit = rows
        .filter((t: any) => matchesAR(t.credit_account_code))
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      setBalance(debit - credit);
    } catch (e: any) {
      toast({ title: "تعذر جلب الرصيد", description: e.message, variant: "destructive" });
    } finally {
      setLoadingBalance(false);
    }
  };

  const onPickContact = (id: string) => {
    setContactId(id);
    setSearch("");
    loadBalance(id);
  };

  const save = async () => {
    if (!rep) return;
    if (!rep.cash_account_code) {
      toast({ title: "لا يوجد صندوق نقدي مرتبط", description: "يرجى ربط المندوب بصندوق نقدي من الإدارة قبل استخدام التحصيل أو المصاريف.", variant: "destructive" });
      return;
    }
    if (!contactId) { toast({ title: "اختر عميلاً", variant: "destructive" }); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast({ title: "أدخل مبلغاً صحيحاً", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const idempotencyKey = `REP-RCP-${Date.now()}`;
      const result = await callCreateReceiptRpc({
        userId: rep.user_id,
        contactId,
        contactName: selectedContact?.name ?? null,
        amount: amt,
        paymentMethod: "نقدي",
        currency: "شيكل",
        cashAccountCode: rep.cash_account_code,
        contactAccountCode: "1130",
        description: `تحصيل من ${selectedContact?.name ?? "عميل"} — مندوب`,
        idempotencyKey,
      });
      if (!result.success) throw new Error(result.error || "فشل التحصيل");

      // وسم الحركة المحاسبية بـ sales_rep_id (ربط نظيف بدل JSON في notes)
      if (result.transaction_id) {
        await (supabase as any)
          .from("transactions")
          .update({ sales_rep_id: rep.id })
          .eq("id", result.transaction_id);
      }

      // إنشاء سجل سند قبض في receipt_vouchers ليظهر في شاشة سندات القبض
      // (مرتبط بالـ transaction عبر linked_transaction_id)
      if (!result.duplicate && result.transaction_id) {
        const { data: existingRV } = await (supabase as any)
          .from("receipt_vouchers")
          .select("id")
          .eq("user_id", rep.user_id)
          .eq("linked_transaction_id", result.transaction_id)
          .maybeSingle();
        if (!existingRV) {
          const { error: rvErr } = await (supabase as any)
            .from("receipt_vouchers")
            .insert({
              user_id: rep.user_id,
              contact_id: contactId,
              contact_name: selectedContact?.name ?? null,
              payment_date: new Date().toISOString().slice(0, 10),
              amount: amt,
              payment_method: "نقدي",
              cash_box_id: rep.cash_box_id ?? null,
              deposit_account_code: rep.cash_account_code,
              notes: `تحصيل من بورتال المندوب — ${rep.full_name ?? ""}`.trim(),
              status: "posted",
              linked_transaction_id: result.transaction_id,
            });
          if (rvErr) console.error("[RepCollect] receipt_voucher insert failed:", rvErr);
        }
      }

      toast({ title: result.duplicate ? "هذا التحصيل مسجّل مسبقاً" : "تم التحصيل بنجاح", description: `${amt.toFixed(2)} ₪` });
      setAmount("");
      await loadBalance(contactId);
      navigate("/rep");
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (rep && !rep.cash_account_code) {
    return (
      <div className="p-4">
        <Card className="p-6 space-y-3 text-center">
          <DollarSign className="w-10 h-10 text-destructive mx-auto" />
          <h3 className="font-bold text-foreground">لا يوجد صندوق نقدي مرتبط</h3>
          <p className="text-sm text-muted-foreground">
            يرجى ربط المندوب بصندوق نقدي من الإدارة قبل استخدام التحصيل أو المصاريف.
          </p>
          <Button variant="outline" className="w-full" onClick={() => navigate("/rep")}>رجوع</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-foreground">تحصيل من عميل</h2>
        </div>

        <div className="space-y-2">
          <Label>العميل</Label>
          {contactId && selectedContact ? (
            <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/40">
              <div className="font-medium text-sm">{selectedContact.name}</div>
              <button className="text-xs text-muted-foreground underline" onClick={() => { setContactId(""); setBalance(null); }}>تغيير</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="ابحث باسم العميل" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10 h-11" />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md">
                {filteredContacts.map((c) => (
                  <button key={c.id} onClick={() => onPickContact(c.id)} className="w-full text-right p-3 hover:bg-muted text-sm border-b border-border last:border-0">
                    {c.name}
                  </button>
                ))}
                {filteredContacts.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>}
              </div>
            </>
          )}
        </div>

        {contactId && (
          <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border border-primary/20">
            <div className="text-xs text-muted-foreground">الرصيد المستحق</div>
            <div className="font-bold text-foreground">
              {loadingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : `${(balance ?? 0).toFixed(2)} ₪`}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <Label>المبلغ المُحصَّل (₪)</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="h-12 text-lg text-center font-bold"
        />
        <Button className="w-full h-12 text-base" onClick={save} disabled={saving || !contactId || !amount}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-2" /> حفظ التحصيل</>}
        </Button>
      </Card>
    </div>
  );
}
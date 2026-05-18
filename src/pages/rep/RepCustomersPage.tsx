import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Search, Wallet, ExternalLink, Phone } from "lucide-react";

/**
 * RepCustomersPage — قائمة العملاء المعيّنين لهذا المندوب + بطاقة العهدة الشخصية.
 * يقرأ من contacts.sales_rep_id (الربط الحقيقي على مستوى DB).
 */
export default function RepCustomersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [repContact, setRepContact] = useState<any>(null);
  const [repBalance, setRepBalance] = useState<number>(0);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      // 1) جلب المندوب + الـ contact المرتبط به
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name, contact_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!r) { setLoading(false); return; }
      setRep(r);

      // 2) جلب contact المندوب نفسه (للعهدة الشخصية)
      if (r.contact_id) {
        const { data: c } = await (supabase as any)
          .from("contacts")
          .select("id, contact_name, linked_account_code, phone, email")
          .eq("id", r.contact_id)
          .maybeSingle();
        setRepContact(c);

        // احسب رصيد عهدة المندوب من قيود حسابه الفرعي (Single source of truth)
        if (c?.id) {
          const { data: stmt } = await (supabase as any).rpc("get_contact_statement", {
            p_user_id: r.user_id,
            p_contact_id: c.id,
            p_from_date: null,
            p_to_date: null,
          });
          const arr = (stmt as any[]) || [];
          setRepBalance(arr.length ? Number(arr[arr.length - 1].balance_running || 0) : 0);
        }
      }

      // 3) عملاء المندوب + أرصدتهم الحقيقية من ledger (RPC)
      const { data: custs } = await (supabase as any).rpc("get_rep_customers_with_balances", {
        p_user_id: r.user_id,
        p_sales_rep_id: r.id,
      });
      const mapped = ((custs as any[]) || []).map((x) => ({
        id: x.contact_id,
        contact_name: x.contact_name,
        phone: x.phone,
        linked_account_code: x.linked_account_code,
        current_balance: Number(x.balance || 0),
        last_tx_date: x.last_tx_date,
      }));
      setCustomers(mapped);
      setLoading(false);
    })();
  }, [user?.id]);

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(c.contact_name || "").toLowerCase().includes(q) ||
      String(c.phone || "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="p-4 space-y-4">
      {/* بطاقة العهدة الشخصية */}
      {repContact && (
        <Card className="p-4 space-y-2 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground">عهدتي الشخصية</h3>
          </div>
          <div className="text-xs text-muted-foreground">
            الحساب: <span className="font-mono">{repContact.linked_account_code || "—"}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">الرصيد الحالي</span>
            <span className={`text-lg font-bold ${repBalance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {repBalance.toFixed(2)} ₪
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate(`/rep/customer-statement?contact_id=${repContact.id}`)}
          >
            <ExternalLink className="w-3.5 h-3.5 ml-1" /> كشف الحساب
          </Button>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-foreground">عملائي ({customers.length})</h2>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="ابحث باسم أو رقم هاتف"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 h-11"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {customers.length === 0
              ? "لا توجد عملاء معيّنون لك حالياً."
              : "لا توجد نتائج مطابقة."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/rep/customer-statement?contact_id=${c.id}`)}
                className="w-full text-right p-3 rounded-md border border-border bg-card hover:bg-muted/40 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-medium text-sm text-foreground">{c.contact_name}</div>
                    {c.phone && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </div>
                    )}
                  </div>
                  <div className={`text-sm font-bold ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {Number(c.current_balance || 0).toFixed(2)} ₪
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
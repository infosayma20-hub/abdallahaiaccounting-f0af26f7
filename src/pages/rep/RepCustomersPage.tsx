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

        // احسب رصيد العهدة من ledger الحساب الفرعي
        if (c?.linked_account_code) {
          const { data: tx } = await (supabase as any)
            .from("transactions")
            .select("amount, debit_account_code, credit_account_code")
            .eq("user_id", r.user_id)
            .eq("is_deleted", false)
            .or(`debit_account_code.eq.${c.linked_account_code},credit_account_code.eq.${c.linked_account_code}`);
          const rows = (tx as any[]) || [];
          const dr = rows.filter((t) => t.debit_account_code === c.linked_account_code)
            .reduce((s, t) => s + Number(t.amount || 0), 0);
          const cr = rows.filter((t) => t.credit_account_code === c.linked_account_code)
            .reduce((s, t) => s + Number(t.amount || 0), 0);
          setRepBalance(dr - cr);
        }
      }

      // 3) العملاء المعيّنين للمندوب
      const { data: custs } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, phone, current_balance, linked_account_code")
        .eq("sales_rep_id", r.id)
        .eq("is_archived", false)
        .order("contact_name");
      setCustomers(custs || []);
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
          {repContact.linked_account_code && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/account-statement?account=${repContact.linked_account_code}`)}
            >
              <ExternalLink className="w-3.5 h-3.5 ml-1" /> كشف الحساب
            </Button>
          )}
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
                onClick={() => c.linked_account_code && navigate(`/account-statement?account=${c.linked_account_code}`)}
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
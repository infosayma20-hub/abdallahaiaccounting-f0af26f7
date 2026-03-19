import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, ArrowRight, Download, Phone, MapPin, Calendar, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface POSCustomerRow {
  id: string;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  total_visits: number | null;
  total_spent: number | null;
  total_discounts: number | null;
  last_visit: string | null;
  created_at: string | null;
  gender: string | null;
  age_group: string | null;
}

export default function POSCustomerDatabasePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<POSCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const dataOwnerId = user?.id;

  useEffect(() => {
    if (!dataOwnerId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("pos_customers")
        .select("id, name, whatsapp, email, address, total_visits, total_spent, total_discounts, last_visit, created_at, gender, age_group")
        .eq("user_id", dataOwnerId)
        .order("last_visit", { ascending: false, nullsFirst: false });
      setCustomers((data as POSCustomerRow[]) || []);
      setLoading(false);
    })();
  }, [dataOwnerId]);

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.whatsapp || "").includes(q) ||
      (c.address || "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  const totalSpent = customers.reduce((s, c) => s + (c.total_spent || 0), 0);
  const totalVisits = customers.reduce((s, c) => s + (c.total_visits || 0), 0);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                قاعدة بيانات زبائن نقطة البيع
              </h1>
              <p className="text-xs text-muted-foreground">{customers.length} زبون مسجل</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 p-4">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{customers.length}</p>
          <p className="text-[11px] text-muted-foreground">إجمالي الزبائن</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">₪{totalSpent.toFixed(0)}</p>
          <p className="text-[11px] text-muted-foreground">إجمالي المشتريات</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{totalVisits}</p>
          <p className="text-[11px] text-muted-foreground">إجمالي الزيارات</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو رقم الجوال أو العنوان..."
            className="pr-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="px-4 pb-8">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">الاسم</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">الجوال</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">العنوان</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">الزيارات</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">المشتريات</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">آخر زيارة</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد زبائن</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition">
                    <td className="px-3 py-2.5 font-medium text-foreground">{c.name || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{c.whatsapp || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">{c.address || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{c.total_visits || 0}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-foreground">₪{(c.total_spent || 0).toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                      {c.last_visit ? format(new Date(c.last_visit), "dd MMM yyyy", { locale: ar }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

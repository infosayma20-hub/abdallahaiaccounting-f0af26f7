import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Users, Search, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import { setNextExportBranding } from "@/lib/excel-export";
interface Customer {
  id: string;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
  total_visits: number;
  total_spent: number;
  total_discounts: number;
  last_visit: string | null;
  created_at: string;
}

interface Props {
  dataOwnerId: string;
}

const POSCustomersReport = ({ dataOwnerId }: Props) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      if (!dataOwnerId) return;
      setLoading(true);
      const { data } = await supabase
        .from("pos_customers")
        .select("id, name, whatsapp, email, total_visits, total_spent, total_discounts, last_visit, created_at")
        .eq("user_id", dataOwnerId)
        .order("created_at", { ascending: false });
      setCustomers((data as Customer[]) || []);
      setLoading(false);
    };
    fetch();
  }, [dataOwnerId]);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name?.toLowerCase().includes(s)) || (c.whatsapp?.includes(s)) || (c.email?.toLowerCase().includes(s));
  });

  const handleExport = () => {
    const rows = filtered.map(c => ({
      "الاسم": c.name || "-",
      "رقم الجوال": c.whatsapp || "-",
      "البريد": c.email || "-",
      "عدد الزيارات": c.total_visits,
      "إجمالي المشتريات": c.total_spent,
      "إجمالي الخصومات": c.total_discounts,
       "آخر زيارة": c.last_visit ? new Date(c.last_visit).toLocaleDateString("en-GB") : "-",
      "تاريخ التسجيل": new Date(c.created_at).toLocaleDateString("en-GB"),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "الزبائن");
    setNextExportBranding({ title: "الزبائن" });
    XLSX.writeFile(wb, `زبائن-POS-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{customers.length} عميل مسجل</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/pos-customers")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary border border-primary/30 rounded-md hover:bg-primary/10 transition-colors font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            إدارة الزبائن
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            تصدير Excel
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الرقم..."
          className="pr-10 h-9"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary border-b border-border">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الاسم</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">رقم الجوال</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الزيارات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المشتريات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الخصومات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">آخر زيارة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {loading && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-12 text-sm">جاري التحميل...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-12 text-sm">لا يوجد عملاء مسجلين</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-secondary transition-colors">
                <td className="px-4 py-3 text-right text-sm text-foreground font-medium">{c.name || "-"}</td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground font-mono" dir="ltr">{c.whatsapp || "-"}</td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground font-mono">{c.total_visits}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-foreground">₪{c.total_spent?.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono text-muted-foreground">₪{c.total_discounts?.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm text-muted-foreground">
                  {c.last_visit ? new Date(c.last_visit).toLocaleDateString("en-GB") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default POSCustomersReport;

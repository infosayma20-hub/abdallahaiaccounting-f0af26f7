import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

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
      "آخر زيارة": c.last_visit ? new Date(c.last_visit).toLocaleDateString("ar") : "-",
      "تاريخ التسجيل": new Date(c.created_at).toLocaleDateString("ar"),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "العملاء");
    XLSX.writeFile(wb, `عملاء-POS-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{customers.length} عميل مسجل</span>
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#637381] border border-[#E2E8F0] rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          تصدير Excel
        </button>
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
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الاسم</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">رقم الجوال</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الزيارات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المشتريات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الخصومات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">آخر زيارة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {loading && (
              <tr><td colSpan={6} className="text-center text-[#637381] py-12 text-sm">جاري التحميل...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#637381] py-12 text-sm">لا يوجد عملاء مسجلين</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-4 py-3 text-right text-sm text-[#1A2332] font-medium">{c.name || "-"}</td>
                <td className="px-4 py-3 text-right text-sm text-[#637381] font-mono" dir="ltr">{c.whatsapp || "-"}</td>
                <td className="px-4 py-3 text-center text-sm text-[#637381] font-mono">{c.total_visits}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-[#1A2332]">₪{c.total_spent?.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono text-[#637381]">₪{c.total_discounts?.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm text-[#637381]">
                  {c.last_visit ? new Date(c.last_visit).toLocaleDateString("ar") : "-"}
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

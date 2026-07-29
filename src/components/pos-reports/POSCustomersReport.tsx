import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Users, Search, ExternalLink, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import { setNextExportBranding } from "@/lib/excel-export";
import CustomerDetailDrawer from "./CustomerDetailDrawer";
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

type SortKey = "name" | "whatsapp" | "total_visits" | "total_spent" | "total_discounts" | "last_visit";
const arCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });

const POSCustomersReport = ({ dataOwnerId }: Props) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [ccExtra, setCcExtra] = useState<{ name: string; phone: string }[]>([]);
  const [selected, setSelected] = useState<{
    name: string | null;
    phone: string | null;
    posCustomerId?: string | null;
    address?: string | null;
    totalVisits?: number;
    totalSpent?: number;
  } | null>(null);
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

  const filtered = useMemo(() => {
    const base = customers.filter(c => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (c.name?.toLowerCase().includes(s)) || (c.whatsapp?.includes(s)) || (c.email?.toLowerCase().includes(s));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === "name" || sortKey === "whatsapp") {
        const av = (a[sortKey] || "").toString().trim();
        const bv = (b[sortKey] || "").toString().trim();
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return arCollator.compare(av, bv) * dir;
      }
      if (sortKey === "last_visit") {
        const av = a.last_visit ? new Date(a.last_visit).getTime() : 0;
        const bv = b.last_visit ? new Date(b.last_visit).getTime() : 0;
        return (av - bv) * dir;
      }
      return ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * dir;
    });
  }, [customers, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortHeader = ({ label, k, align }: { label: string; k: SortKey; align: "right" | "center" | "left" }) => {
    const active = sortKey === k;
    const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={`${align === "right" ? "text-right" : align === "left" ? "text-left" : "text-center"} px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${active ? "text-foreground" : "text-muted-foreground"}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${align === "left" ? "flex-row-reverse" : ""}`}
        >
          {label}
          <Icon className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    );
  };

  // 🔎 When the user types ≥ 2 chars, also search call_center_orders so we
  // can find customers who only ever ordered via the call center (and were
  // never persisted into pos_customers).
  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 2 || !dataOwnerId) { setCcExtra([]); return; }
    const handle = setTimeout(async () => {
      const isDigit = /^\d+/.test(q);
      const orParts: string[] = [];
      const safe = q.replace(/[,()]/g, " ");
      orParts.push(`customer_name.ilike.%${safe}%`);
      if (isDigit) {
        const digits = q.replace(/\D/g, "");
        if (digits) orParts.push(`customer_phone.ilike.%${digits}%`);
      }
      const { data } = await supabase
        .from("call_center_orders" as any)
        .select("customer_name, customer_phone")
        .eq("user_id", dataOwnerId)
        .or(orParts.join(","))
        .order("created_at", { ascending: false })
        .limit(50);
      // Dedupe by phone (or name if no phone), and skip those already in pos_customers
      const knownPhones = new Set(
        customers.map(c => (c.whatsapp || "").replace(/\D/g, "")).filter(Boolean),
      );
      const knownNames = new Set(
        customers.map(c => (c.name || "").trim()).filter(Boolean),
      );
      const map = new Map<string, { name: string; phone: string }>();
      ((data as any[]) || []).forEach(r => {
        const name = (r.customer_name || "").trim();
        const phone = (r.customer_phone || "").toString();
        const digits = phone.replace(/\D/g, "");
        if (digits && knownPhones.has(digits)) return;
        if (!digits && knownNames.has(name)) return;
        const k = digits || `n:${name}`;
        if (!k) return;
        if (!map.has(k)) map.set(k, { name, phone });
      });
      setCcExtra(Array.from(map.values()));
    }, 200);
    return () => clearTimeout(handle);
  }, [search, dataOwnerId, customers]);

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
          placeholder="بحث بالاسم أو رقم الجوال... (يشمل الكول سنتر)"
          className="pr-10 h-9"
        />
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">
        💡 اضغط على أي زبون لعرض بياناته الكاملة وكل طلباته السابقة (كاشير + كول سنتر) والأصناف الأكثر طلباً.
      </p>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary border-b border-border">
              <SortHeader label="الاسم" k="name" align="right" />
              <SortHeader label="رقم الجوال" k="whatsapp" align="right" />
              <SortHeader label="الزيارات" k="total_visits" align="center" />
              <SortHeader label="المشتريات" k="total_spent" align="left" />
              <SortHeader label="الخصومات" k="total_discounts" align="left" />
              <SortHeader label="آخر زيارة" k="last_visit" align="left" />
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {loading && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-12 text-sm">جاري التحميل...</td></tr>
            )}
            {!loading && filtered.length === 0 && ccExtra.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-12 text-sm">لا يوجد عملاء مسجلين</td></tr>
            )}
            {filtered.map(c => (
              <tr
                key={c.id}
                className="hover:bg-secondary transition-colors cursor-pointer"
                onClick={() =>
                  setSelected({
                    name: c.name,
                    phone: c.whatsapp,
                    posCustomerId: c.id,
                    totalVisits: c.total_visits,
                    totalSpent: c.total_spent,
                  })
                }
              >
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
            {/* Call-center-only matches */}
            {ccExtra.length > 0 && (
              <tr className="bg-blue-50/40">
                <td colSpan={6} className="px-4 py-1.5 text-[11px] font-semibold text-blue-700">
                  زبائن من الكول سنتر (غير مسجلين في قاعدة الكاشير) — {ccExtra.length}
                </td>
              </tr>
            )}
            {ccExtra.map((c, i) => (
              <tr
                key={`cc-${i}`}
                className="hover:bg-secondary transition-colors cursor-pointer"
                onClick={() => setSelected({ name: c.name, phone: c.phone, posCustomerId: null })}
              >
                <td className="px-4 py-3 text-right text-sm text-foreground font-medium">{c.name || "-"}</td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground font-mono" dir="ltr">{c.phone || "-"}</td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">—</td>
                <td className="px-4 py-3 text-left text-sm text-muted-foreground">—</td>
                <td className="px-4 py-3 text-left text-sm text-muted-foreground">—</td>
                <td className="px-4 py-3 text-left text-sm text-muted-foreground">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CustomerDetailDrawer
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
        dataOwnerId={dataOwnerId}
        customer={selected}
      />
    </div>
  );
};

export default POSCustomersReport;

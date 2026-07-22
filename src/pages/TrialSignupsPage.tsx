import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Search, Phone, Building2, Mail, Users, Briefcase, RefreshCw, ArrowRight, MapPin } from "lucide-react";

interface TrialSignup {
  id: string;
  full_name: string;
  business_name: string | null;
  email: string;
  country_code: string;
  phone_local: string;
  phone_e164: string;
  business_type: string | null;
  employees_count: string | null;
  address: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const BUSINESS_LABELS: Record<string, string> = {
  retail: "تجارة تجزئة",
  wholesale: "تجارة جملة",
  restaurant: "مطعم / كافيه",
  services: "خدمات",
  manufacturing: "تصنيع",
  contracting: "مقاولات",
  accounting_office: "مكتب محاسبة",
  other: "أخرى",
};

export default function TrialSignupsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TrialSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("trial_signups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) setError(error.message);
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.full_name, r.business_name, r.email, r.phone_e164, r.business_type, r.address]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              title="رجوع"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">طلبات التجربة المجانية</h1>
              <p className="text-sm text-slate-500 mt-1">قائمة العملاء المحتملين الذين سجّلوا لتجربة أموالي — للاطلاع والتواصل فقط.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم / الجوال / البريد..."
                className="h-10 w-72 rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm outline-none focus:border-slate-400"
              />
            </div>
            <button
              onClick={load}
              className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> تحديث
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="إجمالي الطلبات" value={rows.length} />
          <StatCard label="اليوم" value={rows.filter(r => isToday(r.created_at)).length} />
          <StatCard label="آخر 7 أيام" value={rows.filter(r => isWithinDays(r.created_at, 7)).length} />
          <StatCard label="آخر 30 يوم" value={rows.filter(r => isWithinDays(r.created_at, 30)).length} />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error === "" ? "تعذر تحميل البيانات" : error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">المنشأة</th>
                  <th className="text-right px-4 py-3 font-medium">الجوال</th>
                  <th className="text-right px-4 py-3 font-medium">البريد</th>
                  <th className="text-right px-4 py-3 font-medium">النشاط</th>
                  <th className="text-right px-4 py-3 font-medium">الحجم</th>
                  <th className="text-right px-4 py-3 font-medium">العنوان</th>
                  <th className="text-right px-4 py-3 font-medium">تواصل</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">لا توجد طلبات مطابقة</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap" dir="ltr">
                      {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.full_name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{r.business_name || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700" dir="ltr">{r.phone_e164}</td>
                    <td className="px-4 py-3 text-slate-700" dir="ltr">{r.email}</td>
                    <td className="px-4 py-3 text-slate-600">{r.business_type ? (BUSINESS_LABELS[r.business_type] || r.business_type) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.employees_count || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.address ? (
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" />{r.address}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://wa.me/${r.phone_e164.replace(/\D/g, "")}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          <Phone className="h-3 w-3" /> واتساب
                        </a>
                        <a
                          href={`mailto:${r.email}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <Mail className="h-3 w-3" /> بريد
                        </a>
                      </div>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-800 mt-1">{value.toLocaleString("en-US")}</p>
    </div>
  );
}

function isToday(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function isWithinDays(iso: string, days: number) {
  return (Date.now() - new Date(iso).getTime()) <= days * 86400_000;
}
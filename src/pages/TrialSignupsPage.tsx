import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Search, Phone, Building2, Mail, Users, Briefcase, RefreshCw, ArrowRight, MapPin, Chrome, X, Activity } from "lucide-react";

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

interface GoogleSignup {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  sign_in_count: number | null;
  failed_count: number | null;
}

interface LoginEvent {
  occurred_at: string;
  action: string;
  ip_address: string | null;
  device: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  login_success: "دخول ناجح",
  login_failed: "محاولة فاشلة",
};

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
  const [googleRows, setGoogleRows] = useState<GoogleSignup[]>([]);
  const [tab, setTab] = useState<"form" | "google">("form");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GoogleSignup | null>(null);
  const [history, setHistory] = useState<LoginEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    const { data: gData, error: gError } = await (supabase as any).rpc("get_google_signups");
    if (gError && !error) setError(gError.message);
    setGoogleRows((gData as GoogleSignup[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const openDetails = async (row: GoogleSignup) => {
    setSelected(row);
    setHistory([]);
    setHistoryLoading(true);
    const { data } = await (supabase as any).rpc("get_user_login_history", { _user_id: row.user_id, _limit: 50 });
    setHistory((data as LoginEvent[]) || []);
    setHistoryLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.full_name, r.business_name, r.email, r.phone_e164, r.business_type, r.address]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const filteredGoogle = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = [...googleRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!q) return base;
    return base.filter(r =>
      [r.full_name, r.email, r.phone].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [googleRows, search]);

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
              <p className="text-sm text-slate-500 mt-1">قائمة العملاء المحتملين الذين سجّلوا لتجربة يونيفاي — للاطلاع والتواصل فقط.</p>
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
          <StatCard label="تسجيل عبر جوجل" value={googleRows.length} />
          <StatCard label="آخر 7 أيام" value={rows.filter(r => isWithinDays(r.created_at, 7)).length} />
          <StatCard label="جوجل — آخر 7 أيام" value={googleRows.filter(r => isWithinDays(r.created_at, 7)).length} />
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setTab("form")}
            className={`h-9 px-4 rounded-lg text-sm border ${tab === "form" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"}`}
          >
            طلبات النموذج ({rows.length})
          </button>
          <button
            onClick={() => setTab("google")}
            className={`h-9 px-4 rounded-lg text-sm border inline-flex items-center gap-1.5 ${tab === "google" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"}`}
          >
            <Chrome className="h-4 w-4" /> دخول عبر جوجل ({googleRows.length})
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error === "" ? "تعذر تحميل البيانات" : error}
          </div>
        )}

        {tab === "google" ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium">تاريخ التسجيل</th>
                    <th className="text-right px-4 py-3 font-medium">الاسم</th>
                    <th className="text-right px-4 py-3 font-medium">البريد</th>
                    <th className="text-right px-4 py-3 font-medium">الجوال</th>
                    <th className="text-right px-4 py-3 font-medium">الزيارات</th>
                    <th className="text-right px-4 py-3 font-medium">آخر دخول</th>
                    <th className="text-right px-4 py-3 font-medium">تواصل</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">جاري التحميل...</td></tr>
                  ) : filteredGoogle.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا يوجد مستخدمون عبر جوجل</td></tr>
                  ) : filteredGoogle.map(r => (
                    <tr
                      key={r.user_id}
                      onClick={() => openDetails(r)}
                      className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap" dir="ltr">
                        {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <span className="inline-flex items-center gap-2">
                          {r.avatar_url ? (
                            <img src={r.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                          ) : null}
                          {r.full_name || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700" dir="ltr">{r.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-700" dir="ltr">{r.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-medium">
                          <Activity className="h-3 w-3" /> {(r.sign_in_count ?? 0).toLocaleString("en-US")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap" dir="ltr">
                        {r.last_sign_in_at ? format(new Date(r.last_sign_in_at), "yyyy-MM-dd HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {r.email ? (
                          <a
                            href={`mailto:${r.email}`}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                          >
                            <Mail className="h-3 w-3" /> بريد
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                {selected.avatar_url ? (
                  <img src={selected.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : null}
                <div>
                  <p className="font-semibold text-slate-800">{selected.full_name || "—"}</p>
                  <p className="text-xs text-slate-500" dir="ltr">{selected.email || "—"}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 p-4">
              <MiniStat label="عدد الزيارات" value={(selected.sign_in_count ?? 0).toLocaleString("en-US")} />
              <MiniStat label="تاريخ التسجيل" value={format(new Date(selected.created_at), "yyyy-MM-dd")} />
              <MiniStat label="آخر دخول" value={selected.last_sign_in_at ? format(new Date(selected.last_sign_in_at), "yyyy-MM-dd") : "—"} />
            </div>

            <div className="px-4 pb-2 text-xs text-slate-500">
              الجوال: <span dir="ltr">{selected.phone || "غير متوفر — جوجل لا يشارك رقم الجوال"}</span>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-slate-200">
              {historyLoading ? (
                <p className="p-4 text-center text-sm text-slate-400">جاري تحميل السجل...</p>
              ) : history.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400">لا يوجد سجل دخول محفوظ</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-slate-700">{ACTION_LABELS[h.action] || h.action}</span>
                      <span className="text-xs text-slate-500" dir="ltr">
                        {format(new Date(h.occurred_at), "yyyy-MM-dd HH:mm")}{h.ip_address ? ` · ${h.ip_address}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5" dir="ltr">{value}</p>
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
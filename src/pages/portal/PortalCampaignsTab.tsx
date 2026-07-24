import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { Loader2, TrendingUp, Package, Store, Calendar, ChevronDown, ChevronUp, X } from 'lucide-react';

const F = 'Cairo, Tajawal, sans-serif';
const PRIMARY = '#0D1B2E';

interface Props { theme?: 'light' | 'dark' }

interface Campaign {
  id: string;
  slug: string;
  name: string;
  year: number;
  season: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  source: string;
}

interface SaleRow {
  campaign_id: string;
  sale_date: string;
  item_name: string;
  variant: string | null;
  qty_take_out: number;
  qty_dine_in: number;
  unit_price: number;
  total_amount: number;
  branch_name: string | null;
}

const SEASON_LABEL: Record<string, string> = {
  ramadan: 'رمضان', tawjihi: 'توجيهي', winter: 'الشتاء',
  eid: 'عيد الفطر', opening: 'افتتاح', other: 'عرض',
};
const SEASON_COLOR: Record<string, string> = {
  ramadan: '#7C3AED', tawjihi: '#0EA5E9', winter: '#0284C7',
  eid: '#F59E0B', opening: '#16A34A', other: '#64748B',
};

const CHART_PALETTE = ['#0D1B2E', '#0EA5E9', '#F59E0B', '#DC2626', '#16A34A', '#7C3AED', '#DB2777', '#0F766E', '#B45309'];

function fmtNIS(n: number) { return `₪${Math.round(Number(n) || 0).toLocaleString('en-US')}`; }
function fmtNum(n: number) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  const d1 = new Date(a).getTime(); const d2 = new Date(b).getTime();
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

export default function PortalCampaignsTab({ theme = 'light' }: Props) {
  const dark = theme === 'dark';
  const c = {
    pageBg: dark ? '#0a0a0a' : '#F8FAFC',
    cardBg: dark ? '#161616' : '#FFFFFF',
    border: dark ? '#262626' : '#E2E8F0',
    text: dark ? '#F1F5F9' : '#0D1B2E',
    textMuted: dark ? '#A1A1AA' : '#64748B',
    chipBg: dark ? '#1e1e1e' : '#F1F5F9',
  };

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]); // slugs to compare
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const { data: cData, error: cErr } = await supabase
          .from('marketing_campaigns')
          .select('id,slug,name,year,season,start_date,end_date,status,source')
          .order('start_date', { ascending: true });
        if (cErr) throw cErr;
        // fetch sales — potentially many rows; paginate via range
        const all: SaleRow[] = [];
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('marketing_campaign_sales')
            .select('campaign_id,sale_date,item_name,variant,qty_take_out,qty_dine_in,unit_price,total_amount,branch_name')
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...(data as SaleRow[]));
          if (data.length < PAGE) break;
        }
        if (cancelled) return;
        setCampaigns((cData || []) as Campaign[]);
        setSales(all);
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // per-campaign aggregates
  const stats = useMemo(() => {
    const map = new Map<string, {
      total: number; qtyOut: number; qtyIn: number; days: Set<string>;
      byBranch: Map<string, number>; byItem: Map<string, { qty: number; total: number }>;
      byDate: Map<string, number>; byDateQty: Map<string, number>;
    }>();
    for (const s of sales) {
      if (branchFilter !== 'all' && s.branch_name !== branchFilter) continue;
      let e = map.get(s.campaign_id);
      if (!e) {
        e = { total: 0, qtyOut: 0, qtyIn: 0, days: new Set(), byBranch: new Map(), byItem: new Map(), byDate: new Map(), byDateQty: new Map() };
        map.set(s.campaign_id, e);
      }
      const t = Number(s.total_amount) || 0;
      const qo = Number(s.qty_take_out) || 0;
      const qi = Number(s.qty_dine_in) || 0;
      e.total += t; e.qtyOut += qo; e.qtyIn += qi; e.days.add(s.sale_date);
      const br = s.branch_name || '—';
      e.byBranch.set(br, (e.byBranch.get(br) || 0) + t);
      const it = s.item_name || 'بدون اسم';
      const cur = e.byItem.get(it) || { qty: 0, total: 0 };
      cur.qty += qo + qi; cur.total += t;
      e.byItem.set(it, cur);
      e.byDate.set(s.sale_date, (e.byDate.get(s.sale_date) || 0) + t);
      e.byDateQty.set(s.sale_date, (e.byDateQty.get(s.sale_date) || 0) + qo + qi);
    }
    return map;
  }, [sales, branchFilter]);

  const branches = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(x => { if (x.branch_name) s.add(x.branch_name); });
    return Array.from(s).sort();
  }, [sales]);

  const totalAll = useMemo(() => {
    let t = 0, q = 0; for (const v of stats.values()) { t += v.total; q += v.qtyOut + v.qtyIn; }
    return { total: t, qty: q };
  }, [stats]);

  const toggleSelect = (slug: string) => {
    setSelected(prev => prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug].slice(-6));
  };

  const compareData = useMemo(() => {
    if (selected.length === 0) return [];
    const selCamps = campaigns.filter(x => selected.includes(x.slug));
    return selCamps.map(cp => {
      const st = stats.get(cp.id);
      const days = st?.days.size || 1;
      return {
        name: cp.name,
        slug: cp.slug,
        total: st?.total || 0,
        qty: (st?.qtyOut || 0) + (st?.qtyIn || 0),
        avgPerDay: (st?.total || 0) / days,
        days,
      };
    });
  }, [selected, campaigns, stats]);

  const compareDaily = useMemo(() => {
    if (selected.length === 0) return [];
    const selCamps = campaigns.filter(x => selected.includes(x.slug));
    // Align by day offset from campaign start
    const rows: Record<string, any>[] = [];
    const maxDays = Math.max(...selCamps.map(cp => stats.get(cp.id)?.days.size || 0));
    for (let d = 0; d < maxDays; d++) rows.push({ day: d + 1 });
    selCamps.forEach(cp => {
      const st = stats.get(cp.id);
      if (!st || !cp.start_date) return;
      const sortedDates = Array.from(st.byDate.keys()).sort();
      sortedDates.forEach((date, idx) => {
        if (idx < rows.length) rows[idx][cp.slug] = st.byDate.get(date) || 0;
      });
    });
    return rows;
  }, [selected, campaigns, stats]);

  const detail = openDetailId ? campaigns.find(x => x.id === openDetailId) : null;
  const detailStats = openDetailId ? stats.get(openDetailId) : null;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: F, color: c.textMuted }}>
        <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
        <div>جاري تحميل بيانات العروض...</div>
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: 24, color: '#DC2626', fontFamily: F, textAlign: 'center' }}>خطأ: {error}</div>;
  }

  return (
    <div style={{ padding: '12px 12px 24px', fontFamily: F, direction: 'rtl', color: c.text }}>
      {/* Header + KPIs */}
      <div style={{
        background: c.cardBg, borderRadius: 16, padding: 16, border: `1px solid ${c.border}`, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>العروض التسويقية</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
              {campaigns.length} عرض · إجمالي {fmtNIS(totalAll.total)} · {fmtNum(totalAll.qty)} قطعة
            </div>
          </div>
          <select
            value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            style={{
              background: c.chipBg, border: `1px solid ${c.border}`, color: c.text,
              borderRadius: 10, padding: '6px 10px', fontFamily: F, fontSize: 12,
            }}
          >
            <option value="all">كل الفروع</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Campaign cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 14 }}>
        {campaigns.map(cp => {
          const st = stats.get(cp.id);
          const isSel = selected.includes(cp.slug);
          const accent = SEASON_COLOR[cp.season] || PRIMARY;
          const days = st?.days.size || 0;
          const avg = days ? (st!.total / days) : 0;
          return (
            <div key={cp.id} style={{
              background: c.cardBg, borderRadius: 14, padding: 12, position: 'relative',
              border: `2px solid ${isSel ? accent : c.border}`, transition: 'all .15s',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: accent, borderRadius: '12px 12px 0 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                  background: `${accent}22`, color: accent,
                }}>
                  {SEASON_LABEL[cp.season] || cp.season} {cp.year}
                </div>
                <input
                  type="checkbox" checked={isSel} onChange={() => toggleSelect(cp.slug)}
                  style={{ accentColor: accent, width: 16, height: 16, cursor: 'pointer' }}
                  title="أضف للمقارنة"
                />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, minHeight: 34 }}>{cp.name}</div>
              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} /> {fmtDate(cp.start_date)} → {fmtDate(cp.end_date)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                <Kpi label="مبيعات" value={fmtNIS(st?.total || 0)} color={c.text} muted={c.textMuted} />
                <Kpi label="قطع" value={fmtNum((st?.qtyOut || 0) + (st?.qtyIn || 0))} color={c.text} muted={c.textMuted} />
                <Kpi label="أيام" value={String(days)} color={c.text} muted={c.textMuted} />
                <Kpi label="متوسط/يوم" value={fmtNIS(avg)} color={c.text} muted={c.textMuted} />
              </div>
              <button
                onClick={() => setOpenDetailId(cp.id)}
                style={{
                  marginTop: 10, width: '100%', background: c.chipBg, border: `1px solid ${c.border}`,
                  color: c.text, borderRadius: 8, padding: '6px', fontFamily: F, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                عرض التفاصيل ←
              </button>
            </div>
          );
        })}
      </div>

      {/* Comparison panel */}
      {selected.length >= 1 && (
        <div style={{
          background: c.cardBg, borderRadius: 14, padding: 14, border: `1px solid ${c.border}`, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={16} /> مقارنة تفاعلية ({selected.length})
            </div>
            <button onClick={() => setSelected([])} style={{
              background: 'transparent', border: `1px solid ${c.border}`, color: c.textMuted,
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontFamily: F,
            }}>مسح</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {/* Bar: total & qty per campaign */}
            <div style={{ background: c.pageBg, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6 }}>إجمالي المبيعات (₪)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={compareData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: c.textMuted, fontFamily: F }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: c.textMuted }} />
                  <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontFamily: F, fontSize: 12 }} />
                  <Bar dataKey="total" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Daily aligned by day offset */}
            {selected.length >= 2 && (
              <div style={{ background: c.pageBg, borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6 }}>المبيعات اليومية (اليوم N من بداية العرض)</div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={compareDaily}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: c.textMuted }} />
                    <YAxis tick={{ fontSize: 10, fill: c.textMuted }} />
                    <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontFamily: F, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: F }} />
                    {selected.map((slug, i) => (
                      <Line key={slug} type="monotone" dataKey={slug} stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                            strokeWidth={2} dot={false} name={campaigns.find(c => c.slug === slug)?.name || slug} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: c.chipBg }}>
                    <th style={thStyle(c)}>العرض</th>
                    <th style={thStyle(c)}>الأيام</th>
                    <th style={thStyle(c)}>القطع</th>
                    <th style={thStyle(c)}>المبيعات</th>
                    <th style={thStyle(c)}>متوسط/يوم</th>
                  </tr>
                </thead>
                <tbody>
                  {compareData.map(row => (
                    <tr key={row.slug}>
                      <td style={tdStyle(c)}>{row.name}</td>
                      <td style={tdStyle(c)}>{row.days}</td>
                      <td style={tdStyle(c)}>{fmtNum(row.qty)}</td>
                      <td style={{ ...tdStyle(c), fontWeight: 700 }}>{fmtNIS(row.total)}</td>
                      <td style={tdStyle(c)}>{fmtNIS(row.avgPerDay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Detail sheet */}
      {detail && detailStats && (
        <div onClick={() => setOpenDetailId(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 70, padding: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: c.cardBg, borderRadius: 16, maxWidth: 900, width: '100%', maxHeight: '90vh',
            overflowY: 'auto', padding: 16, direction: 'rtl',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{detail.name}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                  {fmtDate(detail.start_date)} → {fmtDate(detail.end_date)} · {detailStats.days.size} يوم
                </div>
              </div>
              <button onClick={() => setOpenDetailId(null)} style={{
                background: c.chipBg, border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.text,
              }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Kpi label="إجمالي المبيعات" value={fmtNIS(detailStats.total)} color={c.text} muted={c.textMuted} big />
              <Kpi label="قطع (خارج+داخل)" value={fmtNum(detailStats.qtyOut + detailStats.qtyIn)} color={c.text} muted={c.textMuted} big />
              <Kpi label="متوسط يومي" value={fmtNIS(detailStats.total / Math.max(1, detailStats.days.size))} color={c.text} muted={c.textMuted} big />
              <Kpi label="متوسط سعر القطعة" value={fmtNIS(detailStats.total / Math.max(1, detailStats.qtyOut + detailStats.qtyIn))} color={c.text} muted={c.textMuted} big />
            </div>

            {/* daily line + branch pie */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div style={{ background: c.pageBg, borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6 }}>المبيعات اليومية</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={Array.from(detailStats.byDate.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([d, v]) => ({ date: d.slice(5), total: v }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: c.textMuted }} />
                    <YAxis tick={{ fontSize: 9, fill: c.textMuted }} />
                    <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontFamily: F, fontSize: 11 }} />
                    <Line type="monotone" dataKey="total" stroke={PRIMARY} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: c.pageBg, borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Store size={12} /> توزيع الفروع
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={Array.from(detailStats.byBranch.entries()).map(([n, v]) => ({ name: n, value: v }))}
                         dataKey="value" nameKey="name" outerRadius={80} label={(e: any) => `${e.name}: ${Math.round((e.percent || 0) * 100)}%`}>
                      {Array.from(detailStats.byBranch.entries()).map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtNIS(Number(v))} contentStyle={{ fontFamily: F, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top items */}
            <div style={{ background: c.pageBg, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Package size={13} /> أعلى الأصناف مبيعاً
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: c.chipBg }}>
                      <th style={thStyle(c)}>الصنف</th>
                      <th style={thStyle(c)}>القطع</th>
                      <th style={thStyle(c)}>المبيعات</th>
                      <th style={thStyle(c)}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(detailStats.byItem.entries())
                      .sort((a, b) => b[1].total - a[1].total)
                      .slice(0, 15)
                      .map(([name, v]) => (
                        <tr key={name}>
                          <td style={tdStyle(c)}>{name}</td>
                          <td style={tdStyle(c)}>{fmtNum(v.qty)}</td>
                          <td style={{ ...tdStyle(c), fontWeight: 700 }}>{fmtNIS(v.total)}</td>
                          <td style={tdStyle(c)}>{((v.total / detailStats.total) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color, muted, big }: { label: string; value: string; color: string; muted: string; big?: boolean }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.03)', borderRadius: 8, padding: big ? 10 : 6,
    }}>
      <div style={{ fontSize: big ? 11 : 10, color: muted, fontFamily: F }}>{label}</div>
      <div style={{ fontSize: big ? 16 : 13, fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function thStyle(c: any): React.CSSProperties {
  return { textAlign: 'right', padding: '8px 10px', fontWeight: 700, color: c.text, fontFamily: F, borderBottom: `1px solid ${c.border}` };
}
function tdStyle(c: any): React.CSSProperties {
  return { textAlign: 'right', padding: '8px 10px', color: c.text, fontFamily: F, borderBottom: `1px solid ${c.border}` };
}
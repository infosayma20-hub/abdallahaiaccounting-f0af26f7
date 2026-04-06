import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell } from 'recharts';

const F = "Cairo, Tajawal, sans-serif";
const NAVY = "#0D1B2E";
const ACCENT = "#2A7B9B";

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

interface Props { theme?: 'light' | 'dark' }

interface QOrder {
  id: string; reference_number: string; customer_name: string; customer_city: string;
  total: number; subtotal: number; discount: number; shipping_cost: number;
  source: string; agent_name: string; status: string; amount_paid: number;
  created_at: string; payment_status: string;
}

interface QItem {
  order_id: string; product_name: string; price: number; quantity: number; line_total: number;
}

function getTheme(dark: boolean) {
  return dark
    ? { bg: '#161B22', card: '#1C2128', text: '#E6EDF3', muted: 'rgba(230,237,243,0.5)', faint: 'rgba(230,237,243,0.3)', border: 'rgba(230,237,243,0.08)' }
    : { bg: '#F0F2F5', card: '#FFFFFF', text: '#1B3A5C', muted: 'rgba(27,58,92,0.6)', faint: 'rgba(27,58,92,0.3)', border: 'rgba(27,58,92,0.1)' };
}

function fmt(v: number) { return v.toLocaleString('ar-EG', { maximumFractionDigits: 0 }); }

function getDateRange(preset: DatePreset, customFrom?: string, customTo?: string): [string, string] {
  const now = new Date();
  const pad = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case 'today': return [pad(now), pad(new Date(now.getTime() + 86400000))];
    case 'yesterday': { const y = new Date(now.getTime() - 86400000); return [pad(y), pad(now)]; }
    case 'week': { const w = new Date(now); w.setDate(w.getDate() - w.getDay()); return [pad(w), pad(new Date(now.getTime() + 86400000))]; }
    case 'month': return [pad(now).slice(0, 8) + '01', pad(new Date(now.getTime() + 86400000))];
    case 'custom': return [customFrom || pad(now), customTo || pad(new Date(now.getTime() + 86400000))];
  }
}

function getPreviousRange(from: string, to: string): [string, string] {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  const prevTo = from;
  const prevFrom = new Date(new Date(from).getTime() - diff).toISOString().slice(0, 10);
  return [prevFrom, prevTo];
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'أمس';
  return `${days} أيام`;
}

const STATUS_COLORS: Record<string, string> = {
  'جديد': '#3B82F6', 'قيد المراجعة': '#6366F1', 'مؤكد': '#8B5CF6',
  'قيد التصنيع': '#F59E0B', 'جاهز للفوترة': '#8B5CF6', 'مفوتر': '#06B6D4',
  'جاهز للشحن': '#14B8A6', 'تم الشحن': '#22C55E', 'تم التسليم': '#16A34A',
  'ملغي': '#EF4444', 'مؤجل': '#EAB308',
};

const SOURCE_MAP: Record<string, string> = {
  'whatsapp': 'واتساب', 'visit': 'زيارة', 'phone': 'هاتف', 'store': 'متجر', 'other': 'أخرى',
};

const PIE_COLORS = ['#0D1B2E', '#2A7B9B', '#F59E0B', '#22C55E', '#8B5CF6', '#EF4444'];

export default function PortalStoreTab({ theme = 'light' }: Props) {
  const t = getTheme(theme === 'dark');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [orders, setOrders] = useState<QOrder[]>([]);
  const [prevOrders, setPrevOrders] = useState<QOrder[]>([]);
  const [items, setItems] = useState<QItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, dateTo] = getDateRange(preset, customFrom, customTo);
  const [prevFrom, prevTo] = getPreviousRange(dateFrom, dateTo);

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    const [ordersRes, prevRes, itemsRes] = await Promise.all([
      supabase.from('qamar_orders' as any).select('*').gte('created_at', dateFrom).lt('created_at', dateTo).order('created_at', { ascending: false }),
      supabase.from('qamar_orders' as any).select('*').gte('created_at', prevFrom).lt('created_at', prevTo),
      supabase.from('qamar_order_items' as any).select('order_id, product_name, price, quantity, line_total'),
    ]);
    setOrders((ordersRes.data as any[]) || []);
    setPrevOrders((prevRes.data as any[]) || []);
    setItems((itemsRes.data as any[]) || []);
    setLoading(false);
  };

  // ===== KPIs =====
  const active = orders.filter(o => o.status !== 'ملغي');
  const prevActive = prevOrders.filter(o => o.status !== 'ملغي');
  const totalSales = active.reduce((s, o) => s + (o.total || 0), 0);
  const prevTotalSales = prevActive.reduce((s, o) => s + (o.total || 0), 0);
  const orderCount = active.length;
  const prevOrderCount = prevActive.length;
  const avgOrder = orderCount ? totalSales / orderCount : 0;
  const prevAvgOrder = prevOrderCount ? prevTotalSales / prevOrderCount : 0;
  const delivered = active.filter(o => ['تم التسليم', 'مفوتر', 'تم الشحن'].includes(o.status)).length;
  const convRate = orderCount ? (delivered / orderCount) * 100 : 0;
  const prevDelivered = prevActive.filter(o => ['تم التسليم', 'مفوتر', 'تم الشحن'].includes(o.status)).length;
  const prevConvRate = prevOrderCount ? (prevDelivered / prevOrderCount) * 100 : 0;

  // Secondary KPIs
  const totalShipping = active.reduce((s, o) => s + (o.shipping_cost || 0), 0);
  const totalDiscount = active.reduce((s, o) => s + (o.discount || 0), 0);
  const cancelled = orders.filter(o => o.status === 'ملغي').length;
  const cancelRate = orders.length ? (cancelled / orders.length) * 100 : 0;

  // Agents
  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    active.forEach(o => {
      const name = o.agent_name || 'غير محدد';
      const curr = map.get(name) || { name, count: 0, total: 0 };
      curr.count++; curr.total += o.total || 0;
      map.set(name, curr);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [orders, dateFrom]);

  // Products
  const orderIds = new Set(active.map(o => o.id));
  const productMap = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    items.filter(i => orderIds.has(i.order_id)).forEach(i => {
      const curr = map.get(i.product_name) || { name: i.product_name, qty: 0, revenue: 0 };
      curr.qty += i.quantity || 0; curr.revenue += i.line_total || 0;
      map.set(i.product_name, curr);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [items, orders, dateFrom]);

  // Regions
  const regionMap = useMemo(() => {
    const map = new Map<string, { city: string; count: number; total: number }>();
    active.forEach(o => {
      const city = o.customer_city || 'غير محدد';
      const curr = map.get(city) || { city, count: 0, total: 0 };
      curr.count++; curr.total += o.total || 0;
      map.set(city, curr);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [orders, dateFrom]);

  // Sources
  const sourceMap = useMemo(() => {
    const map = new Map<string, { source: string; count: number; total: number }>();
    active.forEach(o => {
      const src = SOURCE_MAP[o.source] || o.source || 'أخرى';
      const curr = map.get(src) || { source: src, count: 0, total: 0 };
      curr.count++; curr.total += o.total || 0;
      map.set(src, curr);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [orders, dateFrom]);

  // Status funnel
  const statusCounts = useMemo(() => {
    const stages = ['جديد', 'قيد المراجعة', 'مؤكد', 'قيد التصنيع', 'جاهز للفوترة', 'مفوتر', 'جاهز للشحن', 'تم الشحن', 'تم التسليم'];
    return stages.map(s => ({ status: s, count: orders.filter(o => o.status === s).length })).filter(s => s.count > 0);
  }, [orders]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { date: string; total: number; count: number }>();
    active.forEach(o => {
      const d = o.created_at.slice(0, 10);
      const curr = map.get(d) || { date: d, total: 0, count: 0 };
      curr.total += o.total || 0; curr.count++;
      map.set(d, curr);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [orders, dateFrom]);

  const pctChange = (curr: number, prev: number) => {
    if (!prev) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  const datePresets: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'اليوم' }, { key: 'yesterday', label: 'أمس' },
    { key: 'week', label: 'هذا الأسبوع' }, { key: 'month', label: 'هذا الشهر' },
    { key: 'custom', label: '📅 مخصص' },
  ];

  const cardStyle: React.CSSProperties = {
    background: t.card, borderRadius: 16, padding: 20,
    border: `1px solid ${t.border}`, fontFamily: F,
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: t.muted, fontFamily: F, fontSize: 14 }}>
        جارٍ تحميل بيانات المتجر...
      </div>
    );
  }

  return (
    <div style={{ direction: 'rtl', fontFamily: F }}>
      {/* Date filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {datePresets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)} style={{
            padding: '6px 14px', borderRadius: 20, border: `1px solid ${preset === p.key ? ACCENT : t.border}`,
            background: preset === p.key ? `${ACCENT}15` : t.card, color: preset === p.key ? ACCENT : t.muted,
            fontFamily: F, fontSize: 12, fontWeight: preset === p.key ? 700 : 400, cursor: 'pointer',
          }}>{p.label}</button>
        ))}
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12, fontFamily: F, background: t.card, color: t.text }} />
            <span style={{ color: t.muted, fontSize: 12 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12, fontFamily: F, background: t.card, color: t.text }} />
          </div>
        )}
      </div>

      {/* Row 1: Main KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        {[
          { label: 'إجمالي المبيعات', value: `₪${fmt(totalSales)}`, change: pctChange(totalSales, prevTotalSales), icon: '💰' },
          { label: 'عدد الطلبيات', value: fmt(orderCount), change: pctChange(orderCount, prevOrderCount), icon: '📦' },
          { label: 'متوسط قيمة الطلبية', value: `₪${fmt(avgOrder)}`, change: pctChange(avgOrder, prevAvgOrder), icon: '📊' },
          { label: 'معدل التحويل', value: `${convRate.toFixed(0)}%`, change: pctChange(convRate, prevConvRate), icon: '🎯' },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{kpi.icon}</div>
            <div style={{ fontSize: 11, color: t.muted, marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: kpi.change >= 0 ? '#16A34A' : '#EF4444', fontWeight: 600 }}>
              {kpi.change >= 0 ? '▲' : '▼'} {Math.abs(kpi.change).toFixed(0)}% vs الفترة السابقة
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Secondary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: '🚚 التوصيل', value: `₪${fmt(totalShipping)}`, sub: totalSales ? `${((totalShipping / totalSales) * 100).toFixed(1)}% من الإجمالي` : '' },
          { label: '🏷️ الخصومات', value: `₪${fmt(totalDiscount)}`, sub: totalSales ? `${((totalDiscount / totalSales) * 100).toFixed(1)}% من الإجمالي` : '' },
          { label: '⏱️ متوسط وقت التسليم', value: '—', sub: 'يوم' },
          { label: '❌ نسبة الإلغاء', value: `${cancelRate.toFixed(0)}%`, sub: `${cancelled} من ${orders.length}` },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: 14 }}>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: 10, color: t.faint, marginTop: 2 }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Agents */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>👩‍💼 أداء فريق المبيعات</h3>
          {agentMap.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد بيانات</div>
          ) : agentMap.map((agent, i) => {
            const maxTotal = agentMap[0]?.total || 1;
            const pct = (agent.total / maxTotal) * 100;
            return (
              <div key={agent.name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{agent.name}</span>
                    {i === 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 20, background: '#FEF3C7', color: '#D97706', fontSize: 11, fontWeight: 700 }}>🏆 الأعلى</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>₪{fmt(agent.total)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: t.border, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${NAVY}, ${ACCENT})`, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{agent.count} طلبية • متوسط: ₪{fmt(agent.total / agent.count)}</div>
              </div>
            );
          })}
        </div>

        {/* Top Products */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>📦 الأصناف الأكثر مبيعاً</h3>
          {productMap.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد بيانات</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                  <th style={{ padding: '6px 4px', textAlign: 'right', color: t.muted, fontWeight: 600 }}>#</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right', color: t.muted, fontWeight: 600 }}>الصنف</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center', color: t.muted, fontWeight: 600 }}>الكمية</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left', color: t.muted, fontWeight: 600 }}>الإيراد</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center', color: t.muted, fontWeight: 600 }}>%</th>
                </tr>
              </thead>
              <tbody>
                {productMap.map((p, i) => (
                  <tr key={p.name} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td style={{ padding: '8px 4px', color: t.faint, fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '8px 4px', color: t.text, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'center', color: t.muted, fontFamily: 'JetBrains Mono, monospace' }}>{p.qty}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'left', color: t.text, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>₪{fmt(p.revenue)}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'center', color: ACCENT, fontWeight: 600 }}>{totalSales ? ((p.revenue / totalSales) * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row: Regions + Sources */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Regions */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>📍 مبيعات المناطق</h3>
          {regionMap.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد بيانات</div>
          ) : regionMap.map((r, i) => {
            const maxT = regionMap[0]?.total || 1;
            const pct = (r.total / maxT) * 100;
            return (
              <div key={r.city} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: t.text, fontWeight: 500 }}>{r.city}</span>
                  <span style={{ color: t.text, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>₪{fmt(r.total)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: t.border, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${ACCENT}, #14B8A6)`, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 10, color: t.faint, marginTop: 2 }}>{r.count} طلبية</div>
              </div>
            );
          })}
          {regionMap.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: t.muted, borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
              أعلى منطقة: {regionMap[0].city} ({totalSales ? ((regionMap[0].total / totalSales) * 100).toFixed(0) : 0}%) | عدد المناطق: {regionMap.length}
            </div>
          )}
        </div>

        {/* Sources */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>📱 مصادر الطلبيات</h3>
          {sourceMap.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد بيانات</div>
          ) : (
            <>
              <div style={{ height: 180, display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceMap.map(s => ({ name: s.source, value: s.total }))} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {sourceMap.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `₪${fmt(v)}`} contentStyle={{ fontFamily: F, fontSize: 12, direction: 'rtl' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: 8 }}>
                {sourceMap.map((s, i) => (
                  <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: t.text }}>{s.source}</span>
                    <span style={{ color: t.muted, fontFamily: 'JetBrains Mono, monospace' }}>{orderCount ? ((s.count / orderCount) * 100).toFixed(0) : 0}%</span>
                    <span style={{ color: t.text, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>₪{fmt(s.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Funnel + Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Funnel */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>🔄 قمع الطلبيات</h3>
          {statusCounts.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد طلبيات</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {statusCounts.map((s, i) => {
                const maxCount = statusCounts[0]?.count || 1;
                const widthPct = Math.max(30, (s.count / maxCount) * 100);
                const color = STATUS_COLORS[s.status] || '#94A3B8';
                return (
                  <div key={s.status} style={{
                    width: `${widthPct}%`, padding: '8px 12px', borderRadius: 8,
                    background: `${color}18`, border: `1px solid ${color}30`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 12, transition: 'width 0.5s',
                  }}>
                    <span style={{ color, fontWeight: 600 }}>{s.status}</span>
                    <span style={{ color: t.text, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{s.count}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: 10, fontSize: 11, color: t.muted }}>
                معدل الإكمال: {orderCount ? ((delivered / orderCount) * 100).toFixed(0) : 0}%
              </div>
            </div>
          )}
        </div>

        {/* Daily Trend */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>📈 اتجاه المبيعات اليومي</h3>
          {dailyTrend.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyTrend}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NAVY} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={NAVY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: t.muted }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: t.muted }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ fontFamily: F, fontSize: 12, direction: 'rtl', borderRadius: 8 }}
                  formatter={(v: number, name: string) => [`₪${fmt(v)}`, 'المبيعات']}
                  labelFormatter={l => l}
                />
                <Area type="monotone" dataKey="total" stroke={NAVY} strokeWidth={2} fill="url(#colorSales)" dot={{ r: 3, fill: NAVY }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 12 }}>🕐 آخر الطلبيات</h3>
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد طلبيات</div>
        ) : orders.slice(0, 5).map(o => {
          const statusColor = STATUS_COLORS[o.status] || '#94A3B8';
          return (
            <div key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: `1px solid ${t.border}`, fontSize: 13,
            }}>
              <span style={{ color: ACCENT, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', width: 90, flexShrink: 0 }}>{o.reference_number}</span>
              <span style={{ flex: 1, color: t.text, fontWeight: 500 }}>{o.customer_name || '—'}</span>
              <span style={{ color: t.text, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', width: 80, textAlign: 'center' }}>₪{fmt(o.total || 0)}</span>
              <span style={{
                padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30`,
                whiteSpace: 'nowrap',
              }}>● {o.status}</span>
              <span style={{ color: t.faint, fontSize: 11, width: 60, textAlign: 'left', whiteSpace: 'nowrap' }}>{relativeTime(o.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

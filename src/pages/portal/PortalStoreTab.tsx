import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend } from 'recharts';

const F = "Cairo, Tajawal, sans-serif";
const NAVY = "#0D1B2E";
const ACCENT = "#2A7B9B";

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

interface Props { theme?: 'light' | 'dark' }

interface QOrder {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  total: number;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  paid_amount: number | null;
  source: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  shipping_method: string | null;
  tracking_number: string | null;
  order_date: string;
  delivery_date: string | null;
  created_at: string;
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
  'قيد التصنيع': '#F59E0B', 'قيد التجهيز': '#F59E0B', 'جاهز للفوترة': '#8B5CF6', 'مفوتر': '#06B6D4',
  'جاهز للشحن': '#14B8A6', 'تم الشحن': '#22C55E', 'تم التسليم': '#16A34A',
  'ملغي': '#EF4444', 'مؤجل': '#EAB308',
};

const SOURCE_MAP: Record<string, string> = {
  'whatsapp': 'واتساب', 'visit': 'زيارة', 'phone': 'هاتف', 'store': 'متجر', 'other': 'أخرى',
  'facebook': 'فيسبوك', 'instagram': 'انستغرام', 'website': 'موقع إلكتروني', 'يدوي': 'يدوي',
};

const PIE_COLORS = ['#0D1B2E', '#2A7B9B', '#F59E0B', '#22C55E', '#8B5CF6', '#EF4444'];

type CardKey = 'all' | 'new' | 'processing' | 'transit' | 'delivered' | 'collected' | 'cancelled';

function inTransit(o: QOrder): boolean {
  return ['جاهز للشحن', 'تم الشحن', 'قيد التجهيز'].includes(o.status);
}
function isCollected(o: QOrder): boolean {
  return o.payment_status === 'مدفوع' || (Number(o.paid_amount) || 0) >= Number(o.total || 0);
}
function regionOf(address: string | null | undefined): string {
  if (!address) return 'غير محدد';
  const parts = address.split(/\s+-\s+|،|,/).map(s => s.trim()).filter(Boolean);
  return parts[0] || 'غير محدد';
}

const WEEKDAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function PortalStoreTab({ theme = 'light' }: Props) {
  const t = getTheme(theme === 'dark');
  const navigate = useNavigate();
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [orders, setOrders] = useState<QOrder[]>([]);
  const [prevOrders, setPrevOrders] = useState<QOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<CardKey>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [weekdayFilter, setWeekdayFilter] = useState<number | 'all'>('all');

  const [dateFrom, dateTo] = getDateRange(preset, customFrom, customTo);
  const [prevFrom, prevTo] = getPreviousRange(dateFrom, dateTo);

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    const cols = 'id, order_number, customer_name, customer_phone, customer_address, total, subtotal, discount, shipping_cost, paid_amount, source, status, payment_status, payment_method, shipping_method, tracking_number, order_date, delivery_date, created_at';
    const [{ data: cur }, { data: prv }] = await Promise.all([
      supabase.from('orders').select(cols).gte('created_at', dateFrom).lt('created_at', dateTo).order('created_at', { ascending: false }),
      supabase.from('orders').select(cols).gte('created_at', prevFrom).lt('created_at', prevTo),
    ]);
    setOrders((cur || []) as any);
    setPrevOrders((prv || []) as any);
    setLoading(false);
  };

  // ===== Filtered orders by region/weekday (applies to all sections below) =====
  const baseOrders = useMemo(() => orders.filter(o => {
    if (regionFilter !== 'all' && regionOf(o.customer_address) !== regionFilter) return false;
    if (weekdayFilter !== 'all' && new Date(o.created_at).getDay() !== weekdayFilter) return false;
    return true;
  }), [orders, regionFilter, weekdayFilter]);

  // ===== KPIs =====
  const active = baseOrders.filter(o => o.status !== 'ملغي');
  const prevActive = prevOrders.filter(o => o.status !== 'ملغي');
  const totalSales = active.reduce((s, o) => s + (o.total || 0), 0);
  const prevTotalSales = prevActive.reduce((s, o) => s + (o.total || 0), 0);
  const orderCount = active.length;
  const prevOrderCount = prevActive.length;
  const avgOrder = orderCount ? totalSales / orderCount : 0;
  const prevAvgOrder = prevOrderCount ? prevTotalSales / prevOrderCount : 0;
  const delivered = active.filter(o => ['تم التسليم', 'مفوتر'].includes(o.status)).length;
  const convRate = orderCount ? (delivered / orderCount) * 100 : 0;
  const prevDelivered = prevActive.filter(o => ['تم التسليم', 'مفوتر'].includes(o.status)).length;
  const prevConvRate = prevOrderCount ? (prevDelivered / prevOrderCount) * 100 : 0;

  // Secondary KPIs
  const totalShipping = active.reduce((s, o) => s + (o.shipping_cost || 0), 0);
  const totalDiscount = active.reduce((s, o) => s + (o.discount || 0), 0);
  const cancelled = baseOrders.filter(o => o.status === 'ملغي').length;
  const cancelRate = baseOrders.length ? (cancelled / baseOrders.length) * 100 : 0;
  const collectedAmount = active.filter(isCollected).reduce((s, o) => s + (o.total || 0), 0);
  const outstandingAmount = active.filter(o => !isCollected(o)).reduce((s, o) => s + ((o.total || 0) - (Number(o.paid_amount) || 0)), 0);

  // Card buckets (use baseOrders so region/weekday filters apply)
  const cardBuckets = useMemo(() => ({
    all: baseOrders.filter(o => o.status !== 'ملغي'),
    new: baseOrders.filter(o => o.status === 'جديد'),
    processing: baseOrders.filter(o => o.status === 'قيد التجهيز' || o.status === 'قيد التصنيع' || o.status === 'مؤكد'),
    transit: baseOrders.filter(inTransit),
    delivered: baseOrders.filter(o => ['تم التسليم', 'مفوتر'].includes(o.status)),
    collected: baseOrders.filter(isCollected),
    cancelled: baseOrders.filter(o => o.status === 'ملغي'),
  }), [baseOrders]);

  const visibleOrders = cardBuckets[activeCard] || [];

  // Regions
  const regionMap = useMemo(() => {
    const map = new Map<string, { city: string; count: number; total: number }>();
    active.forEach(o => {
      const city = regionOf(o.customer_address);
      const curr = map.get(city) || { city, count: 0, total: 0 };
      curr.count++; curr.total += o.total || 0;
      map.set(city, curr);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [baseOrders]);

  const allRegions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => set.add(regionOf(o.customer_address)));
    return [...set].sort();
  }, [orders]);

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
  }, [baseOrders]);

  // Status funnel
  const statusCounts = useMemo(() => {
    const stages = ['جديد', 'قيد المراجعة', 'مؤكد', 'قيد التجهيز', 'قيد التصنيع', 'جاهز للفوترة', 'مفوتر', 'جاهز للشحن', 'تم الشحن', 'تم التسليم'];
    return stages.map(s => ({ status: s, count: baseOrders.filter(o => o.status === s).length })).filter(s => s.count > 0);
  }, [baseOrders]);

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
  }, [baseOrders]);

  // Weekday distribution
  const weekdayDist = useMemo(() => {
    const arr = WEEKDAY_AR.map(d => ({ day: d, count: 0, total: 0 }));
    active.forEach(o => {
      const idx = new Date(o.created_at).getDay();
      arr[idx].count++;
      arr[idx].total += o.total || 0;
    });
    return arr;
  }, [baseOrders]);

  const openOrder = (id: string) => navigate(`/orders/${id}`);

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

  const cardDefs: { key: CardKey; label: string; icon: string; color: string; count: number; total: number }[] = [
    { key: 'all', label: 'كل الطلبيات', icon: '📋', color: NAVY, count: cardBuckets.all.length, total: cardBuckets.all.reduce((s, o) => s + (o.total || 0), 0) },
    { key: 'new', label: 'جديدة', icon: '🆕', color: '#3B82F6', count: cardBuckets.new.length, total: cardBuckets.new.reduce((s, o) => s + (o.total || 0), 0) },
    { key: 'processing', label: 'قيد التجهيز', icon: '⚙️', color: '#F59E0B', count: cardBuckets.processing.length, total: cardBuckets.processing.reduce((s, o) => s + (o.total || 0), 0) },
    { key: 'transit', label: 'في الطريق', icon: '🚚', color: '#14B8A6', count: cardBuckets.transit.length, total: cardBuckets.transit.reduce((s, o) => s + (o.total || 0), 0) },
    { key: 'delivered', label: 'تم التسليم', icon: '✅', color: '#16A34A', count: cardBuckets.delivered.length, total: cardBuckets.delivered.reduce((s, o) => s + (o.total || 0), 0) },
    { key: 'collected', label: 'المحصّلة', icon: '💵', color: '#22C55E', count: cardBuckets.collected.length, total: cardBuckets.collected.reduce((s, o) => s + (o.total || 0), 0) },
    { key: 'cancelled', label: 'ملغية', icon: '❌', color: '#EF4444', count: cardBuckets.cancelled.length, total: cardBuckets.cancelled.reduce((s, o) => s + (o.total || 0), 0) },
  ];

  return (
    <div style={{ direction: 'rtl', fontFamily: F }}>
      {/* Filters row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <div style={{ width: 1, height: 22, background: t.border, margin: '0 4px' }} />
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontFamily: F, fontSize: 12, cursor: 'pointer' }}>
          <option value="all">📍 كل المناطق</option>
          {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={String(weekdayFilter)} onChange={e => setWeekdayFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          style={{ padding: '6px 10px', borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontFamily: F, fontSize: 12, cursor: 'pointer' }}>
          <option value="all">📅 كل الأيام</option>
          {WEEKDAY_AR.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        {(regionFilter !== 'all' || weekdayFilter !== 'all') && (
          <button onClick={() => { setRegionFilter('all'); setWeekdayFilter('all'); }}
            style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${t.border}`, background: 'transparent', color: '#EF4444', fontFamily: F, fontSize: 12, cursor: 'pointer' }}>
            ✖ مسح الفلاتر
          </button>
        )}
      </div>

      {/* Card system — clickable status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        {cardDefs.map(c => {
          const isActive = activeCard === c.key;
          return (
            <button key={c.key} onClick={() => setActiveCard(c.key)} style={{
              cursor: 'pointer', textAlign: 'right', padding: 14, borderRadius: 14,
              background: isActive ? `${c.color}12` : t.card,
              border: `2px solid ${isActive ? c.color : t.border}`,
              fontFamily: F, transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 4,
              boxShadow: isActive ? `0 4px 12px ${c.color}25` : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>{c.label}</span>
                <span style={{ fontSize: 18 }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: c.color, fontFamily: 'JetBrains Mono, monospace' }}>{c.count}</div>
              <div style={{ fontSize: 11, color: t.faint, fontFamily: 'JetBrains Mono, monospace' }}>₪{fmt(c.total)}</div>
            </button>
          );
        })}
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
          { label: '💵 المحصّل', value: `₪${fmt(collectedAmount)}`, sub: totalSales ? `${((collectedAmount / totalSales) * 100).toFixed(0)}% من المبيعات` : '' },
          { label: '⏳ المستحق', value: `₪${fmt(outstandingAmount)}`, sub: `${cardBuckets.all.filter(o => !isCollected(o)).length} طلبية` },
          { label: '🏷️ الخصومات', value: `₪${fmt(totalDiscount)}`, sub: totalSales ? `${((totalDiscount / totalSales) * 100).toFixed(1)}% من الإجمالي` : '' },
          { label: '❌ نسبة الإلغاء', value: `${cancelRate.toFixed(0)}%`, sub: `${cancelled} من ${baseOrders.length}` },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: 14 }}>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: 10, color: t.faint, marginTop: 2 }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Row: Regions + Sources */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Regions */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>📍 مبيعات المناطق {regionFilter !== 'all' && `· ${regionFilter}`}</h3>
          {regionMap.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.muted, fontSize: 13, padding: 20 }}>لا توجد بيانات</div>
          ) : regionMap.slice(0, 10).map((r, i) => {
            const maxT = regionMap[0]?.total || 1;
            const pct = (r.total / maxT) * 100;
            return (
              <div key={r.city} onClick={() => setRegionFilter(regionFilter === r.city ? 'all' : r.city)} style={{ marginBottom: 10, cursor: 'pointer' }}>
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

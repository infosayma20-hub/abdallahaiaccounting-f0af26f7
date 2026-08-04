import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  RefreshCw, Search, ChevronDown, ChevronLeft, Package, Filter, X,
} from 'lucide-react';

/**
 * Orders workspace — Microsoft Dynamics 365 "Finance shell" inspired layout:
 * command bar → filter strip → KPI tile band → summary panels → dense data grid
 * with expandable line-item detail. Fully tenant-scoped through RLS on `orders`.
 */

const F = 'Cairo, Tajawal, sans-serif';
const MONO = 'JetBrains Mono, monospace';
const ACCENT = '#2A7B9B';
const NAVY = '#0D1B2E';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

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

interface QItem {
  id: string;
  order_id: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  discount: number | null;
  total: number | null;
}

function getTheme(dark: boolean) {
  return dark
    ? {
      shell: '#0F141A', bg: '#161B22', card: '#1C2128', head: '#222A33',
      text: '#E6EDF3', muted: 'rgba(230,237,243,0.62)', faint: 'rgba(230,237,243,0.38)',
      border: 'rgba(230,237,243,0.10)', zebra: 'rgba(255,255,255,0.02)', hover: 'rgba(42,123,155,0.12)',
    }
    : {
      shell: '#F3F2F1', bg: '#F0F2F5', card: '#FFFFFF', head: '#FAFAFA',
      text: '#1B3A5C', muted: 'rgba(27,58,92,0.62)', faint: 'rgba(27,58,92,0.38)',
      border: 'rgba(27,58,92,0.12)', zebra: 'rgba(27,58,92,0.025)', hover: 'rgba(42,123,155,0.08)',
    };
}

function fmt(v: number) { return (Math.round(Number(v) || 0)).toLocaleString('en-US'); }
function fmt2(v: number) { return (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function pad(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateRange(preset: DatePreset, customFrom?: string, customTo?: string): [string, string] {
  const now = new Date();
  const tomorrow = pad(new Date(now.getTime() + 86400000));
  switch (preset) {
    case 'today': return [pad(now), tomorrow];
    case 'yesterday': { const y = new Date(now.getTime() - 86400000); return [pad(y), pad(now)]; }
    case 'week': { const w = new Date(now); w.setDate(w.getDate() - ((w.getDay() + 1) % 7)); return [pad(w), tomorrow]; }
    case 'month': return [pad(now).slice(0, 8) + '01', tomorrow];
    case 'quarter': { const q = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); return [pad(q), tomorrow]; }
    case 'year': return [`${now.getFullYear()}-01-01`, tomorrow];
    case 'custom': return [customFrom || pad(now), customTo || tomorrow];
  }
}

function getPreviousRange(from: string, to: string): [string, string] {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return [new Date(new Date(from).getTime() - diff).toISOString().slice(0, 10), from];
}

function relativeTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} س`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'أمس' : `${days} يوم`;
}

const STATUS_COLORS: Record<string, string> = {
  'جديد': '#3B82F6', 'قيد المراجعة': '#6366F1', 'مؤكد': '#8B5CF6',
  'قيد التصنيع': '#F59E0B', 'قيد التجهيز': '#F59E0B', 'جاهز للفوترة': '#8B5CF6', 'مفوتر': '#06B6D4',
  'جاهز للشحن': '#14B8A6', 'تم الشحن': '#22C55E', 'تم التسليم': '#16A34A',
  'ملغي': '#EF4444', 'مؤجل': '#EAB308',
};

const SOURCE_MAP: Record<string, string> = {
  whatsapp: 'واتساب', visit: 'زيارة', phone: 'هاتف', store: 'متجر', other: 'أخرى',
  facebook: 'فيسبوك', instagram: 'انستغرام', website: 'موقع إلكتروني', 'يدوي': 'يدوي',
};

const PIE_COLORS = ['#0D1B2E', '#2A7B9B', '#F59E0B', '#22C55E', '#8B5CF6', '#EF4444'];
const WEEKDAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

type CardKey = 'all' | 'new' | 'processing' | 'transit' | 'delivered' | 'unpaid' | 'cancelled';
type SortKey = 'created_at' | 'order_number' | 'customer_name' | 'total' | 'paid' | 'remaining' | 'status';

const CANCELLED = 'ملغي';
function inTransit(o: QOrder) { return ['جاهز للشحن', 'تم الشحن', 'قيد التجهيز'].includes(o.status); }
function paidOf(o: QOrder) { return Math.max(0, Math.min(Number(o.paid_amount) || 0, Number(o.total) || 0)); }
function remainingOf(o: QOrder) { return Math.max(0, (Number(o.total) || 0) - paidOf(o)); }
function isFullyPaid(o: QOrder) { return remainingOf(o) <= 0.009 && (Number(o.total) || 0) > 0; }
function regionOf(address: string | null | undefined): string {
  if (!address) return 'غير محدد';
  const parts = address.split(/\s+-\s+|،|,/).map(s => s.trim()).filter(Boolean);
  return parts[0] || 'غير محدد';
}

export default function PortalStoreTab({ theme = 'light' }: Props) {
  const t = getTheme(theme === 'dark');
  const navigate = useNavigate();

  const [preset, setPreset] = useState<DatePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [orders, setOrders] = useState<QOrder[]>([]);
  const [prevOrders, setPrevOrders] = useState<QOrder[]>([]);
  const [items, setItems] = useState<QItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<CardKey>('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [weekdayFilter, setWeekdayFilter] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [showAnalytics, setShowAnalytics] = useState(true);

  const [dateFrom, dateTo] = getDateRange(preset, customFrom, customTo);
  const [prevFrom, prevTo] = getPreviousRange(dateFrom, dateTo);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    const cols = 'id, order_number, customer_name, customer_phone, customer_address, total, subtotal, discount, shipping_cost, paid_amount, source, status, payment_status, payment_method, shipping_method, tracking_number, order_date, delivery_date, created_at';
    const [{ data: cur }, { data: prv }] = await Promise.all([
      supabase.from('orders').select(cols).gte('created_at', dateFrom).lt('created_at', dateTo).order('created_at', { ascending: false }),
      supabase.from('orders').select(cols).gte('created_at', prevFrom).lt('created_at', prevTo),
    ]);
    const list = (cur || []) as any as QOrder[];
    setOrders(list);
    setPrevOrders((prv || []) as any);

    // Line items for the loaded orders (chunked to stay within URL limits)
    const ids = list.map(o => o.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
    const results = await Promise.all(chunks.map(ch =>
      supabase.from('order_items').select('id, order_id, product_name, quantity, unit_price, discount, total').in('order_id', ch)
    ));
    setItems(results.flatMap(r => (r.data || []) as any as QItem[]));
    setLoading(false);
  };

  // ===== Filter pipeline =====
  const baseOrders = useMemo(() => orders.filter(o => {
    if (regionFilter !== 'all' && regionOf(o.customer_address) !== regionFilter) return false;
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (weekdayFilter !== 'all' && new Date(o.created_at).getDay() !== weekdayFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${o.order_number || ''} ${o.customer_name || ''} ${o.customer_phone || ''} ${o.customer_address || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [orders, regionFilter, statusFilter, weekdayFilter, search]);

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, QItem[]>();
    items.forEach(it => {
      const arr = map.get(it.order_id) || [];
      arr.push(it);
      map.set(it.order_id, arr);
    });
    return map;
  }, [items]);

  const active = useMemo(() => baseOrders.filter(o => o.status !== CANCELLED), [baseOrders]);
  const prevActive = useMemo(() => prevOrders.filter(o => o.status !== CANCELLED), [prevOrders]);

  const totalSales = active.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const prevTotalSales = prevActive.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const orderCount = active.length;
  const prevOrderCount = prevActive.length;
  const avgOrder = orderCount ? totalSales / orderCount : 0;
  const prevAvgOrder = prevOrderCount ? prevTotalSales / prevOrderCount : 0;

  const collectedAmount = active.reduce((s, o) => s + paidOf(o), 0);
  const prevCollected = prevActive.reduce((s, o) => s + paidOf(o), 0);
  const outstandingAmount = active.reduce((s, o) => s + remainingOf(o), 0);
  const unpaidCount = active.filter(o => remainingOf(o) > 0.009).length;
  const totalDiscount = active.reduce((s, o) => s + (Number(o.discount) || 0), 0);
  const totalShipping = active.reduce((s, o) => s + (Number(o.shipping_cost) || 0), 0);
  const cancelled = baseOrders.filter(o => o.status === CANCELLED).length;
  const cancelRate = baseOrders.length ? (cancelled / baseOrders.length) * 100 : 0;
  const delivered = active.filter(o => ['تم التسليم', 'مفوتر'].includes(o.status)).length;
  const collectPct = totalSales ? (collectedAmount / totalSales) * 100 : 0;

  // Line-item aggregates (only for non-cancelled orders in view)
  const activeIds = useMemo(() => new Set(active.map(o => o.id)), [active]);
  const activeItems = useMemo(() => items.filter(i => activeIds.has(i.order_id)), [items, activeIds]);
  const lineCount = activeItems.length;
  const unitCount = activeItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const itemsRevenue = activeItems.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const ordersWithoutItems = active.filter(o => !(itemsByOrder.get(o.id)?.length)).length;
  // Integrity: items total must reconcile with subtotal (before discount/shipping)
  const subtotalSum = active.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
  const itemsVariance = itemsRevenue - subtotalSum;

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    activeItems.forEach(i => {
      const name = i.product_name || 'صنف غير مسمّى';
      const cur = map.get(name) || { name, qty: 0, revenue: 0 };
      cur.qty += Number(i.quantity) || 0;
      cur.revenue += Number(i.total) || 0;
      map.set(name, cur);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [activeItems]);

  const cardBuckets = useMemo(() => ({
    all: baseOrders.filter(o => o.status !== CANCELLED),
    new: baseOrders.filter(o => o.status === 'جديد'),
    processing: baseOrders.filter(o => ['قيد التجهيز', 'قيد التصنيع', 'مؤكد', 'قيد المراجعة'].includes(o.status)),
    transit: baseOrders.filter(inTransit),
    delivered: baseOrders.filter(o => ['تم التسليم', 'مفوتر'].includes(o.status)),
    unpaid: baseOrders.filter(o => o.status !== CANCELLED && remainingOf(o) > 0.009),
    cancelled: baseOrders.filter(o => o.status === CANCELLED),
  }), [baseOrders]);

  const sortedOrders = useMemo(() => {
    const arr = [...(cardBuckets[activeCard] || [])];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const get = (o: QOrder) => {
        switch (sortKey) {
          case 'order_number': return o.order_number || '';
          case 'customer_name': return o.customer_name || '';
          case 'total': return Number(o.total) || 0;
          case 'paid': return paidOf(o);
          case 'remaining': return remainingOf(o);
          case 'status': return o.status || '';
          default: return o.created_at;
        }
      };
      const av = get(a), bv = get(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });
    return arr;
  }, [cardBuckets, activeCard, sortKey, sortDir]);

  const visibleOrders = sortedOrders.slice(0, pageSize);
  const gridTotals = useMemo(() => ({
    total: sortedOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    paid: sortedOrders.reduce((s, o) => s + paidOf(o), 0),
    remaining: sortedOrders.reduce((s, o) => s + remainingOf(o), 0),
    lines: sortedOrders.reduce((s, o) => s + (itemsByOrder.get(o.id)?.length || 0), 0),
  }), [sortedOrders, itemsByOrder]);

  const regionMap = useMemo(() => {
    const map = new Map<string, { city: string; count: number; total: number }>();
    active.forEach(o => {
      const city = regionOf(o.customer_address);
      const cur = map.get(city) || { city, count: 0, total: 0 };
      cur.count++; cur.total += Number(o.total) || 0;
      map.set(city, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [active]);

  const allRegions = useMemo(() => [...new Set(orders.map(o => regionOf(o.customer_address)))].sort(), [orders]);
  const allStatuses = useMemo(() => [...new Set(orders.map(o => o.status).filter(Boolean))], [orders]);

  const sourceMap = useMemo(() => {
    const map = new Map<string, { source: string; count: number; total: number }>();
    active.forEach(o => {
      const src = SOURCE_MAP[o.source || ''] || o.source || 'أخرى';
      const cur = map.get(src) || { source: src, count: 0, total: 0 };
      cur.count++; cur.total += Number(o.total) || 0;
      map.set(src, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [active]);

  const statusCounts = useMemo(() => {
    const stages = ['جديد', 'قيد المراجعة', 'مؤكد', 'قيد التجهيز', 'قيد التصنيع', 'جاهز للفوترة', 'مفوتر', 'جاهز للشحن', 'تم الشحن', 'تم التسليم'];
    return stages
      .map(s => ({ status: s, count: baseOrders.filter(o => o.status === s).length, total: baseOrders.filter(o => o.status === s).reduce((x, o) => x + (Number(o.total) || 0), 0) }))
      .filter(s => s.count > 0);
  }, [baseOrders]);

  const dailyTrend = useMemo(() => {
    const map = new Map<string, { date: string; total: number; count: number }>();
    active.forEach(o => {
      const d = o.created_at.slice(0, 10);
      const cur = map.get(d) || { date: d, total: 0, count: 0 };
      cur.total += Number(o.total) || 0; cur.count++;
      map.set(d, cur);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [active]);

  const pctChange = (curr: number, prev: number) => (!prev ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);

  const datePresets: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'اليوم' }, { key: 'yesterday', label: 'أمس' },
    { key: 'week', label: 'الأسبوع' }, { key: 'month', label: 'الشهر' },
    { key: 'quarter', label: 'الربع' }, { key: 'year', label: 'السنة' },
    { key: 'custom', label: 'مخصص' },
  ];

  const cardDefs: { key: CardKey; label: string; color: string; count: number; total: number }[] = [
    { key: 'all', label: 'كل الطلبيات', color: NAVY, count: cardBuckets.all.length, total: cardBuckets.all.reduce((s, o) => s + (Number(o.total) || 0), 0) },
    { key: 'new', label: 'جديدة', color: '#3B82F6', count: cardBuckets.new.length, total: cardBuckets.new.reduce((s, o) => s + (Number(o.total) || 0), 0) },
    { key: 'processing', label: 'قيد التجهيز', color: '#F59E0B', count: cardBuckets.processing.length, total: cardBuckets.processing.reduce((s, o) => s + (Number(o.total) || 0), 0) },
    { key: 'transit', label: 'في الطريق', color: '#14B8A6', count: cardBuckets.transit.length, total: cardBuckets.transit.reduce((s, o) => s + (Number(o.total) || 0), 0) },
    { key: 'delivered', label: 'تم التسليم', color: '#16A34A', count: cardBuckets.delivered.length, total: cardBuckets.delivered.reduce((s, o) => s + (Number(o.total) || 0), 0) },
    { key: 'unpaid', label: 'عليها متبقٍ', color: '#D97706', count: cardBuckets.unpaid.length, total: cardBuckets.unpaid.reduce((s, o) => s + remainingOf(o), 0) },
    { key: 'cancelled', label: 'ملغية', color: '#EF4444', count: cardBuckets.cancelled.length, total: cardBuckets.cancelled.reduce((s, o) => s + (Number(o.total) || 0), 0) },
  ];

  const panel: React.CSSProperties = {
    background: t.card, border: `1px solid ${t.border}`, borderRadius: 4, fontFamily: F,
  };

  const filtersActive = regionFilter !== 'all' || statusFilter !== 'all' || weekdayFilter !== 'all' || !!search.trim();

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'customer_name' || k === 'order_number' || k === 'status' ? 'asc' : 'desc'); }
  };

  const SortHead = ({ k, label, align = 'right', w }: { k: SortKey; label: string; align?: 'right' | 'left' | 'center'; w?: number }) => (
    <th onClick={() => toggleSort(k)} style={{
      padding: '8px 10px', textAlign: align as any, fontSize: 11, fontWeight: 700, color: t.muted,
      cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `1px solid ${t.border}`, width: w,
      userSelect: 'none',
    }}>
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div style={{ direction: 'rtl', fontFamily: F, background: t.shell, borderRadius: 6, padding: 10 }}>
      {/* ═══ Command bar ═══ */}
      <div style={{
        ...panel, padding: '10px 12px', marginBottom: 8, display: 'flex',
        alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Package size={18} style={{ color: ACCENT }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>مساحة عمل الطلبيات</div>
            <div style={{ fontSize: 10, color: t.faint }}>{dateFrom} → {dateTo} · {orders.length} سجل</div>
          </div>
        </div>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Search size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: t.faint }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الطلبية / الزبون / الهاتف"
            style={{
              width: '100%', padding: '7px 26px 7px 10px', borderRadius: 3, fontFamily: F, fontSize: 12,
              border: `1px solid ${t.border}`, background: t.bg, color: t.text, outline: 'none',
            }}
          />
        </div>
        <button onClick={() => setShowAnalytics(v => !v)} style={cmdBtn(t)}>
          <Filter size={12} /> {showAnalytics ? 'إخفاء التحليلات' : 'عرض التحليلات'}
        </button>
        <button onClick={fetchData} style={cmdBtn(t)}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> تحديث
        </button>
        <button onClick={() => navigate('/orders')} style={{ ...cmdBtn(t), color: '#fff', background: ACCENT, borderColor: ACCENT }}>
          الشاشة الكاملة <ChevronLeft size={12} />
        </button>
      </div>

      {/* ═══ Filter strip ═══ */}
      <div style={{ ...panel, padding: '8px 12px', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {datePresets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)} style={{
            padding: '5px 12px', borderRadius: 3, fontFamily: F, fontSize: 11, cursor: 'pointer',
            border: `1px solid ${preset === p.key ? ACCENT : t.border}`,
            background: preset === p.key ? `${ACCENT}18` : 'transparent',
            color: preset === p.key ? ACCENT : t.muted, fontWeight: preset === p.key ? 700 : 500,
          }}>{p.label}</button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputSt(t)} />
            <span style={{ color: t.faint, fontSize: 11 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputSt(t)} />
          </>
        )}
        <div style={{ width: 1, height: 20, background: t.border, margin: '0 4px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputSt(t)}>
          <option value="all">كل الحالات</option>
          {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={inputSt(t)}>
          <option value="all">كل المناطق</option>
          {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={String(weekdayFilter)} onChange={e => setWeekdayFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={inputSt(t)}>
          <option value="all">كل الأيام</option>
          {WEEKDAY_AR.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        {filtersActive && (
          <button onClick={() => { setRegionFilter('all'); setStatusFilter('all'); setWeekdayFilter('all'); setSearch(''); }}
            style={{ ...cmdBtn(t), color: '#EF4444', borderColor: '#EF444440' }}>
            <X size={11} /> مسح
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ ...panel, padding: 50, textAlign: 'center', color: t.muted, fontSize: 13 }}>جارٍ تحميل الطلبيات...</div>
      ) : (
        <>
          {/* ═══ Tile band — clickable buckets ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 6, marginBottom: 8 }}>
            {cardDefs.map(cd => {
              const isActive = activeCard === cd.key;
              return (
                <button key={cd.key} onClick={() => { setActiveCard(cd.key); setExpanded(null); }} style={{
                  cursor: 'pointer', textAlign: 'right', padding: '10px 12px', borderRadius: 3,
                  background: isActive ? cd.color : t.card,
                  border: `1px solid ${isActive ? cd.color : t.border}`,
                  borderTop: `3px solid ${cd.color}`,
                  fontFamily: F, display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.85)' : t.muted }}>{cd.label}</span>
                  <span style={{ fontSize: 21, fontWeight: 800, fontFamily: MONO, color: isActive ? '#fff' : cd.color }}>{cd.count}</span>
                  <span style={{ fontSize: 10, fontFamily: MONO, color: isActive ? 'rgba(255,255,255,0.7)' : t.faint }}>₪{fmt(cd.total)}</span>
                </button>
              );
            })}
          </div>

          {/* ═══ KPI band ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginBottom: 8 }}>
            <Kpi t={t} label="إجمالي المبيعات" value={`₪${fmt(totalSales)}`} change={pctChange(totalSales, prevTotalSales)} />
            <Kpi t={t} label="عدد الطلبيات" value={fmt(orderCount)} change={pctChange(orderCount, prevOrderCount)} />
            <Kpi t={t} label="متوسط الطلبية" value={`₪${fmt(avgOrder)}`} change={pctChange(avgOrder, prevAvgOrder)} />
            <Kpi t={t} label="المحصّل فعلياً" value={`₪${fmt(collectedAmount)}`} change={pctChange(collectedAmount, prevCollected)} sub={`${collectPct.toFixed(0)}% من المبيعات`} color="#16A34A" />
            <Kpi t={t} label="المتبقي على الزبائن" value={`₪${fmt(outstandingAmount)}`} sub={`${unpaidCount} طلبية`} color="#D97706" />
            <Kpi t={t} label="بنود / كميات" value={`${fmt(lineCount)} / ${fmt(unitCount)}`} sub={`${topProducts.length} صنف مختلف`} color={ACCENT} />
          </div>

          {/* ═══ Reconciliation strip ═══ */}
          <div style={{ ...panel, padding: '8px 12px', marginBottom: 8, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
            <Recon t={t} label="مجموع البنود" value={`₪${fmt2(itemsRevenue)}`} />
            <Recon t={t} label="مجموع ما قبل الخصم (subtotal)" value={`₪${fmt2(subtotalSum)}`} />
            <Recon t={t} label="فرق المطابقة" value={`₪${fmt2(itemsVariance)}`} tone={Math.abs(itemsVariance) < 0.01 ? 'ok' : 'warn'} />
            <Recon t={t} label="الخصومات" value={`₪${fmt2(totalDiscount)}`} />
            <Recon t={t} label="الشحن" value={`₪${fmt2(totalShipping)}`} />
            <Recon t={t} label="المبيعات = subtotal − خصم + شحن" value={`₪${fmt2(subtotalSum - totalDiscount + totalShipping)}`} tone={Math.abs((subtotalSum - totalDiscount + totalShipping) - totalSales) < 0.01 ? 'ok' : 'warn'} />
            <Recon t={t} label="المحصّل + المتبقي" value={`₪${fmt2(collectedAmount + outstandingAmount)}`} tone={Math.abs(collectedAmount + outstandingAmount - totalSales) < 0.01 ? 'ok' : 'warn'} />
            <Recon t={t} label="طلبيات بلا بنود" value={String(ordersWithoutItems)} tone={ordersWithoutItems === 0 ? 'ok' : 'warn'} />
            <Recon t={t} label="نسبة الإلغاء" value={`${cancelRate.toFixed(0)}% (${cancelled})`} />
            <Recon t={t} label="مكتملة التسليم" value={`${delivered} / ${orderCount}`} />
          </div>

          {/* ═══ Analytics panels ═══ */}
          {showAnalytics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8, marginBottom: 8 }}>
              {/* Status pipeline */}
              <div style={{ ...panel, padding: 12 }}>
                <PanelTitle t={t}>خط سير الحالات</PanelTitle>
                {statusCounts.length === 0 ? <Empty t={t} /> : statusCounts.map(s => {
                  const max = Math.max(...statusCounts.map(x => x.count)) || 1;
                  const color = STATUS_COLORS[s.status] || '#94A3B8';
                  return (
                    <div key={s.status} onClick={() => setStatusFilter(statusFilter === s.status ? 'all' : s.status)} style={{ marginBottom: 7, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                        <span style={{ color: t.text, fontWeight: 600 }}>{s.status}</span>
                        <span style={{ color: t.muted, fontFamily: MONO }}>{s.count} · ₪{fmt(s.total)}</span>
                      </div>
                      <div style={{ height: 5, background: t.border, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${(s.count / max) * 100}%`, height: '100%', background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Top products */}
              <div style={{ ...panel, padding: 12 }}>
                <PanelTitle t={t}>أعلى الأصناف مبيعاً</PanelTitle>
                {topProducts.length === 0 ? <Empty t={t} /> : topProducts.slice(0, 8).map((p, i) => (
                  <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: i < 7 ? `1px dashed ${t.border}` : 'none', fontSize: 11.5 }}>
                    <span style={{ color: t.faint, fontFamily: MONO, width: 16 }}>{i + 1}</span>
                    <span style={{ flex: 1, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ color: t.muted, fontFamily: MONO }}>{fmt(p.qty)}×</span>
                    <span style={{ color: t.text, fontWeight: 700, fontFamily: MONO }}>₪{fmt(p.revenue)}</span>
                  </div>
                ))}
              </div>

              {/* Regions */}
              <div style={{ ...panel, padding: 12 }}>
                <PanelTitle t={t}>المناطق</PanelTitle>
                {regionMap.length === 0 ? <Empty t={t} /> : regionMap.slice(0, 8).map(r => {
                  const max = regionMap[0]?.total || 1;
                  return (
                    <div key={r.city} onClick={() => setRegionFilter(regionFilter === r.city ? 'all' : r.city)} style={{ marginBottom: 7, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                        <span style={{ color: t.text, fontWeight: 600 }}>{r.city}</span>
                        <span style={{ color: t.muted, fontFamily: MONO }}>{r.count} · ₪{fmt(r.total)}</span>
                      </div>
                      <div style={{ height: 5, background: t.border, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${(r.total / max) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${ACCENT}, #14B8A6)` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sources */}
              <div style={{ ...panel, padding: 12 }}>
                <PanelTitle t={t}>مصادر الطلبيات</PanelTitle>
                {sourceMap.length === 0 ? <Empty t={t} /> : (
                  <>
                    <div style={{ height: 130 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={sourceMap.map(s => ({ name: s.source, value: s.total }))} cx="50%" cy="50%" innerRadius={36} outerRadius={58} dataKey="value" paddingAngle={2}>
                            {sourceMap.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => `₪${fmt(v)}`} contentStyle={{ fontFamily: F, fontSize: 11, direction: 'rtl' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {sourceMap.map((s, i) => (
                      <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '2px 0' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span style={{ flex: 1, color: t.text }}>{s.source}</span>
                        <span style={{ color: t.muted, fontFamily: MONO }}>{s.count}</span>
                        <span style={{ color: t.text, fontWeight: 700, fontFamily: MONO }}>₪{fmt(s.total)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Trend */}
              <div style={{ ...panel, padding: 12, gridColumn: '1 / -1' }}>
                <PanelTitle t={t}>اتجاه المبيعات اليومي</PanelTitle>
                {dailyTrend.length === 0 ? <Empty t={t} /> : (
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="ordTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ACCENT} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: t.muted }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: t.muted }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ fontFamily: F, fontSize: 11, direction: 'rtl' }} formatter={(v: number) => [`₪${fmt(v)}`, 'المبيعات']} />
                      <Area type="monotone" dataKey="total" stroke={ACCENT} strokeWidth={2} fill="url(#ordTrend)" dot={{ r: 2.5, fill: ACCENT }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* ═══ Data grid ═══ */}
          <div style={{ ...panel, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', borderBottom: `1px solid ${t.border}`, background: t.head, flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                {cardDefs.find(cd => cd.key === activeCard)?.label} — {sortedOrders.length} سجل
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: t.muted }}>
                عرض
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={inputSt(t)}>
                  {[25, 50, 100, 500].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 940 }}>
                <thead style={{ background: t.head }}>
                  <tr>
                    <th style={{ width: 28, borderBottom: `1px solid ${t.border}` }} />
                    <SortHead k="order_number" label="رقم الطلبية" w={120} />
                    <SortHead k="customer_name" label="الزبون" />
                    <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: t.muted, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>المنطقة</th>
                    <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: t.muted, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>البنود</th>
                    <SortHead k="total" label="الإجمالي" align="left" />
                    <SortHead k="paid" label="المدفوع" align="left" />
                    <SortHead k="remaining" label="المتبقي" align="left" />
                    <SortHead k="status" label="الحالة" align="center" />
                    <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: t.muted, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>حالة الدفع</th>
                    <SortHead k="created_at" label="التاريخ" align="center" />
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: 26, textAlign: 'center', color: t.muted }}>لا توجد طلبيات مطابقة</td></tr>
                  )}
                  {visibleOrders.map((o, idx) => {
                    const oi = itemsByOrder.get(o.id) || [];
                    const statusColor = STATUS_COLORS[o.status] || '#94A3B8';
                    const rem = remainingOf(o);
                    const isOpen = expanded === o.id;
                    return (
                      <>
                        <tr key={o.id}
                          onClick={() => setExpanded(isOpen ? null : o.id)}
                          style={{ background: isOpen ? t.hover : (idx % 2 ? t.zebra : 'transparent'), cursor: 'pointer' }}>
                          <td style={{ textAlign: 'center', color: t.faint, borderBottom: `1px solid ${t.border}` }}>
                            <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                          </td>
                          <td style={{ ...cellSt(t), color: ACCENT, fontWeight: 700, fontFamily: MONO }}>{o.order_number || '—'}</td>
                          <td style={{ ...cellSt(t), color: t.text, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.customer_name || '—'}
                            {o.customer_phone && <div style={{ fontSize: 10, color: t.faint, fontFamily: MONO }}>{o.customer_phone}</div>}
                          </td>
                          <td style={{ ...cellSt(t), color: t.muted, fontSize: 11, whiteSpace: 'nowrap' }}>{regionOf(o.customer_address)}</td>
                          <td style={{ ...cellSt(t), color: oi.length ? t.text : '#D97706', fontFamily: MONO, fontSize: 11 }}>
                            {oi.length ? `${oi.length} بند · ${fmt(oi.reduce((s, i) => s + (Number(i.quantity) || 0), 0))} كمية` : 'بدون بنود'}
                          </td>
                          <td style={{ ...cellSt(t), textAlign: 'left', fontFamily: MONO, fontWeight: 700, color: t.text }}>₪{fmt2(o.total || 0)}</td>
                          <td style={{ ...cellSt(t), textAlign: 'left', fontFamily: MONO, color: '#16A34A' }}>₪{fmt2(paidOf(o))}</td>
                          <td style={{ ...cellSt(t), textAlign: 'left', fontFamily: MONO, fontWeight: 700, color: rem > 0 ? '#D97706' : t.faint }}>₪{fmt2(rem)}</td>
                          <td style={{ ...cellSt(t), textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 9px', borderRadius: 2, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
                              background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}35`,
                            }}>{o.status}</span>
                          </td>
                          <td style={{ ...cellSt(t), textAlign: 'center', fontSize: 10.5, whiteSpace: 'nowrap', color: isFullyPaid(o) ? '#16A34A' : (paidOf(o) > 0 ? '#D97706' : t.muted) }}>
                            {isFullyPaid(o) ? 'مدفوعة' : paidOf(o) > 0 ? 'مدفوعة جزئياً' : 'غير مدفوعة'}
                          </td>
                          <td style={{ ...cellSt(t), textAlign: 'center', fontSize: 10.5, color: t.faint, whiteSpace: 'nowrap' }}>
                            {o.created_at.slice(0, 10)}<div>{relativeTime(o.created_at)}</div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={o.id + '-d'}>
                            <td colSpan={11} style={{ background: t.bg, borderBottom: `1px solid ${t.border}`, padding: 12 }}>
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: t.muted, marginBottom: 10 }}>
                                <span>العنوان: <b style={{ color: t.text }}>{o.customer_address || '—'}</b></span>
                                <span>المصدر: <b style={{ color: t.text }}>{SOURCE_MAP[o.source || ''] || o.source || '—'}</b></span>
                                <span>طريقة الدفع: <b style={{ color: t.text }}>{o.payment_method || '—'}</b></span>
                                <span>الشحن: <b style={{ color: t.text }}>{o.shipping_method || '—'}</b></span>
                                <span>تتبع: <b style={{ color: t.text }}>{o.tracking_number || '—'}</b></span>
                                <span>تاريخ التسليم: <b style={{ color: t.text }}>{o.delivery_date || '—'}</b></span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                <thead>
                                  <tr style={{ background: t.head }}>
                                    <th style={itemHead(t)}>الصنف</th>
                                    <th style={{ ...itemHead(t), textAlign: 'center' }}>الكمية</th>
                                    <th style={{ ...itemHead(t), textAlign: 'left' }}>سعر الوحدة</th>
                                    <th style={{ ...itemHead(t), textAlign: 'left' }}>الخصم</th>
                                    <th style={{ ...itemHead(t), textAlign: 'left' }}>الإجمالي</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {oi.length === 0 && <tr><td colSpan={5} style={{ padding: 10, textAlign: 'center', color: '#D97706' }}>لا توجد بنود مسجلة لهذه الطلبية</td></tr>}
                                  {oi.map(it => (
                                    <tr key={it.id}>
                                      <td style={itemCell(t)}>{it.product_name || '—'}</td>
                                      <td style={{ ...itemCell(t), textAlign: 'center', fontFamily: MONO }}>{fmt2(it.quantity || 0)}</td>
                                      <td style={{ ...itemCell(t), textAlign: 'left', fontFamily: MONO }}>₪{fmt2(it.unit_price || 0)}</td>
                                      <td style={{ ...itemCell(t), textAlign: 'left', fontFamily: MONO }}>₪{fmt2(it.discount || 0)}</td>
                                      <td style={{ ...itemCell(t), textAlign: 'left', fontFamily: MONO, fontWeight: 700 }}>₪{fmt2(it.total || 0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ background: t.head }}>
                                    <td style={{ ...itemCell(t), fontWeight: 700 }}>مجموع البنود</td>
                                    <td style={{ ...itemCell(t), textAlign: 'center', fontFamily: MONO, fontWeight: 700 }}>
                                      {fmt2(oi.reduce((s, i) => s + (Number(i.quantity) || 0), 0))}
                                    </td>
                                    <td colSpan={2} style={{ ...itemCell(t), textAlign: 'left', color: t.muted }}>
                                      خصم الطلبية ₪{fmt2(o.discount || 0)} · شحن ₪{fmt2(o.shipping_cost || 0)}
                                    </td>
                                    <td style={{ ...itemCell(t), textAlign: 'left', fontFamily: MONO, fontWeight: 800 }}>
                                      ₪{fmt2(oi.reduce((s, i) => s + (Number(i.total) || 0), 0))}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                              <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                                <span style={{ color: t.muted }}>الإجمالي: <b style={{ color: t.text, fontFamily: MONO }}>₪{fmt2(o.total || 0)}</b></span>
                                <span style={{ color: t.muted }}>المدفوع: <b style={{ color: '#16A34A', fontFamily: MONO }}>₪{fmt2(paidOf(o))}</b></span>
                                <span style={{ color: t.muted }}>المتبقي: <b style={{ color: rem > 0 ? '#D97706' : t.faint, fontFamily: MONO }}>₪{fmt2(rem)}</b></span>
                                <button onClick={e => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}
                                  style={{ ...cmdBtn(t), color: ACCENT, borderColor: `${ACCENT}55` }}>
                                  فتح الطلبية <ChevronLeft size={11} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: t.head, fontWeight: 800 }}>
                    <td colSpan={4} style={{ ...cellSt(t), color: t.text }}>الإجمالي الظاهر ({sortedOrders.length} طلبية)</td>
                    <td style={{ ...cellSt(t), fontFamily: MONO, color: t.text }}>{fmt(gridTotals.lines)} بند</td>
                    <td style={{ ...cellSt(t), textAlign: 'left', fontFamily: MONO, color: t.text }}>₪{fmt2(gridTotals.total)}</td>
                    <td style={{ ...cellSt(t), textAlign: 'left', fontFamily: MONO, color: '#16A34A' }}>₪{fmt2(gridTotals.paid)}</td>
                    <td style={{ ...cellSt(t), textAlign: 'left', fontFamily: MONO, color: '#D97706' }}>₪{fmt2(gridTotals.remaining)}</td>
                    <td colSpan={3} style={cellSt(t)} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {sortedOrders.length > pageSize && (
              <div style={{ padding: 10, textAlign: 'center', borderTop: `1px solid ${t.border}` }}>
                <button onClick={() => setPageSize(p => p + 50)} style={cmdBtn(t)}>عرض المزيد ({sortedOrders.length - pageSize} متبقٍ)</button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}

type Tok = ReturnType<typeof getTheme>;

function cmdBtn(t: Tok): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 3,
    border: `1px solid ${t.border}`, background: 'transparent', color: t.muted,
    fontFamily: F, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
function inputSt(t: Tok): React.CSSProperties {
  return {
    padding: '5px 8px', borderRadius: 3, border: `1px solid ${t.border}`,
    background: t.bg, color: t.text, fontFamily: F, fontSize: 11, cursor: 'pointer',
  };
}
function cellSt(t: Tok): React.CSSProperties {
  return { padding: '8px 10px', borderBottom: `1px solid ${t.border}`, verticalAlign: 'middle' };
}
function itemHead(t: Tok): React.CSSProperties {
  return { padding: '6px 8px', fontSize: 10.5, fontWeight: 700, color: t.muted, textAlign: 'right', borderBottom: `1px solid ${t.border}` };
}
function itemCell(t: Tok): React.CSSProperties {
  return { padding: '6px 8px', color: t.text, borderBottom: `1px solid ${t.border}` };
}

function PanelTitle({ t, children }: { t: Tok; children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 800, color: t.text, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${t.border}` }}>{children}</div>;
}
function Empty({ t }: { t: Tok }) {
  return <div style={{ textAlign: 'center', color: t.faint, fontSize: 12, padding: 16 }}>لا توجد بيانات</div>;
}
function Recon({ t, label, value, tone }: { t: Tok; label: string; value: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'warn' ? '#D97706' : tone === 'ok' ? '#16A34A' : t.text;
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      <span style={{ color: t.faint }}>{label}:</span>
      <b style={{ color, fontFamily: MONO }}>{value}</b>
    </span>
  );
}
function Kpi({ t, label, value, change, sub, color }: { t: Tok; label: string; value: string; change?: number; sub?: string; color?: string }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 3, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: t.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: MONO, color: color || t.text }}>{value}</div>
      {typeof change === 'number' && (
        <div style={{ fontSize: 10, marginTop: 3, color: change >= 0 ? '#16A34A' : '#EF4444', fontWeight: 700 }}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% مقابل الفترة السابقة
        </div>
      )}
      {sub && <div style={{ fontSize: 10, color: t.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

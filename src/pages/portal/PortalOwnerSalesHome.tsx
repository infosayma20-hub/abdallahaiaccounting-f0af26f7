import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, TrendingDown, Store, UtensilsCrossed, UserCheck,
  FileText, ShoppingBag, Calendar, RefreshCw, ChevronLeft, BarChart3,
} from 'lucide-react';

interface Props {
  theme: 'light' | 'dark';
  onOpenSales?: () => void;
}

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

interface RangeData {
  total: number;
  posTotal: number;
  invTotal: number;
  orderCount: number;
  byBranch: { id: string; name: string; location: string; total: number; orderCount: number }[];
  byItem: { name: string; quantity: number; revenue: number }[];
  byCashier: { name: string; total: number; orderCount: number }[];
}

interface OwnerSales {
  current: RangeData;
  prevYear: RangeData;
  growthPct: number;
  range: { from: string; to: string };
  prevRange: { from: string; to: string };
}

function fmt(n: number) {
  return '₪' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

function localDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function presetRange(p: Preset): { from: string; to: string } | null {
  const now = new Date();
  const today = localDateStr(now);
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const ys = localDateStr(y);
    return { from: ys, to: ys };
  }
  if (p === 'week') {
    const s = new Date(now); s.setDate(s.getDate() - s.getDay());
    return { from: localDateStr(s), to: today };
  }
  if (p === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localDateStr(s), to: today };
  }
  return null;
}

function getTokens(dark: boolean) {
  return dark ? {
    pageBg: 'transparent',
    cardBg: '#161B22',
    cardBorder: 'rgba(230,237,243,0.08)',
    text: '#E6EDF3',
    textMuted: 'rgba(230,237,243,0.6)',
    textFaint: 'rgba(230,237,243,0.4)',
    heroGrad: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    accent: '#60A5FA',
    positive: '#22c55e',
    negative: '#ef4444',
    chipBg: 'rgba(230,237,243,0.06)',
    chipBorder: 'rgba(230,237,243,0.12)',
    sectionBg: '#0f1419',
  } : {
    pageBg: 'transparent',
    cardBg: '#FFFFFF',
    cardBorder: '#F1F5F9',
    text: '#0D1B2E',
    textMuted: '#64748B',
    textFaint: '#94A3B8',
    heroGrad: 'linear-gradient(135deg, #0D1B2E 0%, #1e3a5f 100%)',
    accent: '#0D1B2E',
    positive: '#16a34a',
    negative: '#dc2626',
    chipBg: '#F1F5F9',
    chipBorder: '#E2E8F0',
    sectionBg: '#F8FAFC',
  };
}

export default function PortalOwnerSalesHome({ theme }: Props) {
  const dark = theme === 'dark';
  const t = getTokens(dark);

  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState(localDateStr(new Date()));
  const [customTo, setCustomTo] = useState(localDateStr(new Date()));
  const [data, setData] = useState<OwnerSales | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'branches' | 'items' | 'cashiers' | 'yoy'>('overview');

  const range = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return presetRange(preset)!;
  }, [preset, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res, error } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'owner_sales', dateFrom: range.from, dateTo: range.to },
      });
      if (error) throw error;
      if (res?.success) setData(res as OwnerSales);
    } catch (e) {
      console.error('[PortalOwnerSalesHome]', e);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime: refresh when a new POS order or invoice lands
  useEffect(() => {
    const ch = supabase
      .channel('owner-sales-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' }, () => fetchData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData]);

  // Auto-refresh every 30s while tab visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const c = data?.current;
  const prev = data?.prevYear;
  const growth = data?.growthPct ?? 0;
  const isPositive = growth >= 0;

  const presetChips: { key: Preset; label: string }[] = [
    { key: 'today', label: 'اليوم' },
    { key: 'yesterday', label: 'أمس' },
    { key: 'week', label: 'هذا الأسبوع' },
    { key: 'month', label: 'هذا الشهر' },
    { key: 'custom', label: 'مخصص' },
  ];

  return (
    <div dir="rtl" style={{ fontFamily: 'Cairo', padding: '12px 16px 24px' }}>
      {/* ═══════ Period chips ═══════ */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
        {presetChips.map(p => {
          const active = preset === p.key;
          return (
            <button key={p.key} onClick={() => setPreset(p.key)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
              border: `1px solid ${active ? t.accent : t.chipBorder}`,
              background: active ? t.accent : t.chipBg,
              color: active ? '#fff' : t.textMuted,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Cairo',
            }}>{p.label}</button>
          );
        })}
        <button onClick={fetchData} style={{
          padding: '6px 12px', borderRadius: 20, border: `1px solid ${t.chipBorder}`,
          background: t.chipBg, color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: t.textMuted }}>من:</span>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ background: t.cardBg, border: `1px solid ${t.chipBorder}`, borderRadius: 8, padding: '4px 8px', fontSize: 11, color: t.text, fontFamily: 'Cairo' }} />
          <span style={{ fontSize: 11, color: t.textMuted }}>إلى:</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ background: t.cardBg, border: `1px solid ${t.chipBorder}`, borderRadius: 8, padding: '4px 8px', fontSize: 11, color: t.text, fontFamily: 'Cairo' }} />
        </div>
      )}

      {/* ═══════ Hero — Total + YoY ═══════ */}
      <div style={{
        borderRadius: 20, padding: '20px 18px', background: t.heroGrad, color: '#fff',
        position: 'relative', overflow: 'hidden', marginBottom: 12,
        border: dark ? '1px solid #2a2a4a' : 'none',
      }}>
        <div style={{ position: 'absolute', top: -40, left: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>إجمالي المبيعات</div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>
              {loading && !c ? '...' : fmt(c?.total || 0)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              {c?.orderCount || 0} عملية بيع
            </div>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
            background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: isPositive ? '#86efac' : '#fca5a5' }}>
              {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {Math.abs(growth).toFixed(1)}%
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>vs السنة الماضية</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'JetBrains Mono, monospace' }}>
              {fmt(prev?.total || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ POS vs Invoices split ═══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <SplitCard
          t={t} icon={<ShoppingBag size={16} />} label="مبيعات نقطة البيع"
          value={fmt(c?.posTotal || 0)} accent="#0EA5E9"
          sub={c ? `${Math.round((c.posTotal / (c.total || 1)) * 100)}% من الإجمالي` : ''}
        />
        <SplitCard
          t={t} icon={<FileText size={16} />} label="مبيعات الفواتير"
          value={fmt(c?.invTotal || 0)} accent="#8B5CF6"
          sub={c ? `${Math.round((c.invTotal / (c.total || 1)) * 100)}% من الإجمالي` : ''}
        />
      </div>

      {/* ═══════ Breakdown selector ═══════ */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 4 }}>
        {([
          { key: 'overview' as const, label: 'نظرة عامة', icon: BarChart3 },
          { key: 'branches' as const, label: 'حسب الفرع', icon: Store },
          { key: 'cashiers' as const, label: 'حسب الكاشير', icon: UserCheck },
          { key: 'items' as const, label: 'حسب الصنف', icon: UtensilsCrossed },
          { key: 'yoy' as const, label: 'مقارنة السنة الماضية', icon: TrendingUp },
        ]).map(v => {
          const active = activeView === v.key;
          const Icon = v.icon;
          return (
            <button key={v.key} onClick={() => setActiveView(v.key)} style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
              border: `1px solid ${active ? t.accent : t.chipBorder}`,
              background: active ? t.accent : t.chipBg,
              color: active ? '#fff' : t.textMuted,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Cairo',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Icon size={12} />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* ═══════ Section content ═══════ */}
      {loading && !c ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 13 }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div>جاري التحميل...</div>
        </div>
      ) : !c || c.total === 0 ? (
        <div style={{
          textAlign: 'center', padding: 36, color: t.textMuted, fontSize: 13,
          background: t.cardBg, borderRadius: 14, border: `1px solid ${t.cardBorder}`,
        }}>
          لا توجد مبيعات في هذه الفترة
        </div>
      ) : (
        <>
          {activeView === 'overview' && <OverviewView c={c} t={t} />}
          {activeView === 'branches' && <BranchesView branches={c.byBranch} t={t} />}
          {activeView === 'cashiers' && <CashiersView cashiers={c.byCashier} t={t} />}
          {activeView === 'items' && <ItemsView items={c.byItem} t={t} />}
          {activeView === 'yoy' && data && <YoYView current={c} prev={data.prevYear} growthPct={growth} t={t} />}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SplitCard({ t, icon, label, value, accent, sub }: {
  t: ReturnType<typeof getTokens>; icon: React.ReactNode; label: string; value: string; accent: string; sub: string;
}) {
  return (
    <div style={{
      background: t.cardBg, borderRadius: 14, padding: 14,
      border: `1px solid ${t.cardBorder}`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: accent }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textMuted, fontSize: 11, marginBottom: 6 }}>
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: t.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: t.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function OverviewView({ c, t }: { c: RangeData; t: ReturnType<typeof getTokens> }) {
  const topBranch = c.byBranch[0];
  const topItem = c.byItem[0];
  const topCashier = c.byCashier[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MiniHighlight t={t} icon={<Store size={14} />} title="أعلى فرع" name={topBranch?.name || '—'} value={fmt(topBranch?.total || 0)} sub={`${topBranch?.orderCount || 0} عملية`} />
      <MiniHighlight t={t} icon={<UserCheck size={14} />} title="أعلى كاشير" name={topCashier?.name || '—'} value={fmt(topCashier?.total || 0)} sub={`${topCashier?.orderCount || 0} عملية`} />
      <MiniHighlight t={t} icon={<UtensilsCrossed size={14} />} title="أعلى صنف" name={topItem?.name || '—'} value={fmt(topItem?.revenue || 0)} sub={`${topItem?.quantity || 0} قطعة`} />
    </div>
  );
}

function MiniHighlight({ t, icon, title, name, value, sub }: any) {
  return (
    <div style={{
      background: t.cardBg, borderRadius: 12, padding: '12px 14px',
      border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: t.sectionBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

function BarRow({ name, value, label, max, t, accent }: any) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{name}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: t.sectionBg, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function BranchesView({ branches, t }: { branches: RangeData['byBranch']; t: ReturnType<typeof getTokens> }) {
  const max = branches[0]?.total || 1;
  return (
    <div style={{ background: t.cardBg, borderRadius: 14, padding: '4px 14px', border: `1px solid ${t.cardBorder}` }}>
      {branches.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: t.textMuted }}>لا توجد بيانات</div>
      ) : branches.map(b => (
        <BarRow key={b.id} name={b.name} value={b.total} label={`${fmt(b.total)} • ${b.orderCount}`} max={max} t={t} accent="#0EA5E9" />
      ))}
    </div>
  );
}

function CashiersView({ cashiers, t }: { cashiers: RangeData['byCashier']; t: ReturnType<typeof getTokens> }) {
  const max = cashiers[0]?.total || 1;
  return (
    <div style={{ background: t.cardBg, borderRadius: 14, padding: '4px 14px', border: `1px solid ${t.cardBorder}` }}>
      {cashiers.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: t.textMuted }}>لا توجد بيانات كاشير</div>
      ) : cashiers.map((cs, i) => (
        <BarRow key={i} name={cs.name} value={cs.total} label={`${fmt(cs.total)} • ${cs.orderCount}`} max={max} t={t} accent="#16a34a" />
      ))}
    </div>
  );
}

function ItemsView({ items, t }: { items: RangeData['byItem']; t: ReturnType<typeof getTokens> }) {
  const [limit, setLimit] = useState(15);
  const max = items[0]?.revenue || 1;
  const visible = items.slice(0, limit);
  return (
    <div style={{ background: t.cardBg, borderRadius: 14, padding: '4px 14px', border: `1px solid ${t.cardBorder}` }}>
      {visible.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: t.textMuted }}>لا توجد أصناف</div>
      ) : (
        <>
          {visible.map((it, i) => (
            <BarRow key={i} name={it.name} value={it.revenue} label={`${fmt(it.revenue)} • ${it.quantity}×`} max={max} t={t} accent="#F59E0B" />
          ))}
          {items.length > limit && (
            <button onClick={() => setLimit(l => l + 25)} style={{
              background: 'none', border: 'none', color: t.accent, fontSize: 12, padding: '10px 0', width: '100%',
              cursor: 'pointer', fontFamily: 'Cairo', fontWeight: 600,
            }}>عرض المزيد ({items.length - limit})</button>
          )}
        </>
      )}
    </div>
  );
}

function YoYView({ current, prev, growthPct, t }: { current: RangeData; prev: RangeData; growthPct: number; t: ReturnType<typeof getTokens> }) {
  const rows = [
    { label: 'الإجمالي', cur: current.total, prv: prev.total },
    { label: 'مبيعات POS', cur: current.posTotal, prv: prev.posTotal },
    { label: 'مبيعات الفواتير', cur: current.invTotal, prv: prev.invTotal },
    { label: 'عدد العمليات', cur: current.orderCount, prv: prev.orderCount, asCount: true },
  ];
  return (
    <div style={{ background: t.cardBg, borderRadius: 14, padding: 14, border: `1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>مقارنة الفترة الحالية مع نفس الفترة السنة الماضية</div>
      {rows.map((r, i) => {
        const diff = r.cur - r.prv;
        const pct = r.prv > 0 ? (diff / r.prv) * 100 : (r.cur > 0 ? 100 : 0);
        const up = diff >= 0;
        const v = (n: number) => r.asCount ? n.toLocaleString('en-US') : fmt(n);
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'center',
            padding: '10px 0', borderBottom: i < rows.length - 1 ? `1px solid ${t.cardBorder}` : 'none',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{r.label}</div>
            <div style={{ fontSize: 12, color: t.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
              {v(r.prv)}
            </div>
            <ChevronLeft size={12} style={{ color: t.textFaint }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>
                {v(r.cur)}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: up ? t.positive : t.negative,
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {Math.abs(pct).toFixed(1)}%
              </div>
            </div>
          </div>
        );
      })}

      {/* Branch YoY */}
      {current.byBranch.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>المبيعات حسب الفرع — مقارنة</div>
          {current.byBranch.slice(0, 6).map(b => {
            const pb = prev.byBranch.find(p => p.id === b.id || p.name === b.name);
            const pv = pb?.total || 0;
            const diff = b.total - pv;
            const pct = pv > 0 ? (diff / pv) * 100 : (b.total > 0 ? 100 : 0);
            const up = diff >= 0;
            return (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px dashed ${t.cardBorder}`, fontSize: 11 }}>
                <span style={{ color: t.text, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                <span style={{ color: t.textMuted, fontFamily: 'JetBrains Mono, monospace', marginLeft: 8 }}>{fmt(pv)}</span>
                <ChevronLeft size={10} style={{ color: t.textFaint, margin: '0 4px' }} />
                <span style={{ color: t.text, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, marginRight: 6 }}>{fmt(b.total)}</span>
                <span style={{ color: up ? t.positive : t.negative, fontWeight: 700, minWidth: 50, textAlign: 'left' }}>
                  {up ? '+' : ''}{pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
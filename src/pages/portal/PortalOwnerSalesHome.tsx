import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePortalProfile } from '@/hooks/usePortalProfile';
import {
  TrendingUp, TrendingDown, Store, UtensilsCrossed, UserCheck,
  FileText, ShoppingBag, Calendar, RefreshCw, ChevronLeft, BarChart3,
  CreditCard, Banknote, XCircle, Coffee, Users, X, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Props {
  theme: 'light' | 'dark';
  onOpenSales?: () => void;
  initialPreset?: Preset;
}

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

interface PaymentAgg {
  gross: number;
  net: number;
  cash: number;
  card: number;
  employeeAccount: number;
  credit?: number;
  employeeMeals: number;
  cancelledCount: number;
  cancelledTotal: number;
  cashByCurrency?: Record<string, number>;
}

interface RangeData {
  total: number;
  posTotal: number;
  invTotal: number;
  orderCount: number;
  byBranch: ({ id: string; name: string; location: string; total: number; orderCount: number } & Partial<PaymentAgg>)[];
  byItem: { name: string; quantity: number; revenue: number }[];
  byCashier: ({ name: string; total: number; orderCount: number; branchId?: string; branchName?: string } & Partial<PaymentAgg>)[];
  summary?: PaymentAgg;
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

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayNameOf(iso: string) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return AR_DAYS[new Date(y, m - 1, d).getDay()] || '';
}
function dayIdxOf(iso: string) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return -1;
  return new Date(y, m - 1, d).getDay();
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
    // الأسبوع يبدأ يوم السبت (getDay()===6) وينتهي الجمعة
    const s = new Date(now); s.setDate(s.getDate() - ((s.getDay() + 1) % 7));
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

export default function PortalOwnerSalesHome({ theme, initialPreset }: Props) {
  const dark = theme === 'dark';
  const t = getTokens(dark);

  const [preset, setPreset] = useState<Preset>(initialPreset || 'today');
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

  // ── Hijri (religious occasion) comparison ──────────────────────────────
  const occasion = useMemo(() => occasionForDate(parseISO(range.from)), [range.from]);
  const hijriPrevRange = useMemo(() => {
    const from = sameHijriDayLastYear(range.from);
    if (!from) return null;
    const days = Math.round((parseISO(range.to).getTime() - parseISO(range.from).getTime()) / 86400000);
    const to = toISO(new Date(parseISO(from).getTime() + days * 86400000));
    return { from, to };
  }, [range.from, range.to]);
  const [hijriMode, setHijriMode] = useState(false);
  const [hijriPrev, setHijriPrev] = useState<RangeData | null>(null);
  const [hijriLoading, setHijriLoading] = useState(false);

  useEffect(() => { setHijriPrev(null); }, [range.from, range.to]);

  useEffect(() => {
    if (!hijriMode || !hijriPrevRange || hijriPrev) return;
    let cancelled = false;
    (async () => {
      try {
        setHijriLoading(true);
        const { data: res, error } = await supabase.functions.invoke('malaki-data', {
          body: { action: 'owner_sales', dateFrom: hijriPrevRange.from, dateTo: hijriPrevRange.to },
        });
        if (error) throw error;
        if (!cancelled && res?.success) setHijriPrev(res.current as RangeData);
      } catch (e) {
        console.error('[PortalOwnerSalesHome:hijri]', e);
      } finally {
        if (!cancelled) setHijriLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hijriMode, hijriPrevRange, hijriPrev]);


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
  const { terms } = usePortalProfile();
  // Meal-subsidy wording only makes sense for food tenants (or when the data
  // actually contains a subsidy amount — keeps legacy tenants untouched).
  const showMeals = terms.showEmployeeMeals || (c?.summary?.employeeMeals || 0) > 0;

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
              {loading && !c ? '...' : fmt(c?.summary?.net ?? c?.total ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              {c?.orderCount || 0} عملية بيع · نقدي + فيزا + آجل + حساب موظف{showMeals ? ' − دعم الوجبات' : ''}
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
        {c?.summary && (
          <div style={{ position: 'relative', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Row 1 — Gross & Cancelled reference numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <HeroChip label="الإجمالي قبل الدعم" value={fmt(c.total || 0)} icon={<TrendingUp size={12} />} color="#86efac" size="lg" />
              <HeroChip label="ملغي" value={`${c.summary.cancelledCount} • ${fmt(c.summary.cancelledTotal)}`} icon={<XCircle size={12} />} color="#fca5a5" size="lg" />
            </div>
            {/* Row 2 — Payment methods breakdown */}
            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: 0.3 }}>طرق الدفع</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <HeroChip label="نقدي" value={fmt(c.summary.cash)} icon={<Banknote size={11} />} color="#fcd34d" />
                <HeroChip label="فيزا" value={fmt(c.summary.card)} icon={<CreditCard size={11} />} color="#93c5fd" />
                <HeroChip label="آجل" value={fmt(c.summary.credit || 0)} icon={<FileText size={11} />} color="#c4b5fd" />
                <HeroChip label="حساب موظف" value={fmt(c.summary.employeeAccount || 0)} icon={<Users size={11} />} color="#fdba74" />
              </div>
              {showMeals && (c.summary.employeeMeals || 0) > 0 && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Coffee size={9} />
                  <span>
                    دعم وجبات الموظفين المخصوم من الصافي: <b style={{ color: '#fff' }}>{fmt(c.summary.employeeMeals || 0)}</b>
                    <span style={{ opacity: 0.7 }}> · قيمة "حساب موظف" أعلاه = القسط المستحق على الموظف بعد الدعم</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
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
          { key: 'cashiers' as const, label: terms.byCashier, icon: UserCheck },
          { key: 'items' as const, label: terms.byItem, icon: UtensilsCrossed },
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
          {activeView === 'branches' && <BranchesView branches={c.byBranch} t={t} range={range} />}
          {activeView === 'cashiers' && <CashiersView cashiers={c.byCashier} t={t} />}
          {activeView === 'items' && <ItemsView items={c.byItem} t={t} />}
          {activeView === 'yoy' && data && (
            <YoYView
              current={c}
              prev={hijriMode && hijriPrev ? hijriPrev : data.prevYear}
              growthPct={hijriMode && hijriPrev
                ? ((c.total - hijriPrev.total) / (hijriPrev.total || 1)) * 100
                : growth}
              t={t}
              range={data.range || range}
              prevRange={hijriMode && hijriPrevRange ? hijriPrevRange : data.prevRange}
              occasion={occasion}
              hijriMode={hijriMode}
              hijriLoading={hijriLoading}
              hijriPrevRange={hijriPrevRange}
              onToggleHijri={() => setHijriMode(v => !v)}
            />

          )}
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

function HeroChip({ label, value, icon, color, size = 'sm' }: { label: string; value: string; icon: React.ReactNode; color: string; size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg';
  return (
    <div style={{
      background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: isLg ? '10px 12px' : '8px 10px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: isLg ? 11 : 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: isLg ? 16 : 12, fontWeight: 800, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}

function OverviewView({ c, t }: { c: RangeData; t: ReturnType<typeof getTokens> }) {
  const topBranch = c.byBranch[0];
  const topItem = c.byItem[0];
  const topCashier = c.byCashier[0];
  const { terms } = usePortalProfile();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MiniHighlight t={t} icon={<Store size={14} />} title="أعلى فرع" name={topBranch?.name || '—'} value={fmt(topBranch?.total || 0)} sub={`${topBranch?.orderCount || 0} عملية`} />
      <MiniHighlight t={t} icon={<UserCheck size={14} />} title={terms.topCashier} name={topCashier?.name || '—'} value={fmt(topCashier?.total || 0)} sub={`${topCashier?.orderCount || 0} عملية`} />
      <MiniHighlight t={t} icon={<UtensilsCrossed size={14} />} title={terms.topItem} name={topItem?.name || '—'} value={fmt(topItem?.revenue || 0)} sub={`${topItem?.quantity || 0} ${terms.unit}`} />
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

function DetailRow({ row, max, t, accent }: {
  row: { name: string; total: number; orderCount: number } & Partial<PaymentAgg>;
  max: number; t: ReturnType<typeof getTokens>; accent: string;
}) {
  const pct = max > 0 ? (row.total / max) * 100 : 0;
  const showPayments = row.card !== undefined || row.cash !== undefined ||
    row.employeeMeals !== undefined || row.cancelledCount !== undefined;
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{row.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(row.net ?? row.total)}</div>
          <div style={{ fontSize: 9, color: t.textFaint }}>صافي • إجمالي {fmt(row.total)}</div>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: t.sectionBg, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      {showPayments && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10 }}>
          <Pill t={t} color="#0EA5E9" icon={<CreditCard size={9} />} label="فيزا" value={fmt(row.card || 0)} />
          <Pill t={t} color="#F59E0B" icon={<Banknote size={9} />} label="نقدي" value={fmt(row.cash || 0)} />
          {(row.credit || 0) > 0 && (
            <Pill t={t} color="#8B5CF6" icon={<FileText size={9} />} label="آجل" value={fmt(row.credit || 0)} />
          )}
          {row.cashByCurrency && Object.entries(row.cashByCurrency)
            .filter(([, v]) => (v as number) > 0)
            .map(([cur, v]) => (
              <Pill
                key={cur}
                t={t}
                color="#10B981"
                icon={<Banknote size={9} />}
                label={cur}
                value={Math.round(v as number).toLocaleString('en-US')}
              />
            ))}
          {(row.employeeMeals || 0) > 0 && (
            <Pill t={t} color="#8B5CF6" icon={<Coffee size={9} />} label="وجبات موظفين" value={fmt(row.employeeMeals || 0)} />
          )}
          {(row.cancelledCount || 0) > 0 && (
            <Pill t={t} color="#ef4444" icon={<XCircle size={9} />} label="ملغي" value={`${row.cancelledCount} • ${fmt(row.cancelledTotal || 0)}`} />
          )}
          <Pill t={t} color={t.textMuted} icon={<ShoppingBag size={9} />} label="عمليات" value={String(row.orderCount)} />
        </div>
      )}
    </div>
  );
}

function Pill({ t, color, icon, label, value }: any) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: t.sectionBg, border: `1px solid ${t.cardBorder}`,
      borderRadius: 6, padding: '2px 6px',
    }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ color: t.textMuted }}>{label}:</span>
      <span style={{ color: t.text, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}

function BranchesView({ branches, t, range }: {
  branches: RangeData['byBranch'];
  t: ReturnType<typeof getTokens>;
  range: { from: string; to: string };
}) {
  const max = branches[0]?.total || 1;
  const [openBranch, setOpenBranch] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <div style={{ background: t.cardBg, borderRadius: 14, padding: '4px 14px', border: `1px solid ${t.cardBorder}` }}>
        {branches.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: t.textMuted }}>لا توجد بيانات</div>
        ) : branches.map(b => (
          <div key={b.id} onClick={() => setOpenBranch({ id: b.id, name: b.name })} style={{ cursor: 'pointer' }}>
            <DetailRow row={b as any} max={max} t={t} accent="#0EA5E9" />
          </div>
        ))}
      </div>
      {openBranch && (
        <BranchDrillDownModal
          branchId={openBranch.id}
          branchName={openBranch.name}
          range={range}
          t={t}
          onClose={() => setOpenBranch(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════
// Branch drill-down: hourly breakdown + invoice details
// ═══════════════════════════════════════════════
interface DrillOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  state: string;
  customer_name: string | null;
  notes: string | null;
  order_type: string | null;
  cancel_reason: string | null;
  meal_subsidy: number;
  delivery_fee: number;
  total_includes_delivery_fee: boolean;
  net_total: number; // total minus delivery-fee pass-through
  payments: { method: string; amount: number; currency: string; notes?: string | null }[];
  lines: { product_name: string; qty: number; unit_price: number; total: number; notes: string | null }[];
}

function BranchDrillDownModal({ branchId, branchName, range, t, onClose }: {
  branchId: string;
  branchName: string;
  range: { from: string; to: string };
  t: ReturnType<typeof getTokens>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<DrillOrder[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCancelled, setShowCancelled] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        // Guard: virtual "invoices" and "no-branch" buckets from the parent
        // aggregation don't map to real branch_id values.
        if (branchId === '__invoices__' || branchId === '__no_branch__') {
          if (alive) { setOrders([]); setLoading(false); }
          return;
        }

        // Portal users don't have direct RLS access to pos_orders — go through
        // the edge function which runs under service role scoped to the
        // resolved data owner (linkedUserId).
        const { data: res, error } = await supabase.functions.invoke('malaki-data', {
          body: { action: 'branch_drill', branchId, dateFrom: range.from, dateTo: range.to },
        });
        if (error) throw error;
        const os = (res?.orders || []) as any[];
        const pays = (res?.payments || []) as any[];
        const lines = (res?.lines || []) as any[];
        if (os.length === 0) { if (alive) { setOrders([]); setLoading(false); } return; }
        const payByOrder: Record<string, DrillOrder['payments']> = {};
        (pays || []).forEach((p: any) => {
          (payByOrder[p.order_id] ||= []).push({ method: p.payment_method, amount: Number(p.amount) || 0, currency: p.currency, notes: p.notes });
        });
        const linesByOrder: Record<string, DrillOrder['lines']> = {};
        (lines || []).forEach((l: any) => {
          (linesByOrder[l.order_id] ||= []).push({ product_name: l.product_name, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0, total: Number(l.total) || 0, notes: l.notes });
        });
        const merged: DrillOrder[] = (os || []).map((o: any) => {
          const total = Number(o.total) || 0;
          const deliveryFee = Number(o.delivery_fee) || 0;
          const includesDelivery = !!o.total_includes_delivery_fee;
          // Strip delivery fee pass-through so we match parent branch totals.
          const netTotal = includesDelivery ? Math.max(0, total - deliveryFee) : total;
          return {
            ...o,
            total,
            subtotal: Number(o.subtotal) || 0,
            discount_amount: Number(o.discount_amount) || 0,
            meal_subsidy: Number(o.meal_subsidy_amount) || 0,
            delivery_fee: deliveryFee,
            total_includes_delivery_fee: includesDelivery,
            net_total: netTotal,
            payments: payByOrder[o.id] || [],
            lines: linesByOrder[o.id] || [],
          };
        });
        if (alive) setOrders(merged);
      } catch (e) {
        console.error('[BranchDrillDown]', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [branchId, range.from, range.to]);

  const filtered = useMemo(
    () => orders
      .filter(o => showCancelled ? true : o.state !== 'cancelled' && o.state !== 'void')
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [orders, showCancelled]
  );

  const hourly = useMemo(() => {
    const map: Record<string, { hour: string; count: number; total: number; cancelled: number }> = {};
    for (const o of orders) {
      const d = new Date(o.created_at);
      const h = String(d.getHours()).padStart(2, '0') + ':00';
      if (!map[h]) map[h] = { hour: h, count: 0, total: 0, cancelled: 0 };
      const cancelled = o.state === 'cancelled' || o.state === 'void';
      if (cancelled) map[h].cancelled += o.net_total;
      else { map[h].count += 1; map[h].total += o.net_total; }
    }
    return Object.values(map).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [orders]);

  const maxHour = Math.max(1, ...hourly.map(h => h.total));
  // Gross (paid orders, delivery-fee stripped) — matches parent branch "total"
  const totalGross = orders
    .filter(o => o.state !== 'cancelled' && o.state !== 'void')
    .reduce((s, o) => s + o.net_total, 0);
  // Meal subsidy — subtracted by parent to reach "net"
  const totalSubsidy = orders
    .filter(o => o.state !== 'cancelled' && o.state !== 'void')
    .reduce((s, o) => s + o.meal_subsidy, 0);
  const totalNet = totalGross - totalSubsidy;
  const totalCancelled = orders
    .filter(o => o.state === 'cancelled' || o.state === 'void')
    .reduce((s, o) => s + o.net_total, 0);
  const paidCount = orders.filter(o => o.state !== 'cancelled' && o.state !== 'void').length;

  const methodLabel = (m: string) => ({
    cash: 'نقدي', card: 'فيزا', credit: 'آجل', employee_meal: 'وجبة موظف',
    employee_account: 'حساب موظف', cheque: 'شيك', bank_transfer: 'حوالة',
  } as Record<string, string>)[m] || m;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} dir="rtl" style={{
        width: '100%', maxWidth: 900, maxHeight: '92vh', background: t.cardBg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', border: `1px solid ${t.cardBorder}`,
        fontFamily: 'Cairo',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px', background: t.heroGrad, color: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>تفاصيل مبيعات الفرع</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{branchName}</div>
            <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{range.from} → {range.to}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
            width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={16} /></button>
        </div>

        {/* Summary — matches parent aggregation (business_date, delivery-fee stripped, subsidy deducted) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 12, background: t.sectionBg }}>
          <SummaryTile t={t} label={`الفواتير (${paidCount})`} value={String(filtered.length)} color={t.accent} />
          <SummaryTile t={t} label="الإجمالي" value={fmt(totalGross)} color={t.text as string} />
          <SummaryTile t={t} label="صافي بعد الدعم" value={fmt(totalNet)} color="#16a34a" />
          <SummaryTile t={t} label="الملغي" value={fmt(totalCancelled)} color="#ef4444" />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 14px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>جارٍ التحميل...</div>
          ) : (
            <>
              {/* Hourly */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 700, color: t.text }}>
                  <Clock size={14} /> المبيعات حسب الساعة
                </div>
                <div style={{ background: t.sectionBg, borderRadius: 10, padding: '4px 12px', border: `1px solid ${t.cardBorder}` }}>
                  {hourly.length === 0 ? (
                    <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: t.textMuted }}>لا يوجد بيانات</div>
                  ) : hourly.map(h => {
                    const pct = (h.total / maxHour) * 100;
                    return (
                      <div key={h.hour} style={{ padding: '6px 0', borderBottom: `1px solid ${t.cardBorder}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: t.text, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{h.hour}</span>
                          <span style={{ color: t.textMuted }}>
                            {h.count} فاتورة • <span style={{ color: t.text, fontWeight: 700 }}>{fmt(h.total)}</span>
                            {h.cancelled > 0 && <span style={{ color: '#ef4444', marginRight: 6 }}> · ملغي {fmt(h.cancelled)}</span>}
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: t.cardBg, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#0EA5E9', borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Invoices */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: t.text }}>
                  <FileText size={14} /> الفواتير ({filtered.length})
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: t.textMuted, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
                  إظهار الملغي
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map(o => {
                  const isCancelled = o.state === 'cancelled' || o.state === 'void';
                  const isOpen = expanded[o.id];
                  const d = new Date(o.created_at);
                  const time = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: false });
                  return (
                    <div key={o.id} style={{
                      background: t.sectionBg, borderRadius: 10,
                      border: `1px solid ${isCancelled ? 'rgba(239,68,68,0.4)' : t.cardBorder}`,
                      overflow: 'hidden',
                    }}>
                      <div
                        onClick={() => setExpanded(e => ({ ...e, [o.id]: !e[o.id] }))}
                        style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 8 }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: t.text }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{o.order_number || o.id.slice(0, 8)}</span>
                            <span style={{ color: t.textFaint, fontSize: 10 }}>{time}</span>
                            {isCancelled && <span style={{ fontSize: 9, background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>ملغي</span>}
                          </div>
                          {o.customer_name && (
                            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: isCancelled ? '#ef4444' : t.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(o.total)}</div>
                          <div style={{ fontSize: 9, color: t.textFaint }}>{o.payments.map(p => methodLabel(p.method)).join('، ') || '—'}</div>
                        </div>
                        {isOpen ? <ChevronUp size={14} color={t.textMuted} /> : <ChevronDown size={14} color={t.textMuted} />}
                      </div>
                      {isOpen && (
                        <div style={{ padding: '4px 12px 12px', borderTop: `1px dashed ${t.cardBorder}` }}>
                          {o.lines.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>الأصناف:</div>
                              {o.lines.map((l, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: t.text }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {l.product_name} <span style={{ color: t.textFaint }}>× {l.qty}</span>
                                    {l.notes && <div style={{ fontSize: 9, color: '#F59E0B', marginTop: 1 }}>📝 {l.notes}</div>}
                                  </span>
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: t.textMuted, marginRight: 6 }}>{fmt(l.total)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 10 }}>
                            <MiniStat t={t} label="مجموع فرعي" value={fmt(o.subtotal)} />
                            <MiniStat t={t} label="خصم" value={fmt(o.discount_amount)} />
                            <MiniStat t={t} label="الإجمالي" value={fmt(o.total)} />
                          </div>
                          {o.payments.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>الدفعات:</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {o.payments.map((p, i) => (
                                  <span key={i} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 6,
                                    background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text,
                                  }}>
                                    {methodLabel(p.method)}: <b style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(p.amount)}</b> {p.currency !== 'ILS' && p.currency}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {o.notes && (
                            <div style={{ marginTop: 8, padding: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 11, color: t.text }}>
                              <div style={{ fontSize: 9, color: '#F59E0B', fontWeight: 700, marginBottom: 2 }}>📌 ملاحظة الفاتورة</div>
                              {o.notes}
                            </div>
                          )}
                          {isCancelled && o.cancel_reason && (
                            <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 11, color: '#ef4444' }}>
                              سبب الإلغاء: {o.cancel_reason}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: t.textMuted }}>لا توجد فواتير</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ t, label, value, color }: { t: ReturnType<typeof getTokens>; label: string; value: string; color: string }) {
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}

function MiniStat({ t, label, value }: { t: ReturnType<typeof getTokens>; label: string; value: string }) {
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 6, padding: '4px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: t.textFaint }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}

function CashiersView({ cashiers, t }: { cashiers: RangeData['byCashier']; t: ReturnType<typeof getTokens> }) {
  const { terms } = usePortalProfile();
  if (cashiers.length === 0) {
    return (
      <div style={{ background: t.cardBg, borderRadius: 14, padding: 16, textAlign: 'center', fontSize: 12, color: t.textMuted, border: `1px solid ${t.cardBorder}` }}>
        {terms.noCashierData}
      </div>
    );
  }
  // Group by branch
  const groups: Record<string, { branchName: string; total: number; rows: typeof cashiers }> = {};
  for (const cs of cashiers) {
    const key = cs.branchId || '__no_branch__';
    const name = cs.branchName || 'بدون فرع';
    if (!groups[key]) groups[key] = { branchName: name, total: 0, rows: [] };
    groups[key].total += cs.total;
    groups[key].rows.push(cs);
  }
  const ordered = Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ordered.map(([key, g]) => {
        const sortedRows = [...g.rows].sort((a, b) => b.total - a.total);
        const max = sortedRows[0]?.total || 1;
        return (
          <div key={key} style={{ background: t.cardBg, borderRadius: 14, border: `1px solid ${t.cardBorder}`, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'rgba(14,165,233,0.08)',
              borderBottom: `1px solid ${t.cardBorder}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{g.branchName}</div>
              <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>{fmt(g.total)} • {sortedRows.length} {terms.cashiers}</div>
            </div>
            <div style={{ padding: '4px 14px' }}>
              {sortedRows.map((cs, i) => (
                <DetailRow key={i} row={cs as any} max={max} t={t} accent="#16a34a" />
              ))}
            </div>
          </div>
        );
      })}
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

function YoYView({ current, prev, growthPct, t, range, prevRange }: {
  current: RangeData; prev: RangeData; growthPct: number; t: ReturnType<typeof getTokens>;
  range?: { from: string; to: string }; prevRange?: { from: string; to: string };
}) {
  const rows = [
    { label: 'الإجمالي', cur: current.total, prv: prev.total },
    { label: 'مبيعات POS', cur: current.posTotal, prv: prev.posTotal },
    { label: 'مبيعات الفواتير', cur: current.invTotal, prv: prev.invTotal },
    { label: 'عدد العمليات', cur: current.orderCount, prv: prev.orderCount, asCount: true },
  ];
  const singleDay = !!range && range.from === range.to;
  const curDay = range ? dayNameOf(range.from) : '';
  const prvDay = prevRange ? dayNameOf(prevRange.from) : '';
  const mismatch = singleDay && !!prevRange && dayIdxOf(range!.from) !== dayIdxOf(prevRange.from);
  return (
    <div style={{ background: t.cardBg, borderRadius: 14, padding: 14, border: `1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>مقارنة الفترة الحالية مع نفس الفترة السنة الماضية</div>
      {range && prevRange && (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center',
            background: t.sectionBg, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '8px 10px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: t.textFaint }}>السنة الماضية</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                {prvDay ? `${prvDay} · ` : ''}{prevRange.from}{prevRange.to !== prevRange.from ? ` → ${dayNameOf(prevRange.to)} ${prevRange.to}` : ''}
              </div>
            </div>
            <ChevronLeft size={12} style={{ color: t.textFaint }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: t.textFaint }}>الفترة الحالية</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                {curDay ? `${curDay} · ` : ''}{range.from}{range.to !== range.from ? ` → ${dayNameOf(range.to)} ${range.to}` : ''}
              </div>
            </div>
          </div>
          {mismatch && (
            <div style={{ fontSize: 10, color: t.negative, marginTop: 6, fontWeight: 600 }}>
              تنبيه: المقارنة بين {curDay} و{prvDay} — الأيام مختلفة وقد لا تكون المقارنة عادلة.
            </div>
          )}
        </div>
      )}
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
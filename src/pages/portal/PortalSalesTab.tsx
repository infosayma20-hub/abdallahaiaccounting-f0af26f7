import { useState } from 'react';
import { type SalesData, type BranchSales } from '@/hooks/usePortalData';
import { type BusinessDay } from '@/lib/portal-business-day';
import { Loader2, TrendingUp, ShoppingBag, Receipt, Trophy, ChevronDown, Calendar } from 'lucide-react';

const GOLD = '#D4A017';

function fmt(n: number) {
  return '₪' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#111111', text: 'white', textMuted: 'rgba(255,255,255,0.5)', textFaint: 'rgba(255,255,255,0.4)', border: 'rgba(255,255,255,0.06)', chipBg: 'rgba(255,255,255,0.06)', branchGrad: 'linear-gradient(135deg, #1A0A00, #2D1200)' }
    : { card: '#FFFFFF', text: '#1A1A1A', textMuted: 'rgba(0,0,0,0.55)', textFaint: 'rgba(0,0,0,0.4)', border: 'rgba(0,0,0,0.08)', chipBg: 'rgba(0,0,0,0.04)', branchGrad: 'linear-gradient(135deg, #1B3A5C, #0D1B2A)' };
}

function KPICard({ icon, label, value, sub, accent, t }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean;
  t: ReturnType<typeof getThemeColors>;
}) {
  return (
    <div style={{
      background: t.card, borderRadius: 12, padding: '14px 14px',
      border: `1px solid ${accent ? 'rgba(212,160,23,0.3)' : t.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, color: t.textMuted }}>{label}</span>
      </div>
      <div style={{
        fontSize: accent ? 22 : 18, fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        color: accent ? GOLD : t.text,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: t.textFaint, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BranchCard({ branch, rank, t }: { branch: BranchSales; rank: number; t: ReturnType<typeof getThemeColors> }) {
  const [showAllMeals, setShowAllMeals] = useState(false);
  const mealsToShow = showAllMeals ? branch.topMeals : branch.topMeals.slice(0, 5);
  const maxMealQty = branch.topMeals[0]?.quantity || 1;

  const hours = [...Array(19)].map((_, i) => ((9 + i) % 24).toString());
  const maxH = Math.max(...hours.map(h => branch.hourlySales[h] || 0), 1);
  const hourLabel: Record<string, string> = {
    '9': '9ص', '12': '12م', '15': '3م', '18': '6م', '21': '9م', '0': '12ص', '3': '3ص'
  };
  const rankBadge = ['', '🥇', '🥈', '🥉'];

  const minutesSinceLast = branch.lastOrderAt
    ? Math.round((Date.now() - new Date(branch.lastOrderAt).getTime()) / 60000)
    : null;

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.border}`, background: t.card }}>
      <div style={{
        background: t.branchGrad,
        borderTop: `3px solid ${GOLD}`, padding: '12px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏪</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{branch.name}</div>
            {branch.location && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{branch.location}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: GOLD }}>
            {fmt(branch.totalSales)}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{branch.orderCount} طلب</div>
        </div>
      </div>

      {/* Hourly chart */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 6 }}>توزيع المبيعات بالساعة</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
          {hours.map(h => {
            const val = branch.hourlySales[h] || 0;
            const pct = (val / maxH) * 100;
            return (
              <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <div style={{
                  width: '100%', height: `${Math.max(pct, 2)}%`, minHeight: 2,
                  background: val > 0 ? GOLD : t.border,
                  borderRadius: 1, opacity: val > 0 ? 0.8 : 0.3,
                }} />
                {hourLabel[h] && <span style={{ fontSize: 7, color: t.textFaint }}>{hourLabel[h]}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top meals */}
      {mealsToShow.length > 0 && (
        <div style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 6 }}>🍽️ الأصناف الأكثر مبيعاً</div>
          {mealsToShow.map((meal, i) => (
            <div key={meal.name} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                background: i === 0 ? `linear-gradient(135deg, ${GOLD}, #8B5E00)`
                  : i === 1 ? 'linear-gradient(135deg, #9CA3AF, #D1D5DB)'
                  : i === 2 ? 'linear-gradient(135deg, #B45309, #D97706)'
                  : t.chipBg,
                color: i < 3 ? '#000' : t.textMuted,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text }}>{meal.name}</div>
                <div style={{ height: 3, borderRadius: 2, background: t.border, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${(meal.quantity / maxMealQty) * 100}%`,
                    background: GOLD, opacity: 1 - i * 0.15,
                  }} />
                </div>
              </div>
              <div style={{ textAlign: 'left', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: t.textMuted }}>
                  {meal.quantity}×
                </div>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: GOLD }}>
                  {fmt(meal.revenue)}
                </div>
              </div>
            </div>
          ))}
          {branch.topMeals.length > 5 && (
            <button onClick={() => setShowAllMeals(!showAllMeals)} style={{
              background: 'none', border: 'none', color: GOLD,
              fontSize: 11, cursor: 'pointer', padding: '6px 0',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'Tajawal, sans-serif',
            }}>
              <ChevronDown size={12} style={{ transform: showAllMeals ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
              {showAllMeals ? 'عرض أقل' : 'عرض الكل'}
            </button>
          )}
        </div>
      )}

      <div style={{
        background: t.card, padding: '8px 14px',
        borderTop: `1px solid ${t.border}`,
        fontSize: 10, color: t.textFaint,
      }}>
        {minutesSinceLast !== null ? `آخر طلب: منذ ${minutesSinceLast} دقيقة` : 'لا توجد طلبات'}
      </div>
    </div>
  );
}

interface Props {
  data: SalesData | null;
  loading: boolean;
  businessDay: BusinessDay;
  needsSetup?: boolean;
  onRefresh: (date?: string) => void;
  theme?: 'light' | 'dark';
}

export default function PortalSalesTab({ data, loading, businessDay, needsSetup, onRefresh, theme = 'light' }: Props) {
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const t = getThemeColors(theme);

  if (needsSetup) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 16, marginBottom: 8 }}>يجب ربط البوابة بحساب QOYOD أولاً</div>
        <div style={{ fontSize: 13 }}>اذهب إلى الإعدادات لربط الحساب</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: GOLD, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: t.textMuted, fontSize: 13 }}>جاري تحميل البيانات...</div>
      </div>
    );
  }

  const sales = data || { totalSales: 0, orderCount: 0, avgOrderValue: 0, topBranch: null, branches: [] };

  const handleDateChip = (key: string | null) => {
    setDateFilter(key);
    setDateFrom('');
    setDateTo('');
    if (key === null) {
      onRefresh();
    } else if (key === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      onRefresh(d.toISOString().split('T')[0]);
    } else {
      onRefresh();
    }
  };

  const handleDateRange = () => {
    if (dateFrom && dateTo) {
      setDateFilter('range');
      onRefresh(dateFrom);
    }
  };

  return (
    <div>
      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8, marginBottom: 12,
      }}>
        <KPICard icon={<TrendingUp size={14} color={GOLD} />} label="إجمالي المبيعات" value={fmt(sales.totalSales)} sub="جميع الأفرع" accent t={t} />
        <KPICard icon={<ShoppingBag size={14} color={t.textMuted} />} label="عدد الطلبات" value={`${sales.orderCount}`} t={t} />
        <KPICard icon={<Receipt size={14} color={t.textMuted} />} label="متوسط الطلب" value={fmt(sales.avgOrderValue)} t={t} />
        <KPICard icon={<Trophy size={14} color={GOLD} />} label="أعلى فرع" value={sales.topBranch?.name || '—'} sub={sales.topBranch ? fmt(sales.topBranch.sales) : ''} t={t} />
      </div>

      {/* Date filter buttons */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4,
        flexWrap: 'wrap',
      }}>
        {[
          { key: null, label: '● اليوم' },
          { key: 'yesterday', label: 'أمس' },
        ].map(chip => (
          <button
            key={chip.key || 'today'}
            onClick={() => handleDateChip(chip.key)}
            style={{
              padding: '8px 16px', borderRadius: 20,
              background: dateFilter === chip.key || (dateFilter === null && chip.key === null)
                ? `linear-gradient(135deg, ${GOLD}, #8B5E00)` : t.chipBg,
              border: 'none',
              color: dateFilter === chip.key || (dateFilter === null && chip.key === null) ? 'white' : t.textMuted,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Tajawal, sans-serif',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Date range picker */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={14} color={t.textMuted} />
          <span style={{ fontSize: 11, color: t.textMuted }}>من:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{
              background: t.card, border: `1px solid ${t.border}`,
              borderRadius: 8, padding: '6px 10px', fontSize: 11,
              color: t.text, fontFamily: 'JetBrains Mono, monospace',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: t.textMuted }}>إلى:</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{
              background: t.card, border: `1px solid ${t.border}`,
              borderRadius: 8, padding: '6px 10px', fontSize: 11,
              color: t.text, fontFamily: 'JetBrains Mono, monospace',
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={handleDateRange}
          disabled={!dateFrom || !dateTo}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: dateFrom && dateTo ? GOLD : t.chipBg,
            border: 'none',
            color: dateFrom && dateTo ? 'white' : t.textFaint,
            fontSize: 11, fontWeight: 600, cursor: dateFrom && dateTo ? 'pointer' : 'default',
            fontFamily: 'Tajawal, sans-serif',
          }}
        >
          عرض
        </button>
      </div>

      {/* Branch cards */}
      {sales.branches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>
          لا توجد بيانات مبيعات لهذه الفترة
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sales.branches.map((branch, i) => (
            <BranchCard key={branch.id} branch={branch} rank={i + 1} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

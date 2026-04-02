import { useState, useMemo } from 'react';
import { type SalesData, type BranchSales } from '@/hooks/usePortalData';
import { type BusinessDay } from '@/lib/portal-business-day';
import { Loader2, TrendingUp, ShoppingBag, Receipt, Trophy, ChevronDown, Calendar, Store, LayoutGrid, UtensilsCrossed } from 'lucide-react';

const PRIMARY = '#1B3A5C';
const ACCENT = '#2A7B9B';

type ViewMode = 'live' | 'branches' | 'items';

function fmt(n: number) {
  return '₪' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getThemeColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)', chipBg: 'rgba(230,237,243,0.06)', branchGrad: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)` }
    : { card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)', textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)', chipBg: 'rgba(27,58,92,0.04)', branchGrad: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)` };
}

function KPICard({ icon, label, value, sub, accent, t }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean;
  t: ReturnType<typeof getThemeColors>;
}) {
  return (
    <div style={{
      background: t.card, borderRadius: 12, padding: '14px 14px',
      border: `1px solid ${accent ? `rgba(42,123,155,0.3)` : t.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, color: t.textMuted }}>{label}</span>
      </div>
      <div style={{
        fontSize: accent ? 22 : 18, fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        color: accent ? ACCENT : t.text,
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

  const minutesSinceLast = branch.lastOrderAt
    ? Math.round((Date.now() - new Date(branch.lastOrderAt).getTime()) / 60000)
    : null;

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.border}`, background: t.card }}>
      <div style={{
        background: t.branchGrad,
        borderTop: `3px solid ${ACCENT}`, padding: '12px 14px',
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
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'white' }}>
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
                  background: val > 0 ? ACCENT : t.border,
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
                background: i === 0 ? ACCENT
                  : i === 1 ? '#64748B'
                  : i === 2 ? '#94A3B8'
                  : t.chipBg,
                color: i < 3 ? 'white' : t.textMuted,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text }}>{meal.name}</div>
                <div style={{ height: 3, borderRadius: 2, background: t.border, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${(meal.quantity / maxMealQty) * 100}%`,
                    background: ACCENT, opacity: 1 - i * 0.12,
                  }} />
                </div>
              </div>
              <div style={{ textAlign: 'left', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: t.textMuted }}>
                  {meal.quantity}×
                </div>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: ACCENT }}>
                  {fmt(meal.revenue)}
                </div>
              </div>
            </div>
          ))}
          {branch.topMeals.length > 5 && (
            <button onClick={() => setShowAllMeals(!showAllMeals)} style={{
              background: 'none', border: 'none', color: ACCENT,
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

// ---- Grouped by branch name ----
function detectBranchGroup(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('سفيان') || lower.includes('sufian')) return 'فرع سفيان';
  if (lower.includes('فيصل') || lower.includes('faisal')) return 'فرع فيصل';
  if (lower.includes('رام الله') || lower.includes('ramallah') || lower.includes('طيرة') || lower.includes('الطيرة')) return 'فرع رام الله';
  return 'فرع آخر';
}

interface GroupedBranch {
  groupName: string;
  totalSales: number;
  orderCount: number;
  avgOrder: number;
  cashBoxes: { name: string; sales: number; orders: number }[];
  topMeals: { name: string; quantity: number; revenue: number }[];
}

function GroupedBranchCard({ group, t }: { group: GroupedBranch; t: ReturnType<typeof getThemeColors> }) {
  const [showItems, setShowItems] = useState(false);
  const maxRevenue = group.topMeals[0]?.revenue || 1;
  const mealsToShow = showItems ? group.topMeals : group.topMeals.slice(0, 5);

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.border}`, background: t.card }}>
      <div style={{
        background: t.branchGrad, borderTop: `3px solid ${ACCENT}`, padding: '14px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Store size={20} color="white" />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{group.groupName}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'white' }}>{fmt(group.totalSales)}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{group.orderCount} طلب • متوسط {fmt(group.avgOrder)}</div>
        </div>
      </div>
      {/* Cash boxes */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 6 }}>الصناديق</div>
        {group.cashBoxes.map(cb => (
          <div key={cb.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
            <span style={{ color: t.text }}>{cb.name}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: ACCENT }}>{fmt(cb.sales)} ({cb.orders})</span>
          </div>
        ))}
      </div>
      {/* Top items */}
      {mealsToShow.length > 0 && (
        <div style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 6 }}>🍽️ الأصناف</div>
          {mealsToShow.map((meal, i) => (
            <div key={meal.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, background: i < 3 ? ACCENT : t.chipBg,
                color: i < 3 ? 'white' : t.textMuted,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meal.name}</div>
                <div style={{ height: 3, borderRadius: 2, background: t.border, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${(meal.revenue / maxRevenue) * 100}%`, background: ACCENT }} />
                </div>
              </div>
              <div style={{ textAlign: 'left', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: t.textMuted }}>{meal.quantity}×</div>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: ACCENT }}>{fmt(meal.revenue)}</div>
              </div>
            </div>
          ))}
          {group.topMeals.length > 5 && (
            <button onClick={() => setShowItems(!showItems)} style={{
              background: 'none', border: 'none', color: ACCENT, fontSize: 11, cursor: 'pointer', padding: '6px 0',
              display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tajawal, sans-serif',
            }}>
              <ChevronDown size={12} style={{ transform: showItems ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
              {showItems ? 'عرض أقل' : 'عرض الكل'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- All items aggregated ----
function AllItemsView({ branches, t }: { branches: BranchSales[]; t: ReturnType<typeof getThemeColors> }) {
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity'>('revenue');

  const allItems = useMemo(() => {
    const map: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const b of branches) {
      for (const m of b.topMeals) {
        if (!map[m.name]) map[m.name] = { name: m.name, quantity: 0, revenue: 0 };
        map[m.name].quantity += m.quantity;
        map[m.name].revenue += m.revenue;
      }
    }
    return Object.values(map).sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity);
  }, [branches, sortBy]);

  const maxVal = sortBy === 'revenue' ? (allItems[0]?.revenue || 1) : (allItems[0]?.quantity || 1);
  const totalItems = allItems.reduce((s, i) => s + i.quantity, 0);
  const totalRevenue = allItems.reduce((s, i) => s + i.revenue, 0);

  return (
    <div>
      {/* Summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12,
      }}>
        <div style={{ background: t.card, borderRadius: 12, padding: 12, border: `1px solid ${t.border}`, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: t.textMuted }}>عدد الأصناف</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT, fontFamily: 'JetBrains Mono, monospace' }}>{allItems.length}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: 12, border: `1px solid ${t.border}`, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: t.textMuted }}>إجمالي الكميات</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{totalItems}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: 12, border: `1px solid ${t.border}`, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: t.textMuted }}>إجمالي الإيراد</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(totalRevenue)}</div>
        </div>
      </div>

      {/* Sort toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([
          { key: 'revenue' as const, label: 'ترتيب حسب القيمة' },
          { key: 'quantity' as const, label: 'ترتيب حسب الكمية' },
        ]).map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none',
              background: sortBy === opt.key ? ACCENT : t.chipBg,
              color: sortBy === opt.key ? 'white' : t.textMuted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Tajawal, sans-serif',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div style={{ background: t.card, borderRadius: 14, border: `1px solid ${t.border}`, overflow: 'hidden' }}>
        <div style={{ background: t.branchGrad, borderTop: `3px solid ${ACCENT}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <UtensilsCrossed size={18} color="white" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>جميع الأصناف - كل الأفرع</span>
        </div>
        <div style={{ padding: '10px 14px' }}>
          {allItems.map((item, i) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < allItems.length - 1 ? `1px solid ${t.border}` : 'none' }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                background: i === 0 ? ACCENT : i === 1 ? '#64748B' : i === 2 ? '#94A3B8' : t.chipBg,
                color: i < 3 ? 'white' : t.textMuted,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ height: 4, borderRadius: 2, background: t.border, overflow: 'hidden', marginTop: 3 }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${((sortBy === 'revenue' ? item.revenue : item.quantity) / maxVal) * 100}%`, background: ACCENT }} />
                </div>
              </div>
              <div style={{ textAlign: 'left', flexShrink: 0, minWidth: 70 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: t.text }}>{item.quantity}×</div>
                <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: ACCENT }}>{fmt(item.revenue)}</div>
              </div>
            </div>
          ))}
          {allItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: t.textFaint, fontSize: 13 }}>لا توجد أصناف</div>
          )}
        </div>
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
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const t = getThemeColors(theme);

  const groupedBranches = useMemo(() => {
    if (!data?.branches) return [];
    const groups: Record<string, GroupedBranch> = {};
    for (const b of data.branches) {
      const gName = detectBranchGroup(b.name);
      if (!groups[gName]) groups[gName] = { groupName: gName, totalSales: 0, orderCount: 0, avgOrder: 0, cashBoxes: [], topMeals: [] };
      groups[gName].totalSales += b.totalSales;
      groups[gName].orderCount += b.orderCount;
      groups[gName].cashBoxes.push({ name: b.name, sales: b.totalSales, orders: b.orderCount });
      const mealMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
      for (const m of [...groups[gName].topMeals, ...b.topMeals]) {
        if (!mealMap[m.name]) mealMap[m.name] = { ...m };
        else { mealMap[m.name].quantity += m.quantity; mealMap[m.name].revenue += m.revenue; }
      }
      groups[gName].topMeals = Object.values(mealMap).sort((a, b) => b.revenue - a.revenue);
    }
    for (const g of Object.values(groups)) {
      g.avgOrder = g.orderCount > 0 ? g.totalSales / g.orderCount : 0;
    }
    return Object.values(groups).sort((a, b) => b.totalSales - a.totalSales);
  }, [data?.branches]);

  if (needsSetup) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 16, marginBottom: 8 }}>يجب ربط البوابة بحساب AMWALI أولاً</div>
        <div style={{ fontSize: 13 }}>اذهب إلى الإعدادات لربط الحساب</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: ACCENT, margin: '0 auto 12px', display: 'block' }} />
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

  const viewModes: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'live', label: 'مبيعات مباشرة', icon: <TrendingUp size={13} /> },
    { key: 'branches', label: 'مبيعات أفرع', icon: <Store size={13} /> },
    { key: 'items', label: 'مبيعات أصناف', icon: <UtensilsCrossed size={13} /> },
  ];

  return (
    <div>
      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8, marginBottom: 12,
      }}>
        <KPICard icon={<TrendingUp size={14} color={ACCENT} />} label="إجمالي المبيعات" value={fmt(sales.totalSales)} sub="جميع الأفرع" accent t={t} />
        <KPICard icon={<ShoppingBag size={14} color={t.textMuted} />} label="عدد الطلبات" value={`${sales.orderCount}`} t={t} />
        <KPICard icon={<Receipt size={14} color={t.textMuted} />} label="متوسط الطلب" value={fmt(sales.avgOrderValue)} t={t} />
        <KPICard icon={<Trophy size={14} color={ACCENT} />} label="أعلى فرع" value={groupedBranches[0]?.groupName || '—'} sub={groupedBranches[0] ? fmt(groupedBranches[0].totalSales) : ''} t={t} />
      </div>

      {/* View mode tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 10, background: t.chipBg, borderRadius: 10, padding: 3,
      }}>
        {viewModes.map(vm => (
          <button
            key={vm.key}
            onClick={() => setViewMode(vm.key)}
            style={{
              flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, fontFamily: 'Tajawal, sans-serif',
              background: viewMode === vm.key ? ACCENT : 'transparent',
              color: viewMode === vm.key ? 'white' : t.textMuted,
              transition: 'all 0.2s',
            }}
          >
            {vm.icon}
            {vm.label}
          </button>
        ))}
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
                ? ACCENT : t.chipBg,
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
            background: dateFrom && dateTo ? ACCENT : t.chipBg,
            border: 'none',
            color: dateFrom && dateTo ? 'white' : t.textFaint,
            fontSize: 11, fontWeight: 600, cursor: dateFrom && dateTo ? 'pointer' : 'default',
            fontFamily: 'Tajawal, sans-serif',
          }}
        >
          عرض
        </button>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'live' && (
        sales.branches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>
            لا توجد بيانات مبيعات لهذه الفترة
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sales.branches.map((branch, i) => (
              <BranchCard key={branch.id} branch={branch} rank={i + 1} t={t} />
            ))}
          </div>
        )
      )}

      {viewMode === 'branches' && (
        groupedBranches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textFaint, fontSize: 13 }}>
            لا توجد بيانات مبيعات لهذه الفترة
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groupedBranches.map(g => (
              <GroupedBranchCard key={g.groupName} group={g} t={t} />
            ))}
          </div>
        )
      )}

      {viewMode === 'items' && (
        <AllItemsView branches={sales.branches} t={t} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { type SalesData, type BranchSales } from '@/hooks/usePortalData';
import { type BusinessDay } from '@/lib/portal-business-day';
import { Loader2, TrendingUp, ShoppingBag, Receipt, Trophy, ChevronDown } from 'lucide-react';

const GOLD = '#D4A017';

function fmt(n: number) {
  return '₪' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function KPICard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: '#111111', borderRadius: 14, padding: '18px 20px',
      border: `1px solid ${accent ? 'rgba(212,160,23,0.3)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      </div>
      <div style={{
        fontSize: accent ? 28 : 24, fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        color: accent ? GOLD : 'white',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BranchCard({ branch, rank }: { branch: BranchSales; rank: number }) {
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
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        background: 'linear-gradient(135deg, #1A0A00, #2D1200)',
        borderTop: `3px solid ${GOLD}`, padding: '14px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🏪</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{branch.name}</div>
            {branch.location && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{branch.location}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {rank <= 3 && <span style={{ fontSize: 16 }}>{rankBadge[rank]} #{rank}</span>}
          {minutesSinceLast !== null && minutesSinceLast < 30 && (
            <span style={{
              padding: '2px 8px', borderRadius: 10, fontSize: 10,
              background: 'rgba(34,197,94,0.15)', color: '#22C55E',
            }}>🟢 نشط</span>
          )}
        </div>
      </div>

      <div style={{ background: '#161616', padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>مبيعات اليوم</span>
          <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: GOLD }}>
            {fmt(branch.totalSales)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'الطلبات', value: `${branch.orderCount}` },
            { label: 'متوسط', value: fmt(branch.avgOrder) },
            { label: 'أعلى ساعة', value: (() => {
              const top = Object.entries(branch.hourlySales).sort((a, b) => b[1] - a[1])[0];
              if (!top) return '—';
              const h = parseInt(top[0]);
              return h >= 17 ? 'مساءً 🌙' : h >= 12 ? 'ظهراً ☀️' : 'صباحاً 🌅';
            })() },
          ].map((s, i) => (
            <div key={i} style={{
              textAlign: 'center', padding: '8px 4px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>المبيعات بالساعة</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
            {hours.map(h => {
              const val = branch.hourlySales[h] || 0;
              const pct = (val / maxH) * 100;
              const now = new Date().getHours().toString();
              return (
                <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '100%', borderRadius: '3px 3px 0 0',
                    height: `${Math.max(pct, 3)}%`,
                    background: h === now
                      ? `linear-gradient(to top, ${GOLD}, #F5D060)`
                      : 'linear-gradient(to top, rgba(212,160,23,0.6), rgba(212,160,23,0.3))',
                    minHeight: 2, transition: 'height 0.5s ease',
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
            {hours.map(h => (
              <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>
                {hourLabel[h] || ''}
              </div>
            ))}
          </div>
        </div>

        {branch.topMeals.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>🏆 أكثر المنتجات طلباً</div>
            {mealsToShow.map((meal, i) => (
              <div key={meal.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                  background: i === 0 ? 'linear-gradient(135deg, #D4A017, #F5D060)'
                    : i === 1 ? 'linear-gradient(135deg, #9CA3AF, #D1D5DB)'
                    : i === 2 ? 'linear-gradient(135deg, #B45309, #D97706)'
                    : 'rgba(255,255,255,0.1)',
                  color: i < 3 ? '#000' : 'rgba(255,255,255,0.6)',
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{meal.name}</div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${(meal.quantity / maxMealQty) * 100}%`,
                      background: GOLD, opacity: 1 - i * 0.15,
                    }} />
                  </div>
                </div>
                <div style={{ textAlign: 'left', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.5)' }}>
                    {meal.quantity} طلب
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: GOLD }}>
                    {fmt(meal.revenue)}
                  </div>
                </div>
              </div>
            ))}
            {branch.topMeals.length > 5 && (
              <button onClick={() => setShowAllMeals(!showAllMeals)} style={{
                background: 'none', border: 'none', color: GOLD,
                fontSize: 12, cursor: 'pointer', padding: '8px 0',
                display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'Tajawal, sans-serif',
              }}>
                <ChevronDown size={14} style={{ transform: showAllMeals ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                {showAllMeals ? 'عرض أقل' : 'عرض الكل'}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{
        background: '#111111', padding: '10px 18px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 11, color: 'rgba(255,255,255,0.4)',
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
}

export default function PortalSalesTab({ data, loading, businessDay, needsSetup, onRefresh }: Props) {
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState('');

  if (needsSetup) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.5)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 16, marginBottom: 8 }}>يجب ربط البوابة بحساب QOYOD أولاً</div>
        <div style={{ fontSize: 13 }}>اذهب إلى الإعدادات لربط الحساب</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: GOLD, margin: '0 auto 12px', display: 'block' }} />
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>جاري تحميل البيانات...</div>
      </div>
    );
  }

  const sales = data || { totalSales: 0, orderCount: 0, avgOrderValue: 0, topBranch: null, branches: [] };

  const handleDateChip = (key: string | null) => {
    setDateFilter(key);
    if (key === null) {
      onRefresh();
    } else if (key === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      onRefresh(d.toISOString().split('T')[0]);
    } else {
      onRefresh();
    }
  };

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <KPICard
          icon={<TrendingUp size={16} color={GOLD} />}
          label="إجمالي مبيعات اليوم"
          value={fmt(sales.totalSales)}
          sub="إجمالي جميع الأفرع"
          accent
        />
        <KPICard
          icon={<ShoppingBag size={16} color="rgba(255,255,255,0.5)" />}
          label="عدد الطلبات"
          value={`${sales.orderCount} طلب`}
        />
        <KPICard
          icon={<Receipt size={16} color="rgba(255,255,255,0.5)" />}
          label="متوسط قيمة الطلب"
          value={fmt(sales.avgOrderValue)}
          sub="متوسط الوجبة الواحدة"
        />
        <KPICard
          icon={<Trophy size={16} color={GOLD} />}
          label="أعلى فرع اليوم"
          value={sales.topBranch?.name || '—'}
          sub={sales.topBranch ? `${fmt(sales.topBranch.sales)} 🏆` : ''}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>عرض مبيعات:</span>
        {[
          { key: null, label: '● اليوم' },
          { key: 'yesterday', label: 'أمس' },
          { key: 'custom', label: '📅 تاريخ محدد' },
        ].map(chip => (
          <button
            key={chip.key || 'today'}
            onClick={() => {
              if (chip.key === 'custom') {
                document.getElementById('portal-date-picker')?.click();
              } else {
                handleDateChip(chip.key);
              }
            }}
            style={{
              padding: '6px 14px', borderRadius: 20,
              background: dateFilter === chip.key || (dateFilter === null && chip.key === null)
                ? `linear-gradient(135deg, ${GOLD}, #8B5E00)` : 'rgba(255,255,255,0.06)',
              border: 'none',
              color: dateFilter === chip.key || (dateFilter === null && chip.key === null) ? 'white' : 'rgba(255,255,255,0.5)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Tajawal, sans-serif',
            }}
          >
            {chip.label}
          </button>
        ))}
        <input
          id="portal-date-picker"
          type="date"
          value={customDate}
          onChange={e => {
            setCustomDate(e.target.value);
            if (e.target.value) {
              setDateFilter('custom');
              onRefresh(e.target.value);
            }
          }}
          style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
        />
      </div>

      {sales.branches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          لا توجد بيانات مبيعات لهذه الفترة
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(450px, 100%), 1fr))',
          gap: 16,
        }}>
          {sales.branches.map((branch, i) => (
            <BranchCard key={branch.id} branch={branch} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

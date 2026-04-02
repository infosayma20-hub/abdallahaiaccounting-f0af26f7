import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Droplets, Users, Building2 } from 'lucide-react';

interface Props {
  theme: 'dark' | 'light';
}

interface KPIData {
  revenue: number;
  expenses: number;
  netProfit: number;
  cashBalance: number;
  receivables: number;
  payables: number;
}

interface OverviewData {
  kpis: KPIData;
  cashFlow: { inflows: number; outflows: number; net: number };
  chartData: { date: string; revenue: number; expenses: number; profit: number }[];
  recentActivity: { id: string; description: string; amount: number; type: string; timeAgo: string }[];
  upcomingCheques: { id: string; cheque_date: string; amount: number; party_name: string; cheque_type: string; daysRemaining: number }[];
  topDebtors: { name: string; balance: number }[];
  topCreditors: { name: string; balance: number }[];
}

type PeriodType = 'today' | 'week' | 'month' | 'year';

function fmt(v: number): string {
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const PERIOD_LABELS: Record<PeriodType, string> = {
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  year: 'هذه السنة',
};

const PRIMARY = '#0D1B2E';

export default function PortalOverviewTab({ theme }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res, error } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'overview', period },
      });
      if (error) throw error;
      if (res && !res.needsSetup) setData(res);
    } catch (e) {
      console.error('Overview fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: 12,
    border: '0.5px solid #E2E8F0',
    padding: 16,
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ ...cardStyle, height: 100 }} className="animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد بيانات متاحة</p>
      </div>
    );
  }

  const KPI_CARDS = [
    { label: 'صافي الربح', key: 'netProfit' as const, positive: true },
    { label: 'إجمالي المبيعات', key: 'revenue' as const, positive: true },
    { label: 'إجمالي المصروفات', key: 'expenses' as const, positive: false },
    { label: 'السيولة النقدية', key: 'cashBalance' as const, positive: true },
    { label: 'الذمم المدينة', key: 'receivables' as const, positive: false },
    { label: 'الذمم الدائنة', key: 'payables' as const, positive: false },
  ];

  const maxChartVal = Math.max(...data.chartData.map(d => Math.max(d.revenue, d.expenses)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Period selector + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
          {(Object.keys(PERIOD_LABELS) as PeriodType[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: period === p ? 'none' : '1px solid #E2E8F0',
                fontSize: 12,
                fontFamily: "'Cairo', sans-serif",
                fontWeight: period === p ? 600 : 400,
                background: period === p ? PRIMARY : '#FFFFFF',
                color: period === p ? '#FFFFFF' : '#64748B',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <button
          onClick={fetchData}
          style={{
            background: 'rgba(42,123,155,0.1)',
            border: '1px solid rgba(42,123,155,0.25)',
            borderRadius: 10,
            padding: '6px 10px',
            color: '#2A7B9B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* KPI Grid — clean metric cards: small label on top, big number below */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10,
      }}>
        {KPI_CARDS.map(kpi => {
          const val = data.kpis[kpi.key];
          const isPositive = kpi.positive ? val >= 0 : val <= 0;
          return (
            <div key={kpi.key} style={{ ...cardStyle, padding: 14 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginBottom: 6 }}>{kpi.label}</div>
              <div style={{
                fontSize: 22, fontWeight: 700, color: isPositive ? '#16a34a' : '#dc2626',
                lineHeight: 1,
              }}>
                {fmt(Math.abs(val))}
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>₪</div>
            </div>
          );
        })}
      </div>

      {/* Cash Flow Summary */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1B3A5C', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Droplets size={16} style={{ color: '#2A7B9B' }} />
          التدفق النقدي
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <ArrowDownRight size={16} color="#16a34a" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{fmt(data.cashFlow.inflows)}</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>تدفقات داخلة</div>
          </div>
          <div style={{ width: 1, background: '#E2E8F0' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <ArrowUpRight size={16} color="#dc2626" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{fmt(data.cashFlow.outflows)}</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>تدفقات خارجة</div>
          </div>
          <div style={{ width: 1, background: '#E2E8F0' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            {data.cashFlow.net >= 0 ? <TrendingUp size={16} color="#16a34a" style={{ margin: '0 auto 4px' }} /> : <TrendingDown size={16} color="#dc2626" style={{ margin: '0 auto 4px' }} />}
            <div style={{ fontSize: 16, fontWeight: 700, color: data.cashFlow.net >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(Math.abs(data.cashFlow.net))}</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>صافي</div>
          </div>
        </div>
      </div>

      {/* Mini Chart */}
      {data.chartData.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B3A5C', marginBottom: 12 }}>الإيرادات مقابل المصروفات</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
            {data.chartData.slice(-14).map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <div style={{
                  width: '100%', maxWidth: 20,
                  height: Math.max(4, (d.revenue / maxChartVal) * 80),
                  background: '#16a34a',
                  borderRadius: '4px 4px 0 0',
                  opacity: 0.8,
                }} />
                <div style={{
                  width: '100%', maxWidth: 20,
                  height: Math.max(4, (d.expenses / maxChartVal) * 80),
                  background: '#dc2626',
                  borderRadius: '0 0 4px 4px',
                  opacity: 0.6,
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#16a34a', display: 'inline-block' }} /> إيرادات
            </span>
            <span style={{ fontSize: 10, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#dc2626', display: 'inline-block' }} /> مصروفات
            </span>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {data.recentActivity.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B3A5C', marginBottom: 10 }}>آخر النشاطات</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recentActivity.slice(0, 6).map(act => (
              <div key={act.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 10,
                background: '#F8FAFC',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#1B3A5C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {act.description}
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{act.timeAgo}</div>
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: act.type === 'income' ? '#16a34a' : act.type === 'expense' ? '#dc2626' : '#1B3A5C',
                  marginRight: 8,
                  flexShrink: 0,
                }}>
                  {act.type === 'expense' ? '-' : ''}{fmt(act.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Cheques */}
      {data.upcomingCheques.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B3A5C', marginBottom: 10 }}>شيكات قادمة</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.upcomingCheques.map(chq => (
              <div key={chq.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 10,
                background: '#F8FAFC',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#1B3A5C' }}>{chq.party_name}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>
                    {chq.cheque_type === 'صادر' ? '● صادر' : '● وارد'} • {chq.daysRemaining > 0 ? `بعد ${chq.daysRemaining} يوم` : chq.daysRemaining === 0 ? 'اليوم' : `متأخر ${Math.abs(chq.daysRemaining)} يوم`}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1B3A5C' }}>
                  {fmt(chq.amount)} ₪
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Debtors & Creditors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1B3A5C', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={14} style={{ color: '#2A7B9B' }} />
            أكبر المدينين
          </div>
          {data.topDebtors.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: 12 }}>لا توجد ذمم</div>
          ) : data.topDebtors.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < data.topDebtors.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
              <span style={{ fontSize: 11, color: '#1B3A5C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{d.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626' }}>{fmt(d.balance)}</span>
            </div>
          ))}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1B3A5C', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Building2 size={14} style={{ color: '#7C3AED' }} />
            أكبر الدائنين
          </div>
          {data.topCreditors.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: 12 }}>لا توجد ذمم</div>
          ) : data.topCreditors.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < data.topCreditors.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
              <span style={{ fontSize: 11, color: '#1B3A5C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{d.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2A7B9B' }}>{fmt(d.balance)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

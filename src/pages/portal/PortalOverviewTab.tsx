import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const ACCENT = '#2A7B9B';

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

export default function PortalOverviewTab({ theme }: Props) {
  const dark = theme === 'dark';
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');

  const t = dark
    ? { bg: '#161B22', card: '#1C2128', text: '#E6EDF3', muted: 'rgba(230,237,243,0.5)', border: 'rgba(230,237,243,0.08)', green: '#3FB950', red: '#F85149', accent: ACCENT }
    : { bg: '#F0F2F5', card: '#FFFFFF', text: '#1B3A5C', muted: 'rgba(27,58,92,0.5)', border: 'rgba(27,58,92,0.1)', green: '#1A7F37', red: '#CF222E', accent: ACCENT };

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

  const KPI_CARDS = [
    { label: 'صافي الربح', key: 'netProfit' as const, icon: '🔥', positive: true },
    { label: 'إجمالي المبيعات', key: 'revenue' as const, icon: '📈', positive: true },
    { label: 'إجمالي المصروفات', key: 'expenses' as const, icon: '💸', positive: false },
    { label: 'السيولة النقدية', key: 'cashBalance' as const, icon: '💧', positive: true },
    { label: 'الذمم المدينة', key: 'receivables' as const, icon: '👥', positive: false },
    { label: 'الذمم الدائنة', key: 'payables' as const, icon: '🏭', positive: false },
  ];

  const cardStyle: React.CSSProperties = {
    background: t.card,
    borderRadius: 16,
    border: `1px solid ${t.border}`,
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
        <p style={{ color: t.muted, fontSize: 14 }}>لا توجد بيانات متاحة</p>
      </div>
    );
  }

  const maxChartVal = Math.max(...data.chartData.map(d => Math.max(d.revenue, d.expenses)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Period selector + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1 }}>
          {(Object.keys(PERIOD_LABELS) as PeriodType[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontFamily: 'Tajawal, sans-serif',
                fontWeight: period === p ? 700 : 400,
                background: period === p ? t.accent : `${t.accent}15`,
                color: period === p ? '#fff' : t.muted,
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
            background: `${t.accent}15`,
            border: `1px solid ${t.accent}30`,
            borderRadius: 10,
            padding: '6px 10px',
            color: t.accent,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontFamily: 'Tajawal, sans-serif',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* KPI Grid - 2 cols on mobile, 3 cols on wider */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10,
      }}>
        {KPI_CARDS.map(kpi => {
          const val = data.kpis[kpi.key];
          const isPositive = kpi.positive ? val >= 0 : val <= 0;
          return (
            <div key={kpi.key} style={{ ...cardStyle, padding: 14, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: -8, left: -8, fontSize: 40, opacity: 0.06,
              }}>{kpi.icon}</div>
              <div style={{ fontSize: 11, color: t.muted, marginBottom: 6 }}>{kpi.label}</div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: isPositive ? t.green : t.red,
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {fmt(Math.abs(val))}
              </div>
              <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>₪</div>
            </div>
          );
        })}
      </div>

      {/* Cash Flow Summary */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>💰 التدفق النقدي</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <ArrowDownRight size={16} color={t.green} style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: t.green, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(data.cashFlow.inflows)}</div>
            <div style={{ fontSize: 10, color: t.muted }}>تدفقات داخلة</div>
          </div>
          <div style={{ width: 1, background: t.border }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <ArrowUpRight size={16} color={t.red} style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: t.red, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(data.cashFlow.outflows)}</div>
            <div style={{ fontSize: 10, color: t.muted }}>تدفقات خارجة</div>
          </div>
          <div style={{ width: 1, background: t.border }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            {data.cashFlow.net >= 0 ? <TrendingUp size={16} color={t.green} style={{ margin: '0 auto 4px' }} /> : <TrendingDown size={16} color={t.red} style={{ margin: '0 auto 4px' }} />}
            <div style={{ fontSize: 16, fontWeight: 700, color: data.cashFlow.net >= 0 ? t.green : t.red, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(Math.abs(data.cashFlow.net))}</div>
            <div style={{ fontSize: 10, color: t.muted }}>صافي</div>
          </div>
        </div>
      </div>

      {/* Mini Chart */}
      {data.chartData.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>📊 الإيرادات مقابل المصروفات</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
            {data.chartData.slice(-14).map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <div style={{
                  width: '100%', maxWidth: 20,
                  height: Math.max(4, (d.revenue / maxChartVal) * 80),
                  background: t.green,
                  borderRadius: '4px 4px 0 0',
                  opacity: 0.8,
                }} />
                <div style={{
                  width: '100%', maxWidth: 20,
                  height: Math.max(4, (d.expenses / maxChartVal) * 80),
                  background: t.red,
                  borderRadius: '0 0 4px 4px',
                  opacity: 0.6,
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: t.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.green, display: 'inline-block' }} /> إيرادات
            </span>
            <span style={{ fontSize: 10, color: t.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.red, display: 'inline-block' }} /> مصروفات
            </span>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {data.recentActivity.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 10 }}>⚡ آخر النشاطات</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recentActivity.slice(0, 6).map(act => (
              <div key={act.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 10,
                background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {act.description}
                  </div>
                  <div style={{ fontSize: 10, color: t.muted }}>{act.timeAgo}</div>
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: act.type === 'income' ? t.green : act.type === 'expense' ? t.red : t.text,
                  fontFamily: 'JetBrains Mono, monospace',
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
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 10 }}>💳 شيكات قادمة</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.upcomingCheques.map(chq => (
              <div key={chq.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 10,
                background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: t.text }}>{chq.party_name}</div>
                  <div style={{ fontSize: 10, color: t.muted }}>
                    {chq.cheque_type === 'صادر' ? '🔴 صادر' : '🟢 وارد'} • {chq.daysRemaining > 0 ? `بعد ${chq.daysRemaining} يوم` : chq.daysRemaining === 0 ? 'اليوم' : `متأخر ${Math.abs(chq.daysRemaining)} يوم`}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>
                  {fmt(chq.amount)} ₪
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Debtors & Creditors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Debtors */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>👥 أكبر المدينين</div>
          {data.topDebtors.length === 0 ? (
            <div style={{ fontSize: 11, color: t.muted, textAlign: 'center', padding: 12 }}>لا توجد ذمم</div>
          ) : data.topDebtors.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < data.topDebtors.length - 1 ? `1px solid ${t.border}` : 'none' }}>
              <span style={{ fontSize: 11, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{d.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.red, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(d.balance)}</span>
            </div>
          ))}
        </div>
        {/* Creditors */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>🏭 أكبر الدائنين</div>
          {data.topCreditors.length === 0 ? (
            <div style={{ fontSize: 11, color: t.muted, textAlign: 'center', padding: 12 }}>لا توجد ذمم</div>
          ) : data.topCreditors.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < data.topCreditors.length - 1 ? `1px solid ${t.border}` : 'none' }}>
              <span style={{ fontSize: 11, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{d.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.accent, fontFamily: 'JetBrains Mono, monospace' }}>{fmt(d.balance)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, TrendingDown, Wallet, Users, HandCoins, Factory,
  ShoppingBag, ChevronLeft, RefreshCw, ClipboardList, UserCheck, UserX, Clock,
} from 'lucide-react';

interface Props {
  theme: 'light' | 'dark';
  onOpenSalesDetail: () => void;
  onOpenFinance: () => void;
  onOpenLiquidity: () => void;
  onOpenReceivables: () => void;
  onOpenSuppliers: () => void;
  onOpenAttendance: () => void;
  onOpenTasks: () => void;
}

function fmt(n: number) {
  return '₪' + Math.round(Number(n) || 0).toLocaleString('en-US');
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tokens(dark: boolean) {
  return dark ? {
    cardBg: '#161B22', cardBorder: 'rgba(230,237,243,0.08)',
    text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)', textFaint: 'rgba(230,237,243,0.4)',
    heroGrad: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    sectionBg: '#0f1419', positive: '#22c55e', negative: '#ef4444',
  } : {
    cardBg: '#FFFFFF', cardBorder: '#F1F5F9',
    text: '#0D1B2E', textMuted: '#64748B', textFaint: '#94A3B8',
    heroGrad: 'linear-gradient(135deg, #0D1B2E 0%, #1e3a5f 100%)',
    sectionBg: '#F8FAFC', positive: '#16a34a', negative: '#dc2626',
  };
}

export default function PortalOwnerHomeSummary({
  theme, onOpenSalesDetail, onOpenFinance, onOpenLiquidity,
  onOpenReceivables, onOpenSuppliers, onOpenAttendance, onOpenTasks,
}: Props) {
  const t = tokens(theme === 'dark');
  const [sales, setSales] = useState<{ total: number; posTotal: number; invTotal: number; orderCount: number; growthPct: number; prevTotal: number } | null>(null);
  const [finance, setFinance] = useState<{ cash: number; receivables: number; payables: number } | null>(null);
  const [att, setAtt] = useState<{ present: number; absent: number; left: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const today = localDate(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, a] = await Promise.all([
        supabase.functions.invoke('malaki-data', { body: { action: 'owner_sales', dateFrom: today, dateTo: today } }),
        supabase.functions.invoke('malaki-data', { body: { action: 'overview', period: 'today' } }),
        supabase.functions.invoke('malaki-data', { body: { action: 'attendance', dateFrom: today, dateTo: today } }),
      ]);
      if (s.data?.success) {
        const c = s.data.current;
        setSales({
          total: c.total, posTotal: c.posTotal, invTotal: c.invTotal, orderCount: c.orderCount,
          growthPct: s.data.growthPct || 0, prevTotal: s.data.prevYear?.total || 0,
        });
      }
      if (o.data?.kpis) {
        setFinance({
          cash: o.data.kpis.cashBalance || 0,
          receivables: o.data.kpis.receivables || 0,
          payables: o.data.kpis.payables || 0,
        });
      }
      if (a.data?.summary) {
        const sm = a.data.summary;
        setAtt({ present: sm.present || 0, absent: sm.absent || 0, left: sm.left || 0, total: sm.totalEmployees || 0 });
      }
      setLastUpdate(new Date());
    } catch (e) { console.error('[OwnerHomeSummary]', e); }
    finally { setLoading(false); }
  }, [today]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime — refresh on new POS/invoice/attendance event
  useEffect(() => {
    const ch = supabase.channel('owner-home-summary')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' }, () => fetchAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices' }, () => fetchAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_events' }, () => fetchAll())
      .subscribe();
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchAll(); }, 45000);
    return () => { supabase.removeChannel(ch); clearInterval(id); };
  }, [fetchAll]);

  const isPositive = (sales?.growthPct ?? 0) >= 0;
  const avgOrder = sales && sales.orderCount > 0 ? sales.total / sales.orderCount : 0;

  return (
    <div dir="rtl" style={{ fontFamily: 'Cairo', padding: '12px 16px 24px' }}>
      {/* Live status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.textMuted }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: t.positive,
            boxShadow: `0 0 6px ${t.positive}80`, animation: 'pulse 2s infinite',
          }} />
          مباشر · آخر تحديث {lastUpdate.toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <button onClick={fetchAll} style={{
          background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 10,
          padding: '5px 10px', fontSize: 11, color: t.textMuted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Cairo',
        }}>
          <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          تحديث
        </button>
      </div>

      {/* HERO — Sales today + YoY */}
      <button onClick={onOpenSalesDetail} style={{
        width: '100%', textAlign: 'right', border: 'none', cursor: 'pointer',
        borderRadius: 20, padding: '20px 18px', background: t.heroGrad, color: '#fff',
        position: 'relative', overflow: 'hidden', marginBottom: 12, fontFamily: 'Cairo',
      }}>
        <div style={{ position: 'absolute', top: -40, left: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>مبيعات اليوم</div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>
              {fmt(sales?.total || 0)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
              {sales?.orderCount || 0} عملية · متوسط الطلب {fmt(avgOrder)}
            </div>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
            background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: isPositive ? '#86efac' : '#fca5a5' }}>
              {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {Math.abs(sales?.growthPct || 0).toFixed(1)}%
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>مقابل السنة الماضية</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'JetBrains Mono, monospace' }}>
              {fmt(sales?.prevTotal || 0)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          عرض تحليل المبيعات التفصيلي <ChevronLeft size={12} />
        </div>
      </button>

      {/* POS vs Invoices */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <MiniSplit t={t} icon={<ShoppingBag size={14} />} label="نقطة البيع" value={fmt(sales?.posTotal || 0)} accent="#0EA5E9" onClick={onOpenSalesDetail} />
        <MiniSplit t={t} icon={<Wallet size={14} />} label="الفواتير" value={fmt(sales?.invTotal || 0)} accent="#8B5CF6" onClick={onOpenSalesDetail} />
      </div>

      {/* SECTION: Finance summary */}
      <SectionTitle t={t} title="المالية" actionLabel="عرض المالية" onAction={onOpenFinance} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <SummaryCard t={t} icon={<HandCoins size={16} />} label="السيولة" value={fmt(finance?.cash || 0)}
          accent={(finance?.cash ?? 0) < 0 ? t.negative : t.positive} onClick={onOpenLiquidity}
          alert={(finance?.cash ?? 0) < 0 ? 'رصيد سالب' : undefined} />
        <SummaryCard t={t} icon={<Users size={16} />} label="الذمم المدينة" value={fmt(finance?.receivables || 0)}
          accent="#8B5CF6" onClick={onOpenReceivables} sub="مستحقات على الزبائن" />
        <SummaryCard t={t} icon={<Factory size={16} />} label="الذمم الدائنة" value={fmt(finance?.payables || 0)}
          accent="#F59E0B" onClick={onOpenSuppliers} sub="مستحقات للموردين" />
        <SummaryCard t={t} icon={<TrendingUp size={16} />} label="صافي التدفق" value={fmt((finance?.cash || 0))}
          accent="#0EA5E9" onClick={onOpenFinance} sub="ملخص اليوم" />
      </div>

      {/* SECTION: Attendance summary */}
      <SectionTitle t={t} title="الحضور" actionLabel="عرض الحاضرين الآن" onAction={onOpenAttendance} />
      <div style={{
        background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 14,
        marginBottom: 16, cursor: 'pointer',
      }} onClick={onOpenAttendance}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <AttPill t={t} icon={<Users size={14} />} value={att?.total ?? 0} label="إجمالي" color={t.textMuted} />
          <AttPill t={t} icon={<UserCheck size={14} />} value={att?.present ?? 0} label="حاضر" color={t.positive} />
          <AttPill t={t} icon={<UserX size={14} />} value={att?.absent ?? 0} label="غائب" color={t.negative} />
          <AttPill t={t} icon={<Clock size={14} />} value={att?.left ?? 0} label="غادر" color="#F59E0B" />
        </div>
      </div>

      {/* SECTION: Quick actions */}
      <SectionTitle t={t} title="إجراءات سريعة" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ActionTile t={t} icon={<ClipboardList size={18} />} label="المهام المسندة" onClick={onOpenTasks} />
        <ActionTile t={t} icon={<Users size={18} />} label="إرسال كشف حساب" onClick={onOpenReceivables} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
      `}</style>
    </div>
  );
}

function SectionTitle({ t, title, actionLabel, onAction }: { t: ReturnType<typeof tokens>; title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>{title}</div>
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          background: 'transparent', border: 'none', color: t.textMuted, fontSize: 11,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'Cairo',
        }}>
          {actionLabel} <ChevronLeft size={12} />
        </button>
      )}
    </div>
  );
}

function MiniSplit({ t, icon, label, value, accent, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'right', cursor: 'pointer', fontFamily: 'Cairo',
      background: t.cardBg, borderRadius: 14, padding: 14,
      border: `1px solid ${t.cardBorder}`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: accent }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textMuted, fontSize: 11, marginBottom: 6 }}>
        <span style={{ color: accent }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.text }}>{value}</div>
    </button>
  );
}

function SummaryCard({ t, icon, label, value, accent, onClick, sub, alert }: any) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'right', cursor: 'pointer', fontFamily: 'Cairo',
      background: t.cardBg, borderRadius: 14, padding: 14,
      border: `1px solid ${alert ? t.negative + '55' : t.cardBorder}`, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 110,
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: accent }} />
      <div style={{
        width: 32, height: 32, borderRadius: 10, background: accent + '22', color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div style={{ fontSize: 11, color: t.textMuted }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: t.text, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
      {alert ? (
        <div style={{ fontSize: 10, fontWeight: 700, color: t.negative }}>{alert}</div>
      ) : sub ? (
        <div style={{ fontSize: 10, color: t.textFaint }}>{sub}</div>
      ) : null}
    </button>
  );
}

function AttPill({ t, icon, value, label, color }: any) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: t.textMuted }}>{label}</div>
    </div>
  );
}

function ActionTile({ t, icon, label, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: 14, borderRadius: 14, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg,
      fontSize: 13, fontWeight: 600, fontFamily: 'Cairo', color: t.text, cursor: 'pointer',
    }}>
      {icon}{label}
    </button>
  );
}
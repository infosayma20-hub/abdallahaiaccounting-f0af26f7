import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalData } from '@/hooks/usePortalData';
import { getBusinessDay, formatArabicTime, formatArabicDate } from '@/lib/portal-business-day';
import {
  Home, Wallet, ClipboardList, BarChart3, MoreHorizontal,
  Settings, Bell, Sun, Moon, LogOut, Store, Factory,
  FileText, HandCoins, Send, Plus, RefreshCw, ChevronLeft,
  X, Users, Package
} from 'lucide-react';
import PortalSalesTab from './PortalSalesTab';
import PortalLiquidityTab from './PortalLiquidityTab';
import PortalEmployeeRequestsTab from './PortalEmployeeRequestsTab';
import PortalSupplierBalancesTab from './PortalSupplierBalancesTab';
import PortalAttendanceTab from './PortalAttendanceTab';
import PortalTasksTab from './PortalTasksTab';
import PortalOverviewTab from './PortalOverviewTab';
import PortalReceivablesTab from './PortalReceivablesTab';
import PortalStoreTab from './PortalStoreTab';
import { supabase } from '@/integrations/supabase/client';

const PRIMARY = '#0D1B2E';

function getColors(dark: boolean) {
  return dark ? {
    pageBg: '#0a0a0a',
    cardBg: '#161616',
    cardBorder: '#262626',
    textPrimary: '#F1F5F9',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    heroBg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    heroText: '#FFFFFF',
    inputBg: '#1e1e1e',
    inputBorder: '#333333',
    divider: '#262626',
    chipBg: '#1e1e1e',
    chipActiveBg: '#FFFFFF',
    chipActiveText: '#0a0a0a',
    chipText: '#A1A1AA',
    chipBorder: '#333333',
    navBg: '#111111',
    navBorder: '#262626',
    navActive: 'rgba(255,255,255,0.08)',
    navIcon: '#71717A',
    navIconActive: '#FFFFFF',
    sheetBg: '#161616',
    sheetText: '#F1F5F9',
    sheetIcon: '#333333',
    sheetIconColor: '#A1A1AA',
    sheetDivider: '#262626',
    activityIconBg: (type: string) => type === 'income' ? '#1e293b' : type === 'expense' ? '#2d1515' : '#2d2206',
    headerBg: '#111111',
  } : {
    pageBg: '#F8FAFC',
    cardBg: '#FFFFFF',
    cardBorder: '#F1F5F9',
    textPrimary: '#0D1B2E',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    heroBg: `linear-gradient(135deg, ${PRIMARY} 0%, #1e3a5f 100%)`,
    heroText: '#FFFFFF',
    inputBg: '#FFFFFF',
    inputBorder: '#E2E8F0',
    divider: '#F1F5F9',
    chipBg: '#F1F5F9',
    chipActiveBg: PRIMARY,
    chipActiveText: '#FFFFFF',
    chipText: '#64748B',
    chipBorder: '#E2E8F0',
    navBg: '#FFFFFF',
    navBorder: '#F1F5F9',
    navActive: 'rgba(13,27,46,0.06)',
    navIcon: '#94A3B8',
    navIconActive: PRIMARY,
    sheetBg: '#FFFFFF',
    sheetText: '#1E293B',
    sheetIcon: '#F1F5F9',
    sheetIconColor: '#475569',
    sheetDivider: '#F8FAFC',
    activityIconBg: (type: string) => type === 'income' ? '#EFF6FF' : type === 'expense' ? '#FEF2F2' : '#FEF3C7',
    headerBg: PRIMARY,
  };
}

type TabKey = 'home' | 'finance' | 'tasks' | 'reports' | 'more';
type FinanceSectionKey = 'all' | 'sales' | 'liquidity' | 'receivables';

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
}

const NAV_HEIGHT = 68;
const CONTENT_BOTTOM_PAD = NAV_HEIGHT + 16;

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [financeSection, setFinanceSection] = useState<FinanceSectionKey>('all');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('portal_theme');
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [hasEmployees, setHasEmployees] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [homeData, setHomeData] = useState<any>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [barWidth, setBarWidth] = useState(375);
  const barRef = useRef<HTMLDivElement>(null);
  const { salesData, liquidityData, loading: dataLoading, needsSetup, lastUpdated, businessDay, refresh } = usePortalData(user?.id);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const measure = () => { if (barRef.current) setBarWidth(barRef.current.offsetWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  const fetchCompanyData = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'get_settings' },
      });
      const settings = data?.settings;
      if (settings?.company_name) setCompanyName(settings.company_name);
      if (settings?.logo_url) setCompanyLogo(settings.logo_url);
      const linkedId = settings?.linked_user_id;
      if (linkedId) {
        const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('user_id', linkedId).eq('is_active', true);
        setHasEmployees((count || 0) > 0);
      }
    } catch {}
  }, []);

  const fetchHomeData = useCallback(async () => {
    try {
      setHomeLoading(true);
      const { data: res } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'overview', period: 'today' },
      });
      if (res && !res.needsSetup) setHomeData(res);
    } catch (e) { console.error(e); }
    finally { setHomeLoading(false); }
  }, []);

  useEffect(() => { fetchCompanyData(); fetchHomeData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchHomeData(), refresh()]);
    setRefreshing(false);
  };

  const receivablesTotal = homeData?.kpis?.receivables || 0;
  const salesToday = homeData?.kpis?.revenue || 0;
  const cashBalance = homeData?.kpis?.cashBalance || 0;

  const animatedReceivables = useCountUp(receivablesTotal);
  const animatedSales = useCountUp(salesToday);
  const animatedCash = useCountUp(cashBalance);

  if (authLoading || !user) return null;

  const c = getColors(darkMode);
  const topDebtors = homeData?.topDebtors || [];
  const recentActivity = homeData?.recentActivity || [];

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('portal_theme', next ? 'dark' : 'light');
  };

  const tabIndexMap: Record<TabKey, number> = { home: 0, finance: 1, tasks: 2, reports: 3, more: 4 };
  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setActiveIndex(tabIndexMap[tab] ?? 0);
  };

  const themeMode = darkMode ? 'dark' as const : 'light' as const;
  const today = new Date();
  const dateStr = today.toLocaleDateString('ar-PS', { day: 'numeric', month: 'long', year: 'numeric' });

  const navItems: { key: TabKey; label: string; icon: any }[] = [
    { key: 'home', label: 'الرئيسية', icon: Home },
    { key: 'finance', label: 'المالية', icon: Wallet },
    { key: 'tasks', label: 'المهام', icon: ClipboardList },
    { key: 'reports', label: 'التقارير', icon: BarChart3 },
    { key: 'more', label: 'المزيد', icon: MoreHorizontal },
  ];

  const moreItems = [
    { label: 'المتجر', icon: Store, action: () => { setShowMore(false); switchTab('reports'); } },
    { label: 'الموردين', icon: Factory, action: () => { setShowMore(false); switchTab('reports'); } },
    ...(hasEmployees ? [{ label: 'الحضور', icon: Users, action: () => { setShowMore(false); } }] : []),
    { label: darkMode ? 'الوضع الفاتح' : 'الوضع الداكن', icon: darkMode ? Sun : Moon, action: toggleTheme },
    ...(user.role === 'owner' ? [{ label: 'الإعدادات', icon: Settings, action: () => navigate('/portal/settings') }] : []),
    { label: 'تسجيل الخروج', icon: LogOut, action: () => { logout(); navigate('/auth'); } },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return renderHome();
      case 'finance': return renderFinance();
      case 'tasks': return <PortalTasksTab theme={themeMode} />;
      case 'reports': return <PortalOverviewTab theme={themeMode} />;
      default: return renderHome();
    }
  };

  // ═══════ HOME TAB ═══════
  const renderHome = () => (
    <div style={{ paddingBottom: CONTENT_BOTTOM_PAD }}>
      {refreshing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: 8 }}>
          <RefreshCw size={14} style={{ color: c.textMuted, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 12, color: c.textMuted, fontFamily: 'Cairo' }}>جاري التحديث...</span>
        </div>
      )}

      {/* HERO CARD */}
      <div style={{
        margin: '16px 16px 0', padding: '24px 20px', borderRadius: 20,
        background: c.heroBg, color: c.heroText, position: 'relative', overflow: 'hidden',
        border: darkMode ? '1px solid #2a2a4a' : 'none',
      }}>
        <div style={{ position: 'absolute', top: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', fontFamily: 'Cairo', marginBottom: 4 }}>إجمالي المستحقات</div>
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'Cairo', lineHeight: 1 }}>₪{animatedReceivables.toLocaleString()}</div>
        {topDebtors.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'Cairo', flexWrap: 'wrap' }}>
            {topDebtors.slice(0, 3).map((d: any, i: number) => (
              <span key={i}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }} />
                ₪{d.balance.toLocaleString()} {d.name}
              </span>
            ))}
          </div>
        )}
        <button onClick={() => { switchTab('finance'); setFinanceSection('receivables'); }} style={{
          marginTop: 16, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: '8px 16px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600,
          fontFamily: 'Cairo', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          عرض التفاصيل <ChevronLeft size={14} />
        </button>
      </div>

      {/* QUICK STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 16px 0' }}>
        {[
          { label: 'مبيعات اليوم', value: `₪${animatedSales.toLocaleString()}`, color: darkMode ? '#60A5FA' : PRIMARY, onClick: () => { switchTab('finance'); setFinanceSection('sales'); } },
          { label: 'طلبيات جديدة', value: String(homeData?.recentActivity?.filter((a: any) => a.type === 'income').length || 0), color: '#3B82F6', onClick: () => navigate('/orders') },
          { label: 'السيولة الحالية', value: `₪${animatedCash.toLocaleString()}`, color: '#16A34A', onClick: () => { switchTab('finance'); setFinanceSection('liquidity'); } },
          { label: 'مهام معلقة', value: '—', color: '#F59E0B', onClick: () => switchTab('tasks') },
        ].map((stat, i) => (
          <div key={i} onClick={stat.onClick} style={{
            background: c.cardBg, borderRadius: 16, padding: 18,
            border: `1px solid ${c.cardBorder}`, position: 'relative', overflow: 'hidden', cursor: 'pointer',
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: stat.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: 24, fontWeight: 800, color: c.textPrimary, fontFamily: 'Cairo' }}>{stat.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: c.textSecondary, marginTop: 2, fontFamily: 'Cairo' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: c.textPrimary, marginBottom: 12, fontFamily: 'Cairo' }}>إجراءات سريعة</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'فاتورة جديدة', icon: '📄', onClick: () => navigate('/invoices/new') },
            { label: 'سند قبض', icon: '💰', onClick: () => navigate('/finance/receipts/new') },
            { label: 'إرسال كشوفات', icon: '📤', onClick: () => { switchTab('finance'); setFinanceSection('receivables'); } },
            { label: 'مهمة جديدة', icon: '📋', onClick: () => switchTab('tasks') },
          ].map((action, i) => (
            <button key={i} onClick={action.onClick} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: 14, borderRadius: 14, border: `1.5px solid ${c.cardBorder}`, background: c.cardBg,
              fontSize: 13, fontWeight: 600, fontFamily: 'Cairo', color: c.textPrimary, cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              <span>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* RECENT ACTIVITY */}
      {recentActivity.length > 0 && (
        <div style={{ padding: '24px 16px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: c.textPrimary, marginBottom: 12, fontFamily: 'Cairo' }}>آخر الحركات</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentActivity.slice(0, 5).map((act: any) => (
              <div key={act.id} onClick={() => {
                if (act.referenceId) {
                  if (act.type === 'income') navigate(`/invoices/${act.referenceId}`);
                  else if (act.type === 'expense') navigate(`/finance/expenses`);
                  else if (act.type === 'payment') navigate(`/finance/receipts`);
                }
              }} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                borderBottom: `1px solid ${c.divider}`, cursor: act.referenceId ? 'pointer' : 'default',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0, background: c.activityIconBg(act.type),
                }}>
                  {act.type === 'income' ? '🧾' : act.type === 'expense' ? '💸' : '💰'}
                </div>
                <div style={{ flex: 1, direction: 'rtl' as const }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, fontFamily: 'Cairo', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {act.description}
                  </div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2, fontFamily: 'Cairo' }}>{act.timeAgo}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, fontFamily: 'Cairo', flexShrink: 0 }}>
                  ₪{act.amount?.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ═══════ FINANCE TAB ═══════
  const renderFinance = () => (
    <div style={{ paddingBottom: CONTENT_BOTTOM_PAD }}>
      <div style={{ display: 'flex', gap: 6, padding: '12px 16px', overflowX: 'auto' as const }}>
        {([
          { key: 'all' as FinanceSectionKey, label: 'الكل' },
          { key: 'sales' as FinanceSectionKey, label: 'المبيعات' },
          { key: 'liquidity' as FinanceSectionKey, label: 'السيولة' },
          { key: 'receivables' as FinanceSectionKey, label: 'الذمم' },
        ]).map(s => (
          <button key={s.key} onClick={() => setFinanceSection(s.key)} style={{
            padding: '6px 16px', borderRadius: 20, border: financeSection === s.key ? 'none' : `1px solid ${c.chipBorder}`,
            fontSize: 12, fontFamily: 'Cairo',
            fontWeight: financeSection === s.key ? 700 : 500,
            background: financeSection === s.key ? c.chipActiveBg : c.chipBg,
            color: financeSection === s.key ? c.chipActiveText : c.chipText,
            cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'all 0.2s',
          }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '0 12px' }}>
        {(financeSection === 'all' || financeSection === 'sales') && (
          <div style={{ marginBottom: 16 }}>
            <PortalSalesTab data={salesData} loading={dataLoading} businessDay={businessDay} needsSetup={needsSetup} onRefresh={refresh} theme={themeMode} />
          </div>
        )}
        {(financeSection === 'all' || financeSection === 'liquidity') && (
          <div style={{ marginBottom: 16 }}>
            <PortalLiquidityTab data={liquidityData} loading={dataLoading} theme={themeMode} />
          </div>
        )}
        {(financeSection === 'all' || financeSection === 'receivables') && (
          <div style={{ marginBottom: 16 }}>
            <PortalReceivablesTab theme={themeMode} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100dvh',
      background: c.pageBg,
      color: c.textPrimary,
      fontFamily: 'Cairo, sans-serif',
      direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>

      {/* ═══════ HEADER ═══════ */}
      <div style={{
        padding: '16px 20px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        background: c.headerBg,
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        direction: 'rtl',
      }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Cairo' }}>
            {getGreeting()} {user?.full_name?.split(' ')[0] || ''} 👋
          </div>
          <div style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginTop: 2, fontFamily: 'Cairo' }}>
            {companyName || 'بوابة الإدارة'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'Cairo' }}>{dateStr}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleRefresh} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <RefreshCw size={16} color="rgba(255,255,255,0.7)" style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
          <button style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
          }}>
            <Bell size={16} color="rgba(255,255,255,0.7)" />
          </button>
          <button onClick={toggleTheme} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            {darkMode ? <Sun size={16} color="rgba(255,255,255,0.7)" /> : <Moon size={16} color="rgba(255,255,255,0.7)" />}
          </button>
        </div>
      </div>

      {/* ═══════ PAGE CONTENT ═══════ */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {renderContent()}
      </div>

      {/* ═══════ MORE BOTTOM SHEET ═══════ */}
      {showMore && (
        <div onClick={() => setShowMore(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 55,
        }} />
      )}
      <div style={{
        position: 'fixed',
        bottom: showMore ? 0 : '-100%',
        left: 0, right: 0,
        background: c.sheetBg,
        borderRadius: '24px 24px 0 0',
        padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        transition: 'bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 60, direction: 'rtl', fontFamily: 'Cairo',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: c.cardBorder, margin: '0 auto 20px' }} />
        {moreItems.map((item, i) => (
          <button key={i} onClick={item.action} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
            borderBottom: i < moreItems.length - 1 ? `1px solid ${c.sheetDivider}` : 'none',
            cursor: 'pointer', width: '100%', background: 'none', border: 'none',
            direction: 'rtl', fontFamily: 'Cairo',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: c.sheetIcon,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <item.icon size={18} color={c.sheetIconColor} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: c.sheetText, fontFamily: 'Cairo' }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* ═══════ MAGIC BOTTOM NAV ═══════ */}
      {(() => {
        const navBg = darkMode ? '#111111' : '#0D1B2E';
        const itemW = barWidth / 5;
        const activeX = activeIndex * itemW + itemW / 2;
        const circleR = 28;
        const notchR = 35;
        const ActiveIcon = navItems[activeIndex].icon;

        return (
          <div
            ref={barRef}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              height: NAV_HEIGHT + NOTCH_EXTRA,
              zIndex: 50, direction: 'rtl',
              pointerEvents: 'none',
            }}
          >
            {/* Navy bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: NAV_HEIGHT, background: navBg,
              borderRadius: '20px 20px 0 0',
              pointerEvents: 'auto',
            }}>
              {/* Curved notch */}
              <div style={{
                position: 'absolute', top: -NOTCH_EXTRA + 2, right: activeX - notchR,
                width: notchR * 2, height: NOTCH_EXTRA,
                transition: 'right 0.4s cubic-bezier(0.4,0,0.2,1)',
                pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', left: -18, top: 0, width: 18, height: NOTCH_EXTRA,
                  background: 'transparent', borderBottomRightRadius: 18,
                  boxShadow: `8px 0 0 0 ${navBg}`,
                }} />
                <div style={{
                  position: 'absolute', left: 0, top: 0, width: notchR * 2, height: NOTCH_EXTRA,
                  background: navBg, borderRadius: `0 0 ${notchR}px ${notchR}px`,
                }} />
                <div style={{
                  position: 'absolute', right: -18, top: 0, width: 18, height: NOTCH_EXTRA,
                  background: 'transparent', borderBottomLeftRadius: 18,
                  boxShadow: `-8px 0 0 0 ${navBg}`,
                }} />
              </div>
            </div>

            {/* Floating circle */}
            <div style={{
              position: 'absolute', bottom: NAV_HEIGHT - 6,
              right: activeX - circleR,
              width: circleR * 2, height: circleR * 2,
              borderRadius: '50%', background: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(13,27,46,0.25)',
              transition: 'right 0.4s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 10, pointerEvents: 'none',
            }}>
              <ActiveIcon size={24} color={navBg} strokeWidth={2.2} />
            </div>

            {/* Nav buttons */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: NAV_HEIGHT, display: 'flex', direction: 'rtl',
              alignItems: 'center', zIndex: 5, pointerEvents: 'auto',
            }}>
              {navItems.map((item, idx) => {
                const isActive = idx === activeIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(10);
                      if (item.key === 'more') { setShowMore(prev => !prev); return; }
                      setActiveTab(item.key);
                      setActiveIndex(idx);
                      setShowMore(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 4,
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '8px 0',
                      opacity: isActive ? 0 : 1,
                      transition: 'opacity 0.3s ease',
                      position: 'relative',
                    }}
                  >
                    <Icon size={20} color="rgba(255,255,255,0.45)" strokeWidth={1.5} />
                    <span style={{
                      fontSize: 10, fontWeight: 500, fontFamily: 'Cairo',
                      color: 'rgba(255,255,255,0.45)',
                    }}>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active label */}
            <div style={{
              position: 'absolute', bottom: 8,
              right: activeX - 30, width: 60, textAlign: 'center',
              transition: 'right 0.4s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 10, pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Cairo', color: '#FFFFFF' }}>
                {navItems[activeIndex].label}
              </span>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

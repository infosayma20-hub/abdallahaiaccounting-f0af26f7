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
const ACCENT = '#2A7B9B';

type TabKey = 'home' | 'finance' | 'tasks' | 'reports' | 'more';
type FinanceSection = 'all' | 'sales' | 'liquidity' | 'receivables';

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

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [financeSection, setFinanceSection] = useState<FinanceSection>('all');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('portal_theme') === 'dark');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [hasEmployees, setHasEmployees] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [homeData, setHomeData] = useState<any>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const { salesData, liquidityData, loading: dataLoading, needsSetup, lastUpdated, businessDay, refresh } = usePortalData(user?.id);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
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

  const topDebtors = homeData?.topDebtors || [];
  const recentActivity = homeData?.recentActivity || [];

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('portal_theme', next ? 'dark' : 'light');
  };

  // ═══════ NAV ITEMS ═══════
  const navItems: { key: TabKey; label: string; icon: any }[] = [
    { key: 'home', label: 'الرئيسية', icon: Home },
    { key: 'finance', label: 'المالية', icon: Wallet },
    { key: 'tasks', label: 'المهام', icon: ClipboardList },
    { key: 'reports', label: 'التقارير', icon: BarChart3 },
    { key: 'more', label: 'المزيد', icon: MoreHorizontal },
  ];

  const moreItems = [
    { label: 'المتجر', icon: Store, action: () => { setShowMore(false); setActiveTab('reports'); } },
    { label: 'الموردين', icon: Factory, action: () => { setShowMore(false); setActiveTab('reports'); } },
    ...(hasEmployees ? [{ label: 'الحضور', icon: Users, action: () => { setShowMore(false); } }] : []),
    { label: darkMode ? 'الوضع الفاتح' : 'الوضع الداكن', icon: darkMode ? Sun : Moon, action: toggleTheme },
    ...(user.role === 'owner' ? [{ label: 'الإعدادات', icon: Settings, action: () => navigate('/portal/settings') }] : []),
    { label: 'تسجيل الخروج', icon: LogOut, action: () => { logout(); navigate('/auth'); } },
  ];

  // ═══════ RENDER ACTIVE CONTENT ═══════
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
    <div style={{ paddingBottom: 90 }}>
      {/* Pull to refresh indicator */}
      {refreshing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: 8 }}>
          <RefreshCw size={14} style={{ color: '#94A3B8', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'Cairo' }}>جاري التحديث...</span>
        </div>
      )}

      {/* HERO CARD */}
      <div style={{
        margin: '16px 16px 0',
        padding: '24px 20px',
        borderRadius: 20,
        background: `linear-gradient(135deg, ${PRIMARY} 0%, #1e3a5f 100%)`,
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', fontFamily: 'Cairo', marginBottom: 4 }}>
          إجمالي المستحقات
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'Cairo', lineHeight: 1 }}>
          ₪{animatedReceivables.toLocaleString()}
        </div>

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

        <button
          onClick={() => setActiveTab('finance')}
          style={{
            marginTop: 16, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10, padding: '8px 16px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600,
            fontFamily: 'Cairo', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          عرض التفاصيل
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* QUICK STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 16px 0' }}>
        {[
          { label: 'مبيعات اليوم', value: `₪${animatedSales.toLocaleString()}`, color: PRIMARY },
          { label: 'طلبيات جديدة', value: String(homeData?.recentActivity?.filter((a: any) => a.type === 'income').length || 0), color: '#3B82F6' },
          { label: 'السيولة الحالية', value: `₪${animatedCash.toLocaleString()}`, color: '#16A34A' },
          { label: 'مهام معلقة', value: '—', color: '#F59E0B' },
        ].map((stat, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: 16, padding: 18, border: '1px solid #F1F5F9',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: stat.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: 24, fontWeight: 800, color: PRIMARY, fontFamily: 'Cairo' }}>{stat.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8', marginTop: 2, fontFamily: 'Cairo' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, marginBottom: 12, fontFamily: 'Cairo' }}>إجراءات سريعة</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'فاتورة جديدة', icon: '📄' },
            { label: 'سند قبض', icon: '💰' },
            { label: 'إرسال كشوفات', icon: '📤' },
            { label: 'مهمة جديدة', icon: '📋' },
          ].map((action, i) => (
            <button key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: 14, borderRadius: 14, border: '1.5px solid #E2E8F0', background: 'white',
              fontSize: 13, fontWeight: 600, fontFamily: 'Cairo', color: PRIMARY, cursor: 'pointer',
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, marginBottom: 12, fontFamily: 'Cairo' }}>آخر الحركات</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentActivity.slice(0, 5).map((act: any) => (
              <div key={act.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                borderBottom: '1px solid #F8FAFC',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                  background: act.type === 'income' ? '#EFF6FF' : act.type === 'expense' ? '#FEF2F2' : '#FEF3C7',
                }}>
                  {act.type === 'income' ? '🧾' : act.type === 'expense' ? '💸' : '💰'}
                </div>
                <div style={{ flex: 1, direction: 'rtl' as const }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', fontFamily: 'Cairo', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {act.description}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, fontFamily: 'Cairo' }}>{act.timeAgo}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: PRIMARY, fontFamily: 'Cairo', flexShrink: 0 }}>
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
    <div style={{ paddingBottom: 90 }}>
      {/* Sub-section pills */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 16px', overflowX: 'auto' as const }}>
        {[
          { key: 'all' as FinanceSection, label: 'الكل' },
          { key: 'sales' as FinanceSection, label: 'المبيعات' },
          { key: 'liquidity' as FinanceSection, label: 'السيولة' },
          { key: 'receivables' as FinanceSection, label: 'الذمم' },
        ].map(s => (
          <button key={s.key} onClick={() => setFinanceSection(s.key)} style={{
            padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 12, fontFamily: 'Cairo',
            fontWeight: financeSection === s.key ? 700 : 500,
            background: financeSection === s.key ? PRIMARY : '#F1F5F9',
            color: financeSection === s.key ? 'white' : '#64748B',
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
      background: darkMode ? '#0D1117' : '#F8FAFC',
      color: darkMode ? '#E6EDF3' : '#1E293B',
      fontFamily: 'Cairo, sans-serif',
      direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>

      {/* ═══════ HEADER ═══════ */}
      <div style={{
        padding: '16px 20px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        background: PRIMARY,
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        direction: 'rtl',
      }}>
        {/* Right: greeting */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Cairo' }}>
            {getGreeting()} {user?.full_name?.split(' ')[0] || ''} 👋
          </div>
          <div style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginTop: 2, fontFamily: 'Cairo' }}>
            {companyName || 'بوابة الإدارة'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'Cairo' }}>
            {dateStr}
          </div>
        </div>

        {/* Left: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleRefresh} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
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
          transition: 'background 0.3s',
        }} />
      )}
      <div style={{
        position: 'fixed',
        bottom: showMore ? 0 : '-100%',
        left: 0, right: 0,
        background: 'white',
        borderRadius: '24px 24px 0 0',
        padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.1)',
        transition: 'bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 60,
        direction: 'rtl',
        fontFamily: 'Cairo',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E2E8F0', margin: '0 auto 20px' }} />
        {moreItems.map((item, i) => (
          <button key={i} onClick={item.action} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
            borderBottom: i < moreItems.length - 1 ? '1px solid #F8FAFC' : 'none',
            cursor: 'pointer', width: '100%', background: 'none', border: 'none',
            direction: 'rtl', fontFamily: 'Cairo',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: '#F1F5F9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <item.icon size={18} color="#475569" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', fontFamily: 'Cairo' }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* ═══════ BOTTOM NAV BAR ═══════ */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 72,
        background: 'white',
        borderTop: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
      }}>
        {navItems.map(item => {
          const active = item.key === activeTab;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => {
                if (item.key === 'more') { setShowMore(prev => !prev); }
                else { setActiveTab(item.key); setShowMore(false); }
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 16px', borderRadius: 12,
                background: active ? 'rgba(13,27,46,0.06)' : 'transparent',
                transition: 'all 0.2s', cursor: 'pointer', border: 'none',
                position: 'relative',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 2, width: 4, height: 4,
                  borderRadius: '50%', background: PRIMARY,
                }} />
              )}
              <Icon size={22} color={active ? PRIMARY : '#94A3B8'} strokeWidth={active ? 2.5 : 1.5} />
              <span style={{
                fontSize: 10, fontWeight: active ? 700 : 500,
                color: active ? PRIMARY : '#94A3B8', fontFamily: 'Cairo',
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

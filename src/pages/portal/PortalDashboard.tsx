import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalData } from '@/hooks/usePortalData';
import { getBusinessDay, formatArabicTime, formatArabicDate } from '@/lib/portal-business-day';
import { LogOut, Settings, RefreshCw, Sun, Moon } from 'lucide-react';
import PortalSalesTab from './PortalSalesTab';
import PortalLiquidityTab from './PortalLiquidityTab';
import PortalEmployeeRequestsTab from './PortalEmployeeRequestsTab';
import PortalSupplierBalancesTab from './PortalSupplierBalancesTab';
import PortalAttendanceTab from './PortalAttendanceTab';
import PortalTasksTab from './PortalTasksTab';
import PortalOverviewTab from './PortalOverviewTab';
import PortalReceivablesTab from './PortalReceivablesTab';
import { supabase } from '@/integrations/supabase/client';

const PRIMARY = '#1B3A5C';
const ACCENT = '#2A7B9B';

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'liquidity' | 'requests' | 'suppliers' | 'attendance' | 'tasks' | 'receivables'>('overview');
  const [clock, setClock] = useState(new Date());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('portal_theme') === 'dark');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [hasEmployees, setHasEmployees] = useState(false);
  const { salesData, liquidityData, loading: dataLoading, needsSetup, lastUpdated, businessDay, refresh } = usePortalData(user?.id);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        const { data } = await supabase.functions.invoke('malaki-data', {
          body: { action: 'get_settings' },
        });
        const settings = data?.settings;
        if (settings?.company_name) setCompanyName(settings.company_name);
        if (settings?.logo_url) setCompanyLogo(settings.logo_url);

        const linkedId = settings?.linked_user_id;
        if (linkedId) {
          // Check if this account has employees
          const { count } = await supabase
            .from('employees')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', linkedId)
            .eq('is_active', true);
          setHasEmployees((count || 0) > 0);
        }
      } catch {}
    };
    fetchCompanyData();
  }, []);

  if (authLoading || !user) return null;

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('portal_theme', next ? 'dark' : 'light');
  };

  const t = darkMode
    ? {
        bg: '#0D1117', card: '#161B22', text: '#E6EDF3', textMuted: 'rgba(230,237,243,0.6)',
        textFaint: 'rgba(230,237,243,0.4)', border: 'rgba(230,237,243,0.08)',
        topBar: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`, topBorder: 'rgba(42,123,155,0.3)',
        tabBg: '#161B22', tabBorder: 'rgba(230,237,243,0.08)',
      }
    : {
        bg: '#F0F2F5', card: '#FFFFFF', text: '#1B3A5C', textMuted: 'rgba(27,58,92,0.6)',
        textFaint: 'rgba(27,58,92,0.4)', border: 'rgba(27,58,92,0.1)',
        topBar: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`, topBorder: 'rgba(42,123,155,0.3)',
        tabBg: '#FFFFFF', tabBorder: 'rgba(27,58,92,0.08)',
      };

  const tabs = [
    { key: 'overview' as const, label: '📊 لوحة المعلومات', visible: true },
    { key: 'attendance' as const, label: '👥 الحضور', visible: hasEmployees },
    { key: 'tasks' as const, label: '📋 المهام', visible: true },
    { key: 'sales' as const, label: '🛒 المبيعات', visible: user.can_see_sales },
    { key: 'liquidity' as const, label: '💰 السيولة', visible: user.can_see_liquidity },
    { key: 'receivables' as const, label: '🔴 الذمم المدينة', visible: true },
    { key: 'requests' as const, label: '📝 الطلبات', visible: true },
    { key: 'suppliers' as const, label: '🏭 الموردين', visible: true },
  ].filter(t => t.visible);

  return (
    <div style={{
      minHeight: '100dvh', background: t.bg, color: t.text,
      fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      transition: 'background 0.3s, color 0.3s',
    }}>
      {/* TOP BAR */}
      <div style={{
        background: t.topBar,
        borderBottom: `1px solid ${t.topBorder}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
        paddingTop: 'max(10px, env(safe-area-inset-top))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={companyLogo || '/logos/amwali-mark-white.png'}
            alt="Logo"
            style={{
              width: 34, height: 34, borderRadius: 8, objectFit: 'contain',
              background: companyLogo ? 'white' : 'none', padding: companyLogo ? 2 : 0,
            }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: 'white' }}>بوابة الإدارة</div>
            {companyName && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.2 }}>
                {companyName}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
          }}>
            {formatArabicTime(clock)}
          </div>
          <button onClick={toggleTheme} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none',
            borderRadius: 8, padding: 6, color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', display: 'flex',
          }} title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user.role === 'owner' && (
            <button onClick={() => navigate('/portal/settings')} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none',
              borderRadius: 8, padding: 6, color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', display: 'flex',
            }}>
              <Settings size={16} />
            </button>
          )}
          <button onClick={() => { logout(); navigate('/auth'); }} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none',
            borderRadius: 8, padding: 6, color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', display: 'flex',
          }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{
        background: t.tabBg,
        borderBottom: `1px solid ${t.tabBorder}`,
        display: 'flex', alignItems: 'center',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none', scrollbarWidth: 'none',
        position: 'sticky', top: 56, zIndex: 49,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              height: 44, padding: '0 16px',
              background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? `3px solid ${ACCENT}` : '3px solid transparent',
              color: activeTab === tab.key ? ACCENT : t.textMuted,
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: 12, fontFamily: 'Tajawal, sans-serif',
              cursor: 'pointer', transition: 'all 0.2s',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: '12px', maxWidth: 1400, margin: '0 auto' }}>
        {(activeTab === 'sales' || activeTab === 'liquidity') && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 9, color: t.textFaint,
            }}>
              <RefreshCw size={9} className={dataLoading ? 'animate-spin' : ''} />
              <span>تحديث تلقائي</span>
              <span>•</span>
              <span>{formatArabicTime(lastUpdated)}</span>
            </div>
            <button
              onClick={() => refresh()}
              style={{
                background: `rgba(42,123,155,0.1)`,
                border: `1px solid rgba(42,123,155,0.25)`,
                borderRadius: 8, padding: '5px 12px',
                color: ACCENT, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'Tajawal, sans-serif',
              }}
            >
              <RefreshCw size={12} />
              تحديث
            </button>
          </div>
        )}

        {activeTab === 'sales' && (
          <PortalSalesTab
            data={salesData}
            loading={dataLoading}
            businessDay={businessDay}
            needsSetup={needsSetup}
            onRefresh={refresh}
            theme={darkMode ? 'dark' : 'light'}
          />
        )}
        {activeTab === 'liquidity' && (
          <PortalLiquidityTab data={liquidityData} loading={dataLoading} theme={darkMode ? 'dark' : 'light'} />
        )}
        {activeTab === 'requests' && <PortalEmployeeRequestsTab theme={darkMode ? 'dark' : 'light'} />}
        {activeTab === 'suppliers' && <PortalSupplierBalancesTab theme={darkMode ? 'dark' : 'light'} />}
        {activeTab === 'attendance' && <PortalAttendanceTab theme={darkMode ? 'dark' : 'light'} />}
        {activeTab === 'tasks' && <PortalTasksTab theme={darkMode ? 'dark' : 'light'} />}
        {activeTab === 'overview' && <PortalOverviewTab theme={darkMode ? 'dark' : 'light'} />}
        {activeTab === 'receivables' && <PortalReceivablesTab theme={darkMode ? 'dark' : 'light'} />}
      </div>

      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

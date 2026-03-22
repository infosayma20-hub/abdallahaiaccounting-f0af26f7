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
import { supabase } from '@/integrations/supabase/client';

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sales' | 'liquidity' | 'requests' | 'suppliers'>('sales');
  const [clock, setClock] = useState(new Date());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('portal_theme') === 'dark');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
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

  // Fetch company name from the admin's settings
  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const { data } = await supabase.functions.invoke('malaki-data', {
          body: { action: 'get_settings' },
        });
        if (data?.settings?.linked_user_id) {
          const { data: cs } = await supabase
            .from('company_settings')
            .select('company_name, logo_url')
            .eq('user_id', data.settings.linked_user_id)
            .single();
          if (cs?.company_name) setCompanyName(cs.company_name);
          if (cs?.logo_url) setCompanyLogo(cs.logo_url);
        }
      } catch {}
    };
    fetchCompanyName();
  }, []);

  if (authLoading || !user) return null;

  const bd = getBusinessDay();

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('portal_theme', next ? 'dark' : 'light');
  };

  // Theme colors
  const t = darkMode
    ? {
        bg: '#0A0A0A', card: '#111111', text: 'white', textMuted: 'rgba(255,255,255,0.5)',
        textFaint: 'rgba(255,255,255,0.35)', border: 'rgba(255,255,255,0.06)',
        topBar: 'linear-gradient(135deg, #0A0A0A, #1A0A00)', topBorder: 'rgba(212,160,23,0.2)',
        tabBg: '#111111', tabBorder: 'rgba(255,255,255,0.06)',
      }
    : {
        bg: '#F5F5F5', card: '#FFFFFF', text: '#1A1A1A', textMuted: 'rgba(0,0,0,0.55)',
        textFaint: 'rgba(0,0,0,0.35)', border: 'rgba(0,0,0,0.08)',
        topBar: 'linear-gradient(135deg, #1B3A5C, #0D1B2A)', topBorder: 'rgba(212,160,23,0.3)',
        tabBg: '#FFFFFF', tabBorder: 'rgba(0,0,0,0.08)',
      };

  const GOLD = '#D4A017';

  const tabs = [
    { key: 'sales' as const, label: '📊 المبيعات', visible: user.can_see_sales },
    { key: 'liquidity' as const, label: '💰 السيولة', visible: user.can_see_liquidity },
    { key: 'requests' as const, label: '📋 الطلبات', visible: true },
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
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
        paddingTop: 'max(10px, env(safe-area-inset-top))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo-icon-white.svg" alt="QOYOD" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: 'white' }}>بوابة الإدارة</div>
            {companyName && (
              <div style={{ fontSize: 9, color: GOLD, lineHeight: 1 }}>
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
          {/* Theme toggle */}
          <button onClick={toggleTheme} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, padding: 6, color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', display: 'flex',
          }} title={darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user.role === 'owner' && (
            <button onClick={() => navigate('/portal/settings')} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, padding: 6, color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', display: 'flex',
            }}>
              <Settings size={16} />
            </button>
          )}
          <button onClick={() => { logout(); navigate('/auth'); }} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, padding: 6, color: 'rgba(255,255,255,0.6)',
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
              borderBottom: activeTab === tab.key ? `3px solid ${GOLD}` : '3px solid transparent',
              color: activeTab === tab.key ? GOLD : t.textMuted,
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
                background: 'rgba(212,160,23,0.1)',
                border: `1px solid rgba(212,160,23,0.25)`,
                borderRadius: 8, padding: '5px 12px',
                color: GOLD, fontSize: 11,
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
      </div>

      {/* Hide scrollbar CSS */}
      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

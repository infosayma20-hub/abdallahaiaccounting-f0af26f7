import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalData } from '@/hooks/usePortalData';
import { getBusinessDay, formatArabicTime, formatArabicDate } from '@/lib/portal-business-day';
import { LogOut, Settings, RefreshCw, Sun, Moon, LayoutDashboard, Users, ClipboardList, ShoppingCart, Droplets, FileText, Building2 } from 'lucide-react';
import PortalSalesTab from './PortalSalesTab';
import PortalLiquidityTab from './PortalLiquidityTab';
import PortalEmployeeRequestsTab from './PortalEmployeeRequestsTab';
import PortalSupplierBalancesTab from './PortalSupplierBalancesTab';
import PortalAttendanceTab from './PortalAttendanceTab';
import PortalTasksTab from './PortalTasksTab';
import PortalOverviewTab from './PortalOverviewTab';
import { supabase } from '@/integrations/supabase/client';

const PRIMARY = '#0D1B2E';

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'liquidity' | 'requests' | 'suppliers' | 'attendance' | 'tasks'>('overview');
  const [clock, setClock] = useState(new Date());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('portal_theme') === 'dark');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [hasEmployees, setHasEmployees] = useState(false);
  const { salesData, liquidityData, loading: dataLoading, needsSetup, lastUpdated, businessDay, refresh } = usePortalData(user?.id);

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

  const tabs = [
    { key: 'overview' as const, label: 'لوحة المعلومات', icon: LayoutDashboard, visible: true },
    { key: 'attendance' as const, label: 'الحضور', icon: Users, visible: hasEmployees },
    { key: 'tasks' as const, label: 'المهام', icon: ClipboardList, visible: true },
    { key: 'sales' as const, label: 'المبيعات', icon: ShoppingCart, visible: user.can_see_sales },
    { key: 'liquidity' as const, label: 'السيولة', icon: Droplets, visible: user.can_see_liquidity },
    { key: 'requests' as const, label: 'الطلبات', icon: FileText, visible: true },
    { key: 'suppliers' as const, label: 'الموردين', icon: Building2, visible: true },
  ].filter(t => t.visible);

  return (
    <div style={{
      minHeight: '100dvh', background: '#F8FAFC', color: '#1B3A5C',
      fontFamily: "'Cairo', sans-serif", direction: 'rtl',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* TOP BAR */}
      <div style={{
        background: `linear-gradient(135deg, ${PRIMARY}, #0D1B2A)`,
        borderBottom: '1px solid rgba(42,123,155,0.3)',
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
            fontSize: 11, color: 'rgba(255,255,255,0.5)',
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

      {/* TABS — chip style like main app */}
      <div style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', gap: 6,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none', scrollbarWidth: 'none',
        position: 'sticky', top: 56, zIndex: 49,
        padding: '10px 16px',
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '6px 14px',
                background: isActive ? PRIMARY : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#64748B',
                border: isActive ? 'none' : '1px solid #E2E8F0',
                borderRadius: 20,
                fontWeight: isActive ? 600 : 400,
                fontSize: 12, fontFamily: "'Cairo', sans-serif",
                cursor: 'pointer', transition: 'all 0.2s',
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
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
              fontSize: 9, color: 'rgba(27,58,92,0.4)',
            }}>
              <RefreshCw size={9} className={dataLoading ? 'animate-spin' : ''} />
              <span>تحديث تلقائي</span>
              <span>•</span>
              <span>{formatArabicTime(lastUpdated)}</span>
            </div>
            <button
              onClick={() => refresh()}
              style={{
                background: 'rgba(42,123,155,0.1)',
                border: '1px solid rgba(42,123,155,0.25)',
                borderRadius: 8, padding: '5px 12px',
                color: '#2A7B9B', fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: "'Cairo', sans-serif",
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
      </div>

      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

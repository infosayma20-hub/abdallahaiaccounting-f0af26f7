import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalData } from '@/hooks/usePortalData';
import { getBusinessDay, formatArabicTime, formatArabicDate } from '@/lib/portal-business-day';
import { LogOut, Settings, RefreshCw } from 'lucide-react';
import PortalSalesTab from './PortalSalesTab';
import PortalLiquidityTab from './PortalLiquidityTab';

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sales' | 'liquidity'>('sales');
  const [clock, setClock] = useState(new Date());
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
    if (!authLoading && !user) navigate('/auth?mode=portal', { replace: true });
  }, [authLoading, user, navigate]);

  if (authLoading || !user) return null;

  const bd = getBusinessDay();

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A', color: 'white',
      fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
    }}>
      {/* TOP BAR */}
      <div style={{
        height: 56,
        background: 'linear-gradient(135deg, #0A0A0A, #1A0A00)',
        borderBottom: '1px solid rgba(212,160,23,0.2)',
        padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #D4A017, #8B5E00)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: 'white',
          }}>📊</div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>بوابة الإدارة</span>
          <div className="hidden sm:block" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
            <span style={{ fontSize: 12, color: '#D4A017' }}>متابعة المبيعات والسيولة</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            padding: '6px 14px', borderRadius: 20,
            background: bd.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
            border: `1px solid ${bd.isActive ? 'rgba(34,197,94,0.4)' : 'rgba(251,191,36,0.4)'}`,
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{bd.isActive ? '🟢' : '🟡'}</span>
            <span className="hidden md:inline">{bd.isActive ? 'وردية جارية' : 'فترة الراحة'}</span>
            <span className="hidden lg:inline" style={{ opacity: 0.7 }}>— {formatArabicDate(bd.date)}</span>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
            ⏰ {formatArabicTime(clock)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="hidden sm:inline" style={{ fontSize: 13 }}>أهلاً، {user.full_name}</span>
          {user.role === 'owner' && (
            <button onClick={() => navigate('/portal/settings')} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, padding: '4px 10px', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
            }}>
              <Settings size={14} />
            </button>
          )}
          <button onClick={() => { logout(); navigate('/auth?mode=portal'); }} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, padding: '4px 10px', color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}>
            <LogOut size={14} />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{
        height: 48, background: '#111111',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {[
          { key: 'sales' as const, label: '📊 المبيعات والأداء', visible: user.can_see_sales },
          { key: 'liquidity' as const, label: '💰 السيولة النقدية', visible: user.can_see_liquidity },
        ].filter(t => t.visible).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              height: '100%', padding: '0 32px',
              background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #D4A017' : '3px solid transparent',
              color: activeTab === tab.key ? '#D4A017' : 'rgba(255,255,255,0.5)',
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: 14, fontFamily: 'Tajawal, sans-serif',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
          }}>
            <RefreshCw size={10} className={dataLoading ? 'animate-spin' : ''} />
            يتحدث تلقائياً كل دقيقة
            <span style={{ margin: '0 4px' }}>•</span>
            آخر تحديث: {formatArabicTime(lastUpdated)}
          </div>
          <button
            onClick={() => refresh()}
            style={{
              background: 'rgba(212,160,23,0.1)',
              border: '1px solid rgba(212,160,23,0.3)',
              borderRadius: 8, padding: '4px 12px',
              color: '#D4A017', fontSize: 11,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'Tajawal, sans-serif',
            }}
          >
            <RefreshCw size={12} />
            تحديث الآن
          </button>
        </div>

        {activeTab === 'sales' && (
          <PortalSalesTab
            data={salesData}
            loading={dataLoading}
            businessDay={businessDay}
            needsSetup={needsSetup}
            onRefresh={refresh}
          />
        )}
        {activeTab === 'liquidity' && (
          <PortalLiquidityTab data={liquidityData} loading={dataLoading} />
        )}
      </div>

      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </div>
  );
}

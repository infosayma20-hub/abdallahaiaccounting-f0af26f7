import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalData } from '@/hooks/usePortalData';
import { getBusinessDay, formatArabicTime, formatArabicDate } from '@/lib/portal-business-day';
import {
  Home, Wallet, ClipboardList, BarChart3, MoreHorizontal,
  Settings, Bell, Sun, Moon, LogOut, Store, Factory,
  FileText, HandCoins, Send, Plus, RefreshCw, ChevronLeft,
  X, Users, Package, CalendarClock, Megaphone, GraduationCap, Timer, Receipt, Star
} from 'lucide-react';
import PortalLiquidityTab from './PortalLiquidityTab';
import PortalEmployeeRequestsTab from './PortalEmployeeRequestsTab';
import PortalSupplierBalancesTab from './PortalSupplierBalancesTab';
import PortalAttendanceTab from './PortalAttendanceTab';
import PortalTasksTab from './PortalTasksTab';
import PortalOverviewTab from './PortalOverviewTab';
import PortalReceivablesTab from './PortalReceivablesTab';
import PortalOrderTrackingTab from './PortalOrderTrackingTab';
import PortalStoreTab from './PortalStoreTab';
import PortalSuppliersTab from './PortalSuppliersTab';
import PortalOwnerSalesHome from './PortalOwnerSalesHome';
import PortalOwnerHomeSummary from './PortalOwnerHomeSummary';
import PortalRosterAssignmentsTab from './PortalRosterAssignmentsTab';
import PortalCampaignsTab from './PortalCampaignsTab';
import PortalFormsTab from './PortalFormsTab';
import PortalTrainingTab from './PortalTrainingTab';
import PortalPettyCashTab from './PortalPettyCashTab';
import PortalLoyaltyTab from './PortalLoyaltyTab';
import PortalBusinessProfileDialog from './PortalBusinessProfileDialog';
import { usePortalProfile } from '@/hooks/usePortalProfile';
import HRBranchHoursReport from '@/pages/reports/HRBranchHoursReport';
import PortalNotificationsBell from '@/components/portal/PortalNotificationsBell';
import { supabase } from '@/integrations/supabase/client';
import { enablePushNotifications, pushSupported, isIos, isIosStandalone, bindForegroundMessagingIfReady } from '@/lib/push-notifications';
import { toast } from 'sonner';

const PRIMARY = '#0D1B2E';

const CAMPAIGN_ALLOWED_EMAILS = [
  'malakybroast@gmail.com',
  'mosaab@malaky.com',
  'mosab@malaky.com',
  'kamal@malaky.com',
];

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

type TabKey = 'home' | 'finance' | 'attendance' | 'reports' | 'more';
type FinanceSectionKey = 'menu' | 'sales' | 'liquidity' | 'receivables' | 'suppliers';

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    const sign = target < 0 ? -1 : 1;
    const abs = Math.abs(target);
    let start = 0;
    const step = abs / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= abs) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start) * sign);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function fmtSigned(n: number) {
  const rounded = Math.round(Number(n) || 0);
  const abs = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `-₪${abs}` : `₪${abs}`;
}

function fmtMoney(n: number) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
}

const NAV_HEIGHT = 68;
const CONTENT_BOTTOM_PAD = NAV_HEIGHT + 32;

export default function PortalDashboard() {
  const { user, loading: authLoading, logout } = usePortalAuth();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [financeSection, setFinanceSection] = useState<FinanceSectionKey>('menu');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('portal_theme');
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [linkedUserId, setLinkedUserId] = useState('');
  const [hasEmployees, setHasEmployees] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [homeData, setHomeData] = useState<any>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showTasksPage, setShowTasksPage] = useState(false);
  const [showEmployeeRequests, setShowEmployeeRequests] = useState(false);
  const [showRosterPage, setShowRosterPage] = useState(false);
  const [showBranchHoursPage, setShowBranchHoursPage] = useState(false);
  const [showCampaignsPage, setShowCampaignsPage] = useState(false);
  const [showFormsPage, setShowFormsPage] = useState(false);
  const [showTrainingPage, setShowTrainingPage] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showOrdersPage, setShowOrdersPage] = useState(false);
  const [showTrackingPage, setShowTrackingPage] = useState(false);
  const [showPettyCashPage, setShowPettyCashPage] = useState(false);
  const [showLoyaltyPage, setShowLoyaltyPage] = useState(false);
  const [hasOrders, setHasOrders] = useState(false);
  const { profile: portalProfile } = usePortalProfile();
  const { salesData, liquidityData, loading: dataLoading, needsSetup, lastUpdated, businessDay, refresh } = usePortalData(user?.id);

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

  useEffect(() => {
    if (!authLoading && user) {
      bindForegroundMessagingIfReady();
    }
  }, [authLoading, user?.id]);

  // Re-validate the push token whenever the app returns to the foreground
  // (unlocking the phone / reopening the PWA), so FCM-rotated tokens are
  // re-saved and notifications keep arriving while the device is locked.
  useEffect(() => {
    if (authLoading || !user) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') bindForegroundMessagingIfReady();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [authLoading, user?.id]);

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
        setLinkedUserId(linkedId);
        const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('user_id', linkedId).eq('is_active', true);
        setHasEmployees((count || 0) > 0);
        // Domain-neutral orders screen: only surfaced for tenants that
        // actually use the orders module, so existing portals are untouched.
        try {
          const { count: ordersCount } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', linkedId);
          setHasOrders((ordersCount || 0) > 0);
        } catch { /* never break the portal on this optional probe */ }
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
  const payablesTotal = homeData?.kpis?.payables || 0;

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

  const tabIndexMap: Record<TabKey, number> = { home: 0, finance: 1, attendance: 2, reports: 3, more: 4 };
  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setActiveIndex(tabIndexMap[tab] ?? 0);
    setShowTasksPage(false);
    setShowRosterPage(false);
    setShowBranchHoursPage(false);
    setShowCampaignsPage(false);
    setShowFormsPage(false);
    setShowTrainingPage(false);
    setShowOrdersPage(false);
    setShowTrackingPage(false);
    setShowPettyCashPage(false);
    setShowLoyaltyPage(false);
  };

  const themeMode = darkMode ? 'dark' as const : 'light' as const;
  const today = new Date();
  const dateStr = today.toLocaleDateString('ar-PS', { day: 'numeric', month: 'long', year: 'numeric' });

  const navItems: { key: TabKey; label: string; icon: any }[] = [
    { key: 'home', label: 'الرئيسية', icon: Home },
    { key: 'finance', label: 'المالية', icon: Wallet },
    { key: 'attendance', label: 'الحضور', icon: Users },
    { key: 'reports', label: 'التقارير', icon: BarChart3 },
    { key: 'more', label: 'المزيد', icon: MoreHorizontal },
  ];

  const moreItems: { label: string; icon: any; color: string; group: string; action: () => void }[] = [
    { label: 'المهام', icon: ClipboardList, color: '#F59E0B', group: 'العمليات', action: () => { setShowMore(false); setShowEmployeeRequests(false); setShowRosterPage(false); setActiveTab('home'); setShowTasksPage(true); } },
    { label: 'طلبات الموظفين', icon: FileText, color: '#2563EB', group: 'الموارد البشرية', action: () => { setShowMore(false); setShowTasksPage(false); setShowRosterPage(false); setActiveTab('home'); setShowEmployeeRequests(true); } },
    { label: 'النماذج المُسندة', icon: FileText, color: '#0EA5E9', group: 'الموارد البشرية', action: () => { setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false); setShowRosterPage(false); setShowBranchHoursPage(false); setShowCampaignsPage(false); setActiveTab('home'); setShowFormsPage(true); } },
    { label: 'جداول الدوام', icon: CalendarClock, color: '#7C3AED', group: 'الموارد البشرية', action: () => { setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false); setActiveTab('home'); setShowRosterPage(true); } },
    { label: 'الورشات والدورات', icon: GraduationCap, color: '#059669', group: 'الموارد البشرية', action: () => { setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false); setShowRosterPage(false); setShowBranchHoursPage(false); setShowCampaignsPage(false); setShowFormsPage(false); setActiveTab('home'); setShowTrainingPage(true); } },
    { label: 'ساعات الفروع والمبيعات', icon: BarChart3, color: '#16A34A', group: 'التقارير', action: () => { setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false); setShowRosterPage(false); setActiveTab('home'); setShowBranchHoursPage(true); } },
    { label: 'برنامج الولاء', icon: Star, color: '#EAB308', group: 'التقارير', action: () => {
        setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false);
        setShowRosterPage(false); setShowBranchHoursPage(false); setShowCampaignsPage(false);
        setShowFormsPage(false); setShowTrainingPage(false); setShowOrdersPage(false);
        setShowTrackingPage(false); setShowPettyCashPage(false);
        setActiveTab('home'); setShowLoyaltyPage(true);
      } },
    { label: 'المتجر', icon: Store, color: '#DB2777', group: 'العمليات', action: () => { setShowMore(false); switchTab('reports'); } },
    ...(hasOrders || portalProfile === 'retail'
      ? [{ label: 'الطلبيات', icon: Package, color: '#0891B2', group: 'العمليات', action: () => {
          setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false);
          setShowRosterPage(false); setShowBranchHoursPage(false); setShowCampaignsPage(false);
          setShowFormsPage(false); setShowTrainingPage(false);
          setActiveTab('home'); setShowOrdersPage(true);
        } }]
      : []),
    { label: 'تتبع الطلبيات', icon: Timer, color: '#4F46E5', group: 'العمليات', action: () => {
        setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false);
        setShowRosterPage(false); setShowBranchHoursPage(false); setShowCampaignsPage(false);
        setShowFormsPage(false); setShowTrainingPage(false); setShowOrdersPage(false);
        setActiveTab('home'); setShowTrackingPage(true);
      } },
    { label: 'الموردين', icon: Factory, color: '#64748B', group: 'المالية', action: () => { setShowMore(false); switchTab('finance'); setFinanceSection('suppliers'); } },
    { label: 'كشف المصاريف النثرية', icon: Receipt, color: '#DC2626', group: 'المالية', action: () => {
        setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false);
        setShowRosterPage(false); setShowBranchHoursPage(false); setShowCampaignsPage(false);
        setShowFormsPage(false); setShowTrainingPage(false); setShowOrdersPage(false);
        setShowTrackingPage(false); setActiveTab('home'); setShowPettyCashPage(true);
      } },
    ...(CAMPAIGN_ALLOWED_EMAILS.includes((user?.email || '').toLowerCase())
      ? [{ label: 'العروض التسويقية', icon: Megaphone, color: '#F97316', group: 'التقارير', action: () => {
          setShowMore(false); setShowTasksPage(false); setShowEmployeeRequests(false);
          setShowRosterPage(false); setShowBranchHoursPage(false); setActiveTab('home');
          setShowCampaignsPage(true);
        } }]
      : []),
    { label: darkMode ? 'الوضع الفاتح' : 'الوضع الداكن', icon: darkMode ? Sun : Moon, color: '#334155', group: 'الإعدادات', action: toggleTheme },
    { label: 'تسجيل الخروج', icon: LogOut, color: '#EF4444', group: 'الإعدادات', action: () => { logout(); navigate('/auth'); } },
  ];

  const moreGroups = ['العمليات', 'الموارد البشرية', 'المالية', 'التقارير', 'الإعدادات']
    .map(g => ({ group: g, items: moreItems.filter(i => i.group === g) }))
    .filter(g => g.items.length > 0);

  // ═══════ MORE TAB — mobile card grid ═══════
  const renderMore = () => (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo', padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: c.textPrimary }}>المزيد</div>
        <div style={{ fontSize: 11, color: c.textMuted }}>كل الأدوات والتقارير في مكان واحد</div>
      </div>
      {moreGroups.map(g => (
        <div key={g.group} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.textSecondary, marginBottom: 8 }}>{g.group}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
            {g.items.map((item, i) => (
              <button key={i} onClick={() => { if (navigator.vibrate) navigator.vibrate(8); item.action(); }} style={{
                background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 16,
                padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 7, cursor: 'pointer', minHeight: 96,
                fontFamily: 'Cairo', direction: 'rtl',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 13, background: `${item.color}1A`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <item.icon size={19} color={item.color} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: c.textPrimary, textAlign: 'center',
                  lineHeight: 1.3, fontFamily: 'Cairo',
                }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );


  const renderContent = () => {
    if (showLoyaltyPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowLoyaltyPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalLoyaltyTab theme={themeMode} ownerId={linkedUserId || user?.user_id} />
        </div>
      );
    }
    if (showPettyCashPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowPettyCashPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalPettyCashTab theme={themeMode} />
        </div>
      );
    }
    if (showTrackingPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowTrackingPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalOrderTrackingTab />
        </div>
      );
    }
    if (showTasksPage) return <PortalTasksTab theme={themeMode} />;
    if (showTrainingPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowTrainingPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalTrainingTab theme={themeMode} />
        </div>
      );
    }
    if (showEmployeeRequests) return <PortalEmployeeRequestsTab theme={themeMode} />;
    if (showOrdersPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowOrdersPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalStoreTab theme={themeMode} />
        </div>
      );
    }
    if (showRosterPage) return <PortalRosterAssignmentsTab theme={themeMode} />;
    if (showFormsPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowFormsPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalFormsTab theme={themeMode} />
        </div>
      );
    }
    if (showCampaignsPage) {
      return (
        <div>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              onClick={() => setShowCampaignsPage(false)}
              style={{
                background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
              }}
            >← رجوع</button>
          </div>
          <PortalCampaignsTab theme={themeMode} />
        </div>
      );
    }
    if (showBranchHoursPage) {
      return (
        <div className="p-3">
          <button
            onClick={() => setShowBranchHoursPage(false)}
            className="mb-3 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80"
          >
            ← رجوع
          </button>
          <HRBranchHoursReport hideBack portalTheme={themeMode} />
        </div>
      );
    }
    switch (activeTab) {
      case 'home': return renderHome();
      case 'finance': return renderFinance();
      case 'attendance': return <PortalAttendanceTab theme={themeMode} />;
      case 'reports': return <PortalOverviewTab theme={themeMode} />;
      case 'more': return renderMore();
      default: return renderHome();
    }
  };

  // ═══════ HOME TAB — Owner Summary Dashboard ═══════
  const renderHome = () => {
    return (
      <PortalOwnerHomeSummary
        theme={themeMode}
        onOpenSalesDetail={() => { switchTab('finance'); setFinanceSection('sales'); }}
        onOpenFinance={() => { switchTab('finance'); setFinanceSection('menu'); }}
        onOpenLiquidity={() => { switchTab('finance'); setFinanceSection('liquidity'); }}
        onOpenReceivables={() => { switchTab('finance'); setFinanceSection('receivables'); }}
        onOpenSuppliers={() => { switchTab('finance'); setFinanceSection('suppliers'); }}
        onOpenAttendance={() => switchTab('attendance')}
        onOpenTasks={() => { setShowTasksPage(true); }}
        onOpenRoster={() => { setShowRosterPage(true); }}
        onOpenOrders={hasOrders || portalProfile === 'retail'
          ? () => {
              setShowTasksPage(false); setShowEmployeeRequests(false); setShowRosterPage(false);
              setShowBranchHoursPage(false); setShowCampaignsPage(false); setShowFormsPage(false);
              setShowTrainingPage(false); setShowOrdersPage(true);
            }
          : undefined}
      />
    );
  };

  // Legacy home (kept for reference, unused)
  const _renderLegacyHome = () => (
    <div>
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
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'Cairo', lineHeight: 1 }}>₪{fmtMoney(animatedReceivables)}</div>
        {topDebtors.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'Cairo', flexWrap: 'wrap' }}>
            {topDebtors.slice(0, 3).map((d: any, i: number) => (
              <span key={i}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }} />
                ₪{fmtMoney(d.balance)} {d.name}
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
          { label: 'مبيعات اليوم', value: fmtSigned(animatedSales), valueColor: undefined as string | undefined, color: darkMode ? '#60A5FA' : PRIMARY, onClick: () => { switchTab('finance'); setFinanceSection('sales'); }, badge: undefined as string | undefined },
          { label: 'الذمم الدائنة (للموردين)', value: fmtSigned(payablesTotal), valueColor: undefined, color: '#DC2626', onClick: () => { switchTab('finance'); setFinanceSection('suppliers'); }, badge: undefined },
          {
            label: 'السيولة الحالية',
            value: fmtSigned(animatedCash),
            valueColor: animatedCash < 0 ? '#DC2626' : undefined,
            color: animatedCash < 0 ? '#DC2626' : '#16A34A',
            onClick: () => { switchTab('finance'); setFinanceSection('liquidity'); },
            badge: animatedCash < 0 ? 'تنبيه: رصيد سالب' : undefined,
          },
          { label: 'مهام معلقة', value: '—', valueColor: undefined, color: '#F59E0B', onClick: () => { setShowTasksPage(true); }, badge: undefined },
        ].map((stat, i) => (
          <div key={i} onClick={stat.onClick} style={{
            background: c.cardBg, borderRadius: 16, padding: 18,
            border: `1px solid ${c.cardBorder}`, position: 'relative', overflow: 'hidden', cursor: 'pointer',
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: stat.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: 24, fontWeight: 800, color: stat.valueColor || c.textPrimary, fontFamily: 'Cairo' }}>{stat.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: c.textSecondary, marginTop: 2, fontFamily: 'Cairo' }}>{stat.label}</div>
            {stat.badge && (
              <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: 10, fontWeight: 700, fontFamily: 'Cairo' }}>
                {stat.badge}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: c.textPrimary, marginBottom: 12, fontFamily: 'Cairo' }}>إجراءات سريعة</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'الزبائن', icon: '👥', onClick: () => { switchTab('finance'); setFinanceSection('receivables'); } },
            { label: 'الموردين', icon: '🏭', onClick: () => { switchTab('finance'); setFinanceSection('suppliers'); } },
            { label: 'إرسال كشوفات', icon: '📤', onClick: () => { switchTab('finance'); setFinanceSection('receivables'); } },
            { label: 'مهمة جديدة', icon: '📋', onClick: () => { setShowTasksPage(true); } },
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
                if (act.type === 'income') { switchTab('finance'); setFinanceSection('sales'); }
                else if (act.type === 'payment') { switchTab('finance'); setFinanceSection('receivables'); }
                else if (act.type === 'expense') { switchTab('finance'); setFinanceSection('liquidity'); }
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
                  ₪{fmtMoney(act.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ═══════ FINANCE TAB — Card grid ═══════
  const renderFinance = () => {
    if (financeSection !== 'menu') {
      const titles: Record<Exclude<FinanceSectionKey, 'menu'>, string> = {
        sales: 'المبيعات', liquidity: 'السيولة', receivables: 'الزبائن', suppliers: 'الموردين',
      };
      return (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 4px',
          }}>
            <button onClick={() => setFinanceSection('menu')} style={{
              background: c.chipBg, border: `1px solid ${c.chipBorder}`, borderRadius: 10,
              padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              color: c.textPrimary, fontFamily: 'Cairo', fontSize: 12,
            }}>
              <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              المالية
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary, fontFamily: 'Cairo' }}>
              {titles[financeSection]}
            </span>
          </div>
          <div style={{ padding: '0 12px' }}>
            {financeSection === 'sales' && <PortalOwnerSalesHome theme={themeMode} />}
            {financeSection === 'liquidity' && <PortalLiquidityTab data={liquidityData} loading={dataLoading} theme={themeMode} />}
            {financeSection === 'receivables' && <PortalReceivablesTab theme={themeMode} portalCompanyName={companyName} portalLinkedUserId={linkedUserId} />}
            {financeSection === 'suppliers' && <PortalSuppliersTab theme={themeMode} portalCompanyName={companyName} portalLinkedUserId={linkedUserId} />}
          </div>
        </div>
      );
    }

    const cards: { key: Exclude<FinanceSectionKey,'menu'>; label: string; sub: string; icon: any; accent: string; value?: string }[] = [
      { key: 'sales', label: 'المبيعات', sub: 'تفاصيل المبيعات حسب الفرع والصنف', icon: Wallet, accent: '#0EA5E9', value: fmtSigned(salesToday) },
      { key: 'liquidity', label: 'السيولة', sub: 'الصناديق والبنوك', icon: HandCoins, accent: animatedCash < 0 ? '#DC2626' : '#16A34A', value: fmtSigned(cashBalance) },
      { key: 'receivables', label: 'الزبائن', sub: 'الذمم المدينة', icon: Users, accent: '#8B5CF6', value: fmtSigned(receivablesTotal) },
      { key: 'suppliers', label: 'الموردين', sub: 'الذمم الدائنة', icon: Factory, accent: '#F59E0B', value: fmtSigned(payablesTotal) },
    ];

    return (
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.textPrimary, marginBottom: 4, fontFamily: 'Cairo' }}>
          مركز المالية
        </div>
        <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 14, fontFamily: 'Cairo' }}>
          اختر القسم الذي تريد استعراضه
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <button key={card.key} onClick={() => setFinanceSection(card.key)} style={{
                textAlign: 'right', background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                borderRadius: 16, padding: 16, cursor: 'pointer', position: 'relative',
                overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8,
                minHeight: 130, fontFamily: 'Cairo',
              }}>
                <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: card.accent }} />
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: `${card.accent}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.accent,
                }}>
                  <Icon size={18} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>{card.label}</div>
                {card.value && (
                  <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary, fontFamily: 'JetBrains Mono, monospace' }}>
                    {card.value}
                  </div>
                )}
                <div style={{ fontSize: 10, color: c.textSecondary }}>{card.sub}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: c.pageBg,
      color: c.textPrimary,
      fontFamily: 'Cairo, sans-serif',
      direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>

      {/* ═══════ HEADER ═══════ */}
      <div style={{
        flexShrink: 0,
        padding: '6px 14px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        background: c.headerBg,
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        direction: 'rtl',
      }}>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Cairo', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getGreeting()} {user?.full_name?.split(' ')[0] || ''} 👋
          </div>
          <div style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.45)', fontFamily: 'Cairo', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {(companyName || 'بوابة الإدارة')} · {dateStr}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <button onClick={handleRefresh} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <RefreshCw size={14} color="rgba(255,255,255,0.7)" style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
          <PortalNotificationsBell
            onOpenPath={(path) => {
              if (path.includes('tab=requests')) setShowEmployeeRequests(true);
            }}
          />
          <button onClick={toggleTheme} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            {darkMode ? <Sun size={14} color="rgba(255,255,255,0.7)" /> : <Moon size={14} color="rgba(255,255,255,0.7)" />}
          </button>
          <button onClick={() => { logout(); navigate('/auth'); }} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <LogOut size={14} color="rgba(255,255,255,0.7)" />
          </button>
        </div>
      </div>

      {/* ═══════ PAGE CONTENT ═══════ */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 24 }}>
          {renderContent()}
        </div>
      </div>

      {/* ═══════ MORE BOTTOM SHEET ═══════ */}
      {showMore && (
        <div onClick={() => setShowMore(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 55,
        }} />
      )}
      <div style={{
        position: 'fixed',
        bottom: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        transform: showMore ? 'translateY(0)' : 'translateY(120%)',
        pointerEvents: showMore ? 'auto' : 'none',
        visibility: showMore ? 'visible' : 'hidden',
        maxHeight: `calc(100dvh - ${NAV_HEIGHT}px - 80px)`,
        overflowY: 'auto',
        left: 0, right: 0,
        background: c.sheetBg,
        borderRadius: '24px 24px 0 0',
        padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s',
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

      {/* ═══════ BOTTOM NAV ═══════ */}
      <nav style={{
        flexShrink: 0, zIndex: 50, direction: 'rtl' as const,
      }}>
        <div style={{
          background: darkMode ? '#111111' : '#0D1B2E',
          borderRadius: '20px 20px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          height: NAV_HEIGHT,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        }}>
          {navItems.map((item, idx) => {
            const isActive = idx === activeIndex;
            const Icon = item.icon;
            const navBg = darkMode ? '#111111' : '#0D1B2E';
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  if (item.key === 'more') { setShowMore(prev => !prev); return; }
                  setActiveTab(item.key);
                  setActiveIndex(idx);
                  setShowMore(false);
                  setShowTasksPage(false);
                  setShowEmployeeRequests(false);
                  scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, position: 'relative',
                }}
              >
                <div style={{
                  width: isActive ? 46 : 36, height: isActive ? 46 : 36,
                  borderRadius: '50%',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: isActive ? '0 2px 12px rgba(0,0,0,0.15)' : 'none',
                }}>
                  <Icon size={isActive ? 22 : 20} color={isActive ? navBg : 'rgba(255,255,255,0.4)'} strokeWidth={isActive ? 2.2 : 1.5} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: isActive ? 700 : 400,
                  fontFamily: 'Cairo',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.3s ease', marginTop: -2,
                }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showProfileDialog && (
        <PortalBusinessProfileDialog theme={themeMode} onClose={() => setShowProfileDialog(false)} />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

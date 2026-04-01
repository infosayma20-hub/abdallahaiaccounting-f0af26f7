import { useState, useEffect } from "react";
import { Loader2, Clock, EyeOff, Eye, Keyboard, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDashboardData } from "@/hooks/useDashboardData";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import KPIMegaRow from "@/components/dashboard/KPIMegaRow";
import RevenueExpenseChart from "@/components/dashboard/RevenueExpenseChart";

import CashFlowWidget from "@/components/dashboard/CashFlowWidget";
import AgingWidget from "@/components/dashboard/AgingWidget";
import RecentActivityWidget from "@/components/dashboard/RecentActivityWidget";
import ChequesCalendarWidget from "@/components/dashboard/ChequesCalendarWidget";
import InventoryPulseWidget from "@/components/dashboard/InventoryPulseWidget";
import TopSellingWidget from "@/components/dashboard/TopSellingWidget";
import ExchangeRatesWidget from "@/components/dashboard/ExchangeRatesWidget";
import CompleteProfileDialog from "@/components/CompleteProfileDialog";
import CustomizeDashboardDialog, { loadWidgetConfig, type DashboardWidgetConfig } from "@/components/dashboard/CustomizeDashboardDialog";

import JournalEntryPopup from "@/components/JournalEntryPopup";
import AccountStatementModal from "@/components/AccountStatementModal";
import ContactStatementModal from "@/components/ContactStatementModal";

// ─── Shortcuts Help Dialog ───
const ShortcutsHelpDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  const shortcuts = [
    { key: 'F1', label: 'سند قبض', icon: '🏦' },
    { key: 'F2', label: 'سند صرف', icon: '💸' },
    { key: 'F3', label: 'إنشاء فاتورة', icon: '🧾' },
    { key: 'F4', label: 'سند قيد محاسبي', icon: '📋' },
    { key: 'F5', label: 'كشف حساب عميل', icon: '👤' },
    { key: 'F6', label: 'كشف حساب محاسبي', icon: '📊' },
    { key: 'F7', label: 'التقرير الذكي', icon: '✨' },
    { key: 'F8', label: 'إنشاء شيك', icon: '💳' },
    { key: 'Esc', label: 'إغلاق النوافذ', icon: '✕' },
    { key: '?', label: 'عرض / إخفاء هذه النافذة', icon: '⌨️' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg">⌨️</div>
            <div>
              <h3 className="text-sm font-bold text-foreground">اختصارات لوحة المفاتيح</h3>
              <p className="text-[11px] text-muted-foreground">اضغط ? في أي وقت لعرض هذه النافذة</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {shortcuts.map(({ key, label, icon }) => (
            <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-base">{icon}</span>
                <span className="text-sm text-foreground">{label}</span>
              </div>
              <kbd className="px-2.5 py-1 rounded-lg bg-secondary border border-border text-xs font-mono font-bold text-muted-foreground min-w-[40px] text-center">{key}</kbd>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5" />
            الاختصارات لا تعمل أثناء الكتابة في حقل النص
          </p>
        </div>
      </div>
    </div>
  );
};

const HomeDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const dashboard = useDashboardData();

  
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showJournalEntry, setShowJournalEntry] = useState(false);
  const [journalEntryData, setJournalEntryData] = useState<any>(null);
  const [journalEntryAccounts, setJournalEntryAccounts] = useState<any[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAccountStatement, setShowAccountStatement] = useState(false);
  const [showContactStatement, setShowContactStatement] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(() => {
    try { return localStorage.getItem("dashboard_privacy") === "true"; } catch { return false; }
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<DashboardWidgetConfig[]>(loadWidgetConfig());
  const isVisible = (id: string) => widgetConfig.find(w => w.id === id)?.visible !== false;

  // Setup wizard - now handled by /setup route, no longer needed here


  // Keyboard shortcuts
  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (e.key === 'Escape') { setShowJournalEntry(false); setShowShortcuts(false); return; }
      if (e.key === '?' && !isTyping) { e.preventDefault(); setShowShortcuts((p) => !p); return; }
      if (isTyping) return;
      switch (e.key) {
        case 'F1': e.preventDefault(); navigate('/transactions'); break;
        case 'F2': e.preventDefault(); navigate('/transactions'); break;
        case 'F3': e.preventDefault(); navigate('/invoices'); break;
        case 'F4': e.preventDefault(); setShowJournalEntry(true); break;
        case 'F5': e.preventDefault(); setShowContactStatement(true); break;
        case 'F6': e.preventDefault(); setShowAccountStatement(true); break;
        case 'F7': e.preventDefault(); navigate('/smart-report'); break;
        case 'F8': e.preventDefault(); navigate('/cheques'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, isMobile]);

  const displayName = dashboard.profileData?.company_name || dashboard.profileData?.display_name || user?.user_metadata?.company_name || "شركتي";

  return (
    <div className="space-y-0 max-w-[1600px] mx-auto animate-fade-in" dir="rtl">
      {user && <CompleteProfileDialog open={showProfileDialog} onClose={() => setShowProfileDialog(false)} user={user} />}




      {/* Privacy overlay */}
      <div className="relative">
        {privacyMode && (
          <div className="absolute inset-0 z-10 backdrop-blur-lg bg-background/40 rounded-2xl flex items-center justify-center">
            <div className="text-center space-y-3 p-6">
              <EyeOff className="h-8 w-8 text-muted-foreground mx-auto" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground font-medium">البيانات المالية مخفية</p>
              <button onClick={() => { setPrivacyMode(false); localStorage.setItem("dashboard_privacy", "false"); }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all">
                إظهار البيانات
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-4">
          {/* W1: Header - always interactive */}
          <DashboardHeader
            companyName={displayName}
            companyLogo={dashboard.companyLogo}
            period={dashboard.period}
            onPeriodChange={dashboard.setPeriod}
            lastUpdated={dashboard.lastUpdated}
            onRefresh={dashboard.refresh}
            onCustomize={() => setCustomizeOpen(true)}
            loading={dashboard.loading}
            privacyMode={privacyMode}
            onTogglePrivacy={() => {
              const next = !privacyMode;
              setPrivacyMode(next);
              localStorage.setItem("dashboard_privacy", String(next));
            }}
          />
          <div className={privacyMode ? "select-none pointer-events-none col-span-12 grid grid-cols-12 gap-4" : "col-span-12 grid grid-cols-12 gap-4"}>
            {isVisible("kpis") && <KPIMegaRow kpis={dashboard.kpis} sparklines={dashboard.sparklines} loading={dashboard.loading} />}

            {isVisible("revenue-chart") && (
              <RevenueExpenseChart
                data={dashboard.chartData}
                grouping={dashboard.chartGrouping}
                onGroupingChange={dashboard.setChartGrouping}
                loading={dashboard.loading}
              />
            )}

            {isVisible("recent-activity") && <RecentActivityWidget activities={dashboard.recentActivity} loading={dashboard.loading} />}
            {isVisible("top-selling") && <TopSellingWidget items={dashboard.topSellingItems} loading={dashboard.loading} />}
            {isVisible("cash-flow") && <CashFlowWidget data={dashboard.cashFlowData} cashBalance={dashboard.kpis.cashBalance} loading={dashboard.loading} />}
            {isVisible("aging") && <AgingWidget receivables={dashboard.agingData.receivables} payables={dashboard.agingData.payables} loading={dashboard.loading} />}
            {isVisible("inventory") && <InventoryPulseWidget alerts={dashboard.inventoryAlerts} summary={dashboard.inventorySummary} loading={dashboard.loading} />}
            {isVisible("cheques") && <ChequesCalendarWidget cheques={dashboard.upcomingCheques} loading={dashboard.loading} />}
            {isVisible("exchange-rates") && <ExchangeRatesWidget />}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showJournalEntry && (
        <JournalEntryPopup
          open={showJournalEntry}
          onClose={() => setShowJournalEntry(false)}
          onSuccess={() => setShowJournalEntry(false)}
          initialData={journalEntryData}
          accounts={journalEntryAccounts}
        />
      )}
      
      <ShortcutsHelpDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <AccountStatementModal open={showAccountStatement} onClose={() => setShowAccountStatement(false)} />
      <ContactStatementModal open={showContactStatement} onClose={() => setShowContactStatement(false)} />
    </div>
  );
};

export default HomeDashboard;

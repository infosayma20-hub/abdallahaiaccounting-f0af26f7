import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/layout/PageHeader";
import { Building2, User, Wallet, FileText, ShoppingCart, Package, Users, Bell, Shield, Link2, Printer, Brain, Search, RotateCcw, Monitor, GitBranch, Receipt, HardDrive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Skeleton } from "@/components/ui/skeleton";
import CompanySettingsSection from "@/components/settings/CompanySettingsSection";
import FinanceSettingsSection from "@/components/settings/FinanceSettingsSection";
import InvoiceSettingsSection from "@/components/settings/InvoiceSettingsSection";
import POSSettingsSection from "@/components/settings/POSSettingsSection";
import PrintSettingsSection from "@/components/settings/PrintSettingsSection";
import PortalSettingsSection from "@/components/settings/PortalSettingsSection";
import UsersSettingsSection from "@/components/settings/UsersSettingsSection";
import InventorySettingsSection from "@/components/settings/InventorySettingsSection";
import HRSettingsSection from "@/components/settings/HRSettingsSection";
import NotificationsSettingsSection from "@/components/settings/NotificationsSettingsSection";
import SecuritySettingsSection from "@/components/settings/SecuritySettingsSection";
import IntegrationsSettingsSection from "@/components/settings/IntegrationsSettingsSection";
import AISettingsSection from "@/components/settings/AISettingsSection";
import BranchesSettingsSection from "@/components/settings/BranchesSettingsSection";
import TaxSettingsInline from "@/components/tax/TaxSettingsSection";
import BackupSettingsSection from "@/components/settings/BackupSettingsSection";
import { multiWordMatchAny } from "@/lib/utils";

const sections = [
  { id: "company", label: "الشركة", icon: Building2, ready: true, keywords: "شركة اسم عنوان هاتف بريد ضريبة عملة تقويم سنة مالية لوغو" },
  { id: "branches", label: "الأفرع", icon: GitBranch, ready: true, keywords: "فرع أفرع موقع فروع سفيان فيصل رام الله" },
  { id: "user", label: "المستخدمون", icon: User, ready: true, keywords: "مستخدم صلاحيات دور موظف فريق" },
  { id: "finance", label: "المالية", icon: Wallet, ready: true, keywords: "مالية حسابات قيود محاسبة ميزان" },
  { id: "invoices", label: "الفواتير", icon: FileText, ready: true, keywords: "فاتورة فواتير قالب ضريبة خصم" },
  { id: "pos", label: "نقطة البيع", icon: ShoppingCart, ready: true, keywords: "كاشير نقطة بيع طاولات محطات مطبخ طابعة طابعات شبكة" },
  { id: "inventory", label: "المخزون", icon: Package, ready: true, keywords: "مخزون منتج صنف كمية مستودع" },
  { id: "hr", label: "الموارد البشرية", icon: Users, ready: true, keywords: "موظفين رواتب حضور إجازات فروع" },
  { id: "notifications", label: "الإشعارات", icon: Bell, ready: true, keywords: "إشعار تنبيه رسالة" },
  { id: "security", label: "الأمان", icon: Shield, ready: true, keywords: "أمان كلمة مرور مصادقة حماية" },
  { id: "integrations", label: "التكاملات", icon: Link2, ready: true, keywords: "تكامل ربط API واتساب" },
  { id: "print", label: "الطباعة", icon: Printer, ready: true, keywords: "طباعة طابعة ورق إيصال فاتورة" },
  { id: "portal", label: "بوابة الإدارة", icon: Monitor, ready: true, keywords: "بوابة إدارة تقارير مراقبة" },
  { id: "ai", label: "الذكاء الاصطناعي", icon: Brain, ready: true, keywords: "ذكاء اصطناعي مساعد حسيب" },
  { id: "tax", label: "الضريبة", icon: Receipt, ready: true, keywords: "ضريبة قيمة مضافة VAT تقرير دوري" },
  { id: "backup", label: "النسخ الاحتياطي", icon: HardDrive, ready: true, keywords: "نسخة احتياطية تصدير بيانات backup export" },
];

const SettingsPage = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState("company");
  const [search, setSearch] = useState("");
  const [taxOwnerId, setTaxOwnerId] = useState("");
  const { settings, loading, saving, hasChanges, updateSettings, saveSettings, resetToDefaults } = useCompanySettings();

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => setTaxOwnerId(data || user.id));
  }, [user]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section && sections.some(s => s.id === section)) setActiveSection(section);
  }, [searchParams]);

  const filteredSections = useMemo(() => {
    if (!search) return sections;
    return sections.filter(s => multiWordMatchAny(search, s.label, s.keywords));
  }, [search]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-6 p-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      );
    }

    switch (activeSection) {
      case "user":
        return <UsersSettingsSection />;
      case "company":
        return <CompanySettingsSection settings={settings} onChange={updateSettings} />;
      case "branches":
        return <BranchesSettingsSection />;
      case "finance":
        return <FinanceSettingsSection settings={settings} onChange={updateSettings} />;
      case "invoices":
        return <InvoiceSettingsSection settings={settings} onChange={updateSettings} />;
      case "pos":
        return <POSSettingsSection settings={settings} onChange={updateSettings} />;
      case "print":
        return <PrintSettingsSection settings={settings} onChange={updateSettings} />;
      case "portal":
        return <PortalSettingsSection />;
      case "inventory":
        return <InventorySettingsSection settings={settings} onChange={updateSettings} />;
      case "hr":
        return <HRSettingsSection settings={settings} onChange={updateSettings} />;
      case "notifications":
        return <NotificationsSettingsSection settings={settings} onChange={updateSettings} />;
      case "security":
        return <SecuritySettingsSection settings={settings} onChange={updateSettings} />;
      case "integrations":
        return <IntegrationsSettingsSection settings={settings} onChange={updateSettings} />;
      case "ai":
        return <AISettingsSection settings={settings} onChange={updateSettings} />;
      case "tax":
        return <TaxSettingsInline ownerId={taxOwnerId} />;
      case "backup":
        return <BackupSettingsSection />;
      default:
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center space-y-2">
              <div className="text-4xl">🚧</div>
              <p className="font-medium">قريباً</p>
              <p className="text-sm">هذا القسم قيد التطوير</p>
            </div>
          </div>
        );
    }
  };

  const activeLabel = sections.find(s => s.id === activeSection)?.label || "";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="الإعدادات" breadcrumb={["النظام", "الإعدادات"]} />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        <Input
          placeholder="ابحث في الإعدادات..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-9 rounded-xl bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>

      {/* Main Layout */}
      <div className="flex gap-6 min-h-[calc(100vh-220px)]">
        {/* Sidebar */}
        <div className="w-56 shrink-0">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <ScrollArea className="h-[calc(100vh-260px)]">
              <div className="p-2 space-y-0.5">
                {filteredSections.map(section => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-muted/60"
                      } ${!section.ready && !isActive ? "opacity-60" : ""}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{section.label}</span>
                      {!section.ready && (
                        <span className="mr-auto text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">قريباً</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Section Header */}
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{activeLabel}</h2>
              {hasChanges && (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full">
                  تغييرات غير محفوظة
                </span>
              )}
            </div>

            {/* Section Content */}
            <ScrollArea className="h-[calc(100vh-370px)]">
              {renderContent()}
            </ScrollArea>

            {/* Footer Actions */}
            {activeSection !== "tax" && (
            <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefaults}
                className="text-muted-foreground gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                استعادة الافتراضي
              </Button>
              <div className="flex gap-2">
                {hasChanges && (
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    إهمال
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={saveSettings}
                  disabled={!hasChanges || saving}
                  className="gap-2 min-w-24"
                >
                  {saving ? "جارِ الحفظ..." : "💾 حفظ"}
                </Button>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

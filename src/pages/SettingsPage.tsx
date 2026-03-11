import { useState, useMemo } from "react";
import { Building2, User, Wallet, FileText, ShoppingCart, Package, Users, Bell, Shield, Link2, Printer, Brain, Search, RotateCcw, Monitor } from "lucide-react";
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

const sections = [
  { id: "company", label: "الشركة", icon: Building2, ready: true },
  { id: "user", label: "المستخدم", icon: User, ready: false },
  { id: "finance", label: "المالية", icon: Wallet, ready: true },
  { id: "invoices", label: "الفواتير", icon: FileText, ready: true },
  { id: "pos", label: "نقطة البيع", icon: ShoppingCart, ready: true },
  { id: "inventory", label: "المخزون", icon: Package, ready: false },
  { id: "hr", label: "الموارد البشرية", icon: Users, ready: false },
  { id: "notifications", label: "الإشعارات", icon: Bell, ready: false },
  { id: "security", label: "الأمان", icon: Shield, ready: false },
  { id: "integrations", label: "التكاملات", icon: Link2, ready: false },
  { id: "print", label: "الطباعة", icon: Printer, ready: true },
  { id: "portal", label: "بوابة الإدارة", icon: Monitor, ready: true },
  { id: "ai", label: "الذكاء الاصطناعي", icon: Brain, ready: false },
];

const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState("company");
  const [search, setSearch] = useState("");
  const { settings, loading, saving, hasChanges, updateSettings, saveSettings, resetToDefaults } = useCompanySettings();

  const filteredSections = useMemo(() => {
    if (!search) return sections;
    return sections.filter(s => s.label.includes(search));
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
      case "company":
        return <CompanySettingsSection settings={settings} onChange={updateSettings} />;
      case "finance":
        return <FinanceSettingsSection settings={settings} onChange={updateSettings} />;
      case "invoices":
        return <InvoiceSettingsSection settings={settings} onChange={updateSettings} />;
      case "pos":
        return <POSSettingsSection settings={settings} onChange={updateSettings} />;
      case "print":
        return <PrintSettingsSection settings={settings} onChange={updateSettings} />;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">⚙️ الإعدادات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات النظام والشركة</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث في الإعدادات..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

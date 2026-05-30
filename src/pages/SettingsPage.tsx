import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, User, Wallet, FileText, ShoppingCart, Package, Users, Bell, Shield,
  Link2, Printer, Brain, RotateCcw, Monitor, GitBranch, Receipt, HardDrive,
  Save, RefreshCw, Inbox,
} from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/hooks/usePermission";
import LockedModulePage from "@/components/layout/LockedModulePage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SettingsShell, SettingsSidebar, UnsavedChangesBar, SettingsEmptyState,
  type SettingsSidebarItem, type SettingsActionGroup,
} from "@/components/settings/shell";
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

/** Section catalog — ordered to match the navigation spec. */
const SECTIONS = [
  { id: "company", label: "الشركة", icon: Building2, keywords: "شركة اسم عنوان هاتف بريد عملة تقويم سنة مالية شعار لوغو" },
  { id: "branches", label: "الأفرع", icon: GitBranch, keywords: "فرع أفرع موقع فروع رام الله" },
  { id: "user", label: "المستخدمون والصلاحيات", icon: User, keywords: "مستخدم صلاحيات دور موظف فريق" },
  { id: "finance", label: "المالية", icon: Wallet, keywords: "مالية حسابات قيود محاسبة ميزان ترقيم فترات" },
  { id: "invoices", label: "الفواتير", icon: FileText, keywords: "فاتورة فواتير قالب خصم دفع آجل" },
  { id: "pos", label: "نقطة البيع", icon: ShoppingCart, keywords: "كاشير نقطة بيع طاولات محطات مطبخ طابعة شبكة وردية" },
  { id: "inventory", label: "المخزون", icon: Package, keywords: "مخزون منتج صنف كمية مستودع باركود" },
  { id: "hr", label: "الموارد البشرية", icon: Users, keywords: "موظفين رواتب حضور إجازات HR دوام" },
  { id: "notifications", label: "الإشعارات", icon: Bell, keywords: "إشعار تنبيه رسالة بريد" },
  { id: "security", label: "الأمان", icon: Shield, keywords: "أمان كلمة مرور مصادقة حماية" },
  { id: "integrations", label: "التكاملات", icon: Link2, keywords: "تكامل ربط API واتساب SMTP SMS" },
  { id: "print", label: "الطباعة", icon: Printer, keywords: "طباعة طابعة ورق إيصال قالب فاتورة" },
  { id: "portal", label: "بوابة الإدارة", icon: Monitor, keywords: "بوابة إدارة تقارير مراقبة" },
  { id: "ai", label: "الذكاء الاصطناعي", icon: Brain, keywords: "ذكاء اصطناعي مساعد حسيب OCR" },
  { id: "tax", label: "الضريبة", icon: Receipt, keywords: "ضريبة قيمة مضافة VAT تقرير دوري" },
  { id: "backup", label: "النسخ الاحتياطي", icon: HardDrive, keywords: "نسخة احتياطية تصدير بيانات backup export" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Sections that aren't part of the central company_settings save flow. */
const SELF_SAVED: SectionId[] = ["tax", "backup", "branches", "user", "portal"];

const SettingsPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<SectionId>("company");
  const [search, setSearch] = useState("");
  const [taxOwnerId, setTaxOwnerId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const { settings, loading, saving, hasChanges, updateSettings, saveSettings, resetToDefaults, loadSettings } =
    useCompanySettings();
  const settingsPerm = usePermission("settings");

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) =>
      setTaxOwnerId(data || user.id)
    );
  }, [user]);

  useEffect(() => {
    const section = searchParams.get("section") as SectionId | null;
    if (section && SECTIONS.some((s) => s.id === section)) setActiveSection(section);
  }, [searchParams]);

  const handleSelect = (id: string) => {
    setActiveSection(id as SectionId);
    const next = new URLSearchParams(searchParams);
    next.set("section", id);
    setSearchParams(next, { replace: true });
  };

  const sidebarItems: SettingsSidebarItem[] = useMemo(() => {
    const base = SECTIONS.filter((s) => (s.id === "user" ? settingsPerm.can("users", "manage") : true));
    const filtered = search
      ? base.filter((s) => multiWordMatchAny(search, s.label, s.keywords))
      : base;
    return filtered.map((s) => ({ id: s.id, label: s.label, icon: s.icon }));
  }, [search, settingsPerm]);

  const activeIsSelfSaved = SELF_SAVED.includes(activeSection);
  const showUnsavedBar = !activeIsSelfSaved && hasChanges;

  const actionGroups: SettingsActionGroup[] = useMemo(() => {
    const groups: SettingsActionGroup[] = [];

    // Save group — only meaningful for sections that share the company_settings save flow
    if (!activeIsSelfSaved) {
      groups.push({
        key: "save",
        label: "حفظ",
        items: [
          {
            key: "save",
            label: "حفظ التغييرات",
            icon: Save,
            variant: "primary",
            onClick: saveSettings,
            disabled: !hasChanges || saving,
            loading: saving,
            tooltip: hasChanges ? "حفظ التغييرات" : "لا توجد تغييرات",
          },
        ],
      });
    }

    groups.push({
      key: "actions",
      label: "إجراءات",
      items: [
        {
          key: "reload",
          label: "إعادة تحميل",
          icon: RefreshCw,
          onClick: () => loadSettings(),
          disabled: loading,
        },
        {
          key: "reset",
          label: "استعادة الافتراضي",
          icon: RotateCcw,
          variant: "danger",
          onClick: () => setConfirmReset(true),
          disabled: activeIsSelfSaved || loading,
          tooltip: activeIsSelfSaved
            ? "هذا القسم يحفظ بياناته بشكل منفصل"
            : "استعادة جميع إعدادات الشركة إلى الافتراضي",
        },
      ],
    });

    return groups;
  }, [activeIsSelfSaved, hasChanges, saving, loading, saveSettings, loadSettings]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-4 p-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      );
    }

    switch (activeSection) {
      case "user":
        if (!settingsPerm.can("users", "manage")) {
          return <LockedModulePage moduleName="إدارة المستخدمين" />;
        }
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
          <div className="p-6">
            <SettingsEmptyState
              icon={Inbox}
              title="القسم غير متوفر"
              description="هذا القسم غير متاح حالياً."
            />
          </div>
        );
    }
  };

  return (
    <SettingsShell
      title="الإعدادات"
      subtitle="إدارة إعدادات الشركة، المالية، الفواتير، التشغيل، الأمان والتكاملات."
      breadcrumb={[{ label: "النظام" }, { label: "الإعدادات" }]}
      actionGroups={actionGroups}
    >
      <div className="flex h-full min-h-0">
        {/* Content (RTL: appears to the left of sidebar) */}
        <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {renderContent()}
          </div>
          <UnsavedChangesBar
            visible={showUnsavedBar}
            saving={saving}
            onSave={saveSettings}
            onDiscard={() => loadSettings()}
          />
        </main>

        {/* Sidebar (right side in RTL) */}
        <SettingsSidebar
          items={sidebarItems}
          activeId={activeSection}
          onSelect={handleSelect}
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>استعادة الإعدادات الافتراضية؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم استبدال إعدادات الشركة الحالية بالقيم الافتراضية. لن يتم الحفظ حتى تضغط
              "حفظ التغييرات" من شريط الأوامر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetToDefaults();
                setConfirmReset(false);
              }}
            >
              استعادة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsShell>
  );
};

export default SettingsPage;

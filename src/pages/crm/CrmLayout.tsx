import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Kanban, ListChecks, UserCircle2, Ticket, Phone, Calendar, Lightbulb, FileSignature, BookOpen, Repeat, Briefcase } from "lucide-react";
import CrmQuickActionsFab from "./components/CrmQuickActionsFab";
import CrmGlobalSearch from "./components/CrmGlobalSearch";

const tabs = [
  { path: "/crm/workbench",    label: "مركز العمل اليومي", icon: Briefcase },
  { path: "/crm",              label: "لوحة CRM",     icon: LayoutDashboard, exact: true },
  { path: "/crm/leads",        label: "العملاء المحتملون", icon: Users },
  { path: "/crm/pipeline",     label: "خط سير المبيعات",  icon: Kanban },
  { path: "/crm/activities",   label: "المتابعات",     icon: ListChecks },
  { path: "/crm/customers",    label: "ملف العميل 360", icon: UserCircle2 },
  { path: "/crm/tickets",      label: "تذاكر الدعم",     icon: Ticket },
  { path: "/crm/calls",        label: "المكالمات",       icon: Phone },
  { path: "/crm/meetings",     label: "الاجتماعات",      icon: Calendar },
  { path: "/crm/feature-requests", label: "طلبات الميزات", icon: Lightbulb },
  { path: "/crm/contracts",    label: "العقود",          icon: FileSignature },
  { path: "/crm/knowledge-base", label: "قاعدة المعرفة", icon: BookOpen },
  { path: "/crm/renewals",     label: "مركز التجديدات",   icon: Repeat },
];

export default function CrmLayout() {
  const location = useLocation();

  return (
    <div dir="rtl">
      {/* Module nav bar */}
      <div className="mb-4 -mx-5 lg:-mx-8 -mt-5 lg:-mt-8 px-5 lg:px-8 pt-4 pb-0 bg-white border-b border-slate-200 relative z-10">
        <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1B3A5C, #2C5985)" }}>
              <Users className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">إدارة علاقات العملاء</h1>
              <p className="text-[11px] text-slate-500">من عميل محتمل إلى صفقة مغلقة وفاتورة محصّلة</p>
            </div>
          </div>
          <CrmGlobalSearch />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto -mb-px">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? location.pathname === tab.path
              : location.pathname.startsWith(tab.path);
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.exact}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "text-blue-700 border-blue-600"
                    : "text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      <div className="pt-4">
        <Outlet />
      </div>
      <CrmQuickActionsFab />
    </div>
  );
}

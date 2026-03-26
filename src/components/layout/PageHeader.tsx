/**
 * PageHeader — Qoyod-style navy banner for page titles.
 * Breadcrumbs are right-aligned and clickable for navigation.
 */
import { useNavigate } from "react-router-dom";

/** Map Arabic breadcrumb labels → routes */
const breadcrumbRoutes: Record<string, string> = {
  "الرئيسية": "/dashboard",
  "المحاسبة": "/accounts",
  "المبيعات": "/invoices",
  "المالية": "/finance",
  "التقارير": "/reports",
  "شجرة الحسابات": "/accounts",
  "الفواتير": "/invoices",
  "القيود": "/journal-entries",
  "القيود المحاسبية": "/journal-entries",
  "الحركات المحاسبية": "/transactions",
  "جهات الاتصال": "/contacts",
  "العملاء": "/contacts",
  "الموردين": "/contacts",
  "إدارة المخزون": "/inventory",
  "المنتجات": "/inventory",
  "المخزون": "/inventory",
  "الموارد البشرية": "/employees",
  "الموظفين": "/employees",
  "النظام": "/settings",
  "الإعدادات": "/settings",
  "نقطة البيع": "/pos",
  "قائمة الدخل": "/profit-loss",
  "قائمة المركز المالي": "/balance-sheet",
  "ميزان المراجعة": "/trial-balance",
};

interface PageHeaderProps {
  title: string;
  breadcrumb?: string[];
}

export default function PageHeader({ title, breadcrumb }: PageHeaderProps) {
  const navigate = useNavigate();

  const handleCrumbClick = (label: string) => {
    const route = breadcrumbRoutes[label];
    if (route) navigate(route);
  };

  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="text-[13px] text-muted-foreground mb-2 flex items-center gap-1 justify-end flex-wrap" dir="rtl">
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1;
            const hasRoute = !isLast && breadcrumbRoutes[item];
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="mx-1 text-muted-foreground/40">/</span>}
                {hasRoute ? (
                  <button
                    onClick={() => handleCrumbClick(item)}
                    className="hover:text-primary hover:underline transition-colors cursor-pointer"
                  >
                    {item}
                  </button>
                ) : (
                  <span className={isLast ? "text-foreground font-medium" : ""}>{item}</span>
                )}
              </span>
            );
          })}
        </div>
      )}
      <div className="w-full rounded-xl overflow-hidden" style={{ borderTop: "3px solid #1B3A5C" }}>
        <div
          className="w-full px-6 py-4"
          style={{ backgroundColor: "#5B9BD5" }}
        >
          <h1
            className="text-right text-white"
            style={{
              fontFamily: "Tajawal, sans-serif",
              fontSize: "22px",
              fontWeight: 500,
            }}
          >
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
}

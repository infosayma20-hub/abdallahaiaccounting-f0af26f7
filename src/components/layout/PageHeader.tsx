/**
 * PageHeader — Clean minimal page header with breadcrumbs.
 */
import { useNavigate } from "react-router-dom";

const breadcrumbRoutes: Record<string, string> = {
  "الرئيسية": "/dashboard",
  "المحاسبة": "/apps",
  "المبيعات": "/invoices",
  "المشتريات": "/purchase-invoices",
  "المالية": "/apps",
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
  "الصناديق": "/cash-boxes",
  "الحسابات البنكية": "/bank-accounts",
  "الشيكات": "/cheques",
  "الطلبيات": "/orders",
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
        <div className="flex items-center gap-1 justify-start flex-wrap mb-1" dir="rtl">
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1;
            const hasRoute = !isLast && breadcrumbRoutes[item];
            return (
              <span key={i} className="flex items-center gap-1 text-xs">
                {i > 0 && <span className="mx-1 text-muted-foreground/50">/</span>}
                {hasRoute ? (
                  <button
                    onClick={() => handleCrumbClick(item)}
                    className="text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer"
                  >
                    {item}
                  </button>
                ) : (
                  <span className={isLast ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {item}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
    </div>
  );
}

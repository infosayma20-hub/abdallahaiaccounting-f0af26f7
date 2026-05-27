/**
 * PageHeader — Qoyod-style full-width navy banner for page titles.
 * Breadcrumbs are right-aligned and clickable for navigation.
 */
import { useNavigate } from "react-router-dom";

/** Map Arabic breadcrumb labels → routes */
const breadcrumbRoutes: Record<string, string> = {
  "الرئيسية": "/apps",
  "المحاسبة": "/accounting-center",
  "المبيعات": "/invoices",
  "المشتريات": "/purchase-invoices",
  "المالية": "/accounting-center",
  "التقارير": "/reports",
  "شجرة الحسابات": "/accounts",
  "الفواتير": "/invoices",
  "إرساليات المبيعات": "/delivery-notes",
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
    <div>
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="mb-3 flex items-center gap-1 justify-start flex-wrap" dir="rtl"
          style={{ fontSize: 13 }}
        >
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1;
            const hasRoute = !isLast && breadcrumbRoutes[item];
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="mx-1" style={{ color: "#9CA3AF" }}>/</span>}
                {hasRoute ? (
                  <button
                    onClick={() => handleCrumbClick(item)}
                    className="hover:underline transition-colors cursor-pointer"
                    style={{ color: "#6B7280" }}
                  >
                    {item}
                  </button>
                ) : (
                  <span style={{ color: isLast ? "#1B3A5C" : "#6B7280", fontWeight: isLast ? 500 : 400 }}>
                    {item}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      <div
        className="w-full flex items-center justify-between overflow-hidden"
        style={{
          backgroundColor: "#1B3A5C",
          borderRadius: 12,
          borderTop: "3px solid #5B9BD5",
          padding: "10px 20px",
          height: 44,
          margin: "0 0 16px 0",
        }}
      >
        <h1
          className="text-right"
          style={{
            fontFamily: "Tajawal, sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: "#FFFFFF",
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
      </div>
    </div>
  );
}

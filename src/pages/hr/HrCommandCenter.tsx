import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useHRManagerPermissions } from "@/hooks/useHRManagerPermissions";
import { HR_APP_ITEMS, HR_APP_GROUP_ORDER } from "@/components/hr/HRTopNav";
import { cn } from "@/lib/utils";

/**
 * لوحة الموارد البشرية — بطاقات تطبيقات فقط، بدون أي طلب بيانات عند الدخول.
 * نفس قائمة تطبيقات HR وصلاحياتها (مصدر واحد في HRTopNav).
 */
export default function HrCommandCenter() {
  const { isAdmin, isHRManager, can } = useHRManagerPermissions();

  const items = useMemo(() => {
    const visible = HR_APP_ITEMS.filter((i) => {
      if (i.to === "/hr") return false;
      if (!i.perms || i.perms.length === 0) return true;
      if (isAdmin) return true;
      return isHRManager && can(...i.perms);
    });
    // نفس ترتيب الأقسام، لكن كل البطاقات متلاصقة ب сетورة واحدة متواصلة
    return HR_APP_GROUP_ORDER.flatMap((g) => visible.filter((i) => i.group === g));
  }, [isAdmin, isHRManager, can]);

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8 space-y-6" dir="rtl">
      <div className="text-right">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">الموارد البشرية</h1>
        <p className="text-sm text-muted-foreground mt-1">اختر التطبيق</p>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
        {items.map(({ to, label, Icon, chip }) => (
          <Link
            key={to}
            to={to}
            className="group flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-2.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", chip)}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium leading-tight text-foreground">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

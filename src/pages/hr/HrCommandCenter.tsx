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

  const groups = useMemo(() => {
    const visible = HR_APP_ITEMS.filter((i) => {
      if (i.to === "/hr") return false;
      if (!i.perms || i.perms.length === 0) return true;
      if (isAdmin) return true;
      return isHRManager && can(...i.perms);
    });
    return HR_APP_GROUP_ORDER.map((g) => ({
      group: g,
      list: visible.filter((i) => i.group === g),
    })).filter((g) => g.list.length > 0);
  }, [isAdmin, isHRManager, can]);

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8 space-y-6" dir="rtl">
      <div className="text-right">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">الموارد البشرية</h1>
        <p className="text-sm text-muted-foreground mt-1">اختر التطبيق</p>
      </div>

      {groups.map(({ group, list }) => (
        <section key={group} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground text-right">{group}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {list.map(({ to, label, Icon, chip }) => (
              <Link
                key={to}
                to={to}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", chip)}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-xs font-medium leading-tight text-foreground">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

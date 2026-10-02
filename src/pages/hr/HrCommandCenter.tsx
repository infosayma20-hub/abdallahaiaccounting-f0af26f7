import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useHRManagerPermissions } from "@/hooks/useHRManagerPermissions";
import { HR_APP_ITEMS, HR_APP_GROUP_ORDER } from "@/components/hr/HRTopNav";
import { cn } from "@/lib/utils";

/**
 * لوحة الموارد البشرية — بطاقات تطبيقات فقط، بدون أي طلب بيانات عند الدخول.
 * نفس قائمة تطبيقات HR وصلاحياتها (مصدر واحد في HRTopNav).
 */
export default function HrCommandCenter() {
  const { isAdmin, isHRManager, can } = useHRManagerPermissions();
  const reduceMotion = useReducedMotion();

  const items = useMemo(() => {
    const visible = HR_APP_ITEMS.filter((i) => {
      if (i.to === "/hr") return false;
      if (!i.perms || i.perms.length === 0) return true;
      if (isAdmin) return true;
      return isHRManager && can(...i.perms);
    });
    // نفس ترتيب الأقسام، لكن كل البطاقات متلاصقة بصف واحد متواصل
    return HR_APP_GROUP_ORDER.flatMap((g) => visible.filter((i) => i.group === g));
  }, [isAdmin, isHRManager, can]);

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8 space-y-6" dir="rtl">
      <motion.div
        className="text-right"
        initial={reduceMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <h1 className="text-2xl font-bold text-foreground">الموارد البشرية</h1>
        <p className="text-sm text-muted-foreground mt-1">اختر التطبيق</p>
      </motion.div>

      <motion.div
        className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: reduceMotion ? { delayChildren: 0 } : { delayChildren: 0.12, staggerChildren: 0.075 },
          },
        }}
      >
        {items.map(({ to, label, Icon, chip }) => (
          <motion.div
            key={to}
            variants={{
              hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, x: 34, y: 18, scale: 0.95 },
              visible: { opacity: 1, x: 0, y: 0, scale: 1 },
            }}
            transition={{ duration: 0.62, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Link
              to={to}
              className="group relative flex min-h-[128px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-border bg-card px-3 py-5 text-center shadow-sm transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-2 hover:border-primary/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-px origin-right scale-x-0 bg-gradient-to-l from-transparent via-accent/70 to-transparent transition-transform duration-500 ease-out group-hover:scale-x-100"
              />
              <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl transition-[transform,box-shadow] duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-105 group-hover:shadow-md", chip)}>
                <Icon className="h-7 w-7 transition-transform duration-500 ease-out group-hover:scale-110" />
              </span>
              <span className="text-sm font-medium leading-tight text-foreground transition-colors duration-300 group-hover:text-primary">{label}</span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

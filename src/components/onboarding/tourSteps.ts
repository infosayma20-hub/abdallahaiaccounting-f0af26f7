/**
 * Phase 1: مسار جولة مختصر (9 خطوات كحد أقصى) ذكي + شرطي.
 * كل خطوة تمر عبر `condition(ctx)` ثم تتأكد من وجود data-tour-id فعلياً في DOM.
 * إن لم تتحقق الشروط، تُتخطّى تلقائياً — لا تبقى الجولة عالقة.
 */
export interface TourContext {
  visibleAppIds: Set<string>;
  businessType?: string;          // products | services | restaurant | construction | ...
  hasEmployees?: boolean | null;
  vatEnabled?: boolean | null;
  roles: string[];                // user_roles
}

export interface TourStep {
  targetId: string;
  title: string;
  icon: string;
  description: string;
  tip: string;
  /** يُستبعد إن أعاد false */
  condition?: (ctx: TourContext) => boolean;
}

const isRestaurantOrRetail = (bt?: string) =>
  !!bt && /restaurant|retail|products/i.test(bt);
const hasInventoryBusiness = (bt?: string) =>
  !!bt && /restaurant|retail|products|manufacturing|trading/i.test(bt);
const hasPosRole = (roles: string[]) =>
  roles.some((r) => r === "cashier" || r === "admin" || r === "super_admin");
const hasHrAccess = (roles: string[]) =>
  roles.some((r) => r === "hr_manager" || r === "admin" || r === "super_admin");

/**
 * المسار الأساسي (Phase 1): 9 خطوات بحد أقصى، أغلبها شرطية.
 */
export const tourSteps: TourStep[] = [
  // ───────── قسم الأساسية ─────────
  {
    targetId: "app-dashboard",
    title: "لوحة المعلومات",
    icon: "📊",
    description: "ملخص مالي شامل لنشاطك: إيرادات، مصروفات، أرباح، وتحليلات الأداء في لمحة واحدة.",
    tip: "📈 بيانات لحظية تتحدث تلقائياً مع كل عملية",
  },
  {
    targetId: "app-ai-accountant",
    title: "المحاسب الذكي",
    icon: "🤖",
    description:
      'قلب النظام! اكتب بلغتك العادية مثل:\n"قبضت 500 من أحمد نقداً"\nوالذكاء الاصطناعي يحوّلها لقيد محاسبي + فاتورة تلقائياً ✨',
    tip: "💡 يدعم الإدخال الصوتي 🎙️",
  },
  {
    targetId: "app-sales",
    title: "المبيعات",
    icon: "🛒",
    description: "أدر دورة المبيعات كاملة: العملاء، الفواتير، سندات القبض، الطلبيات، والمندوبين.",
    tip: "📌 تتبّع الفواتير المدفوعة وغير المدفوعة بنظرة واحدة",
  },
  {
    targetId: "app-pos",
    title: "نقطة البيع",
    icon: "🖥️",
    description: "نظام POS متكامل للمبيعات المباشرة: كاشير، طاولات مطعم، إضافات، وتقارير نقطة البيع.",
    tip: "⚡ يعمل بدون إنترنت مع مزامنة تلقائية",
    condition: (ctx) => isRestaurantOrRetail(ctx.businessType) || hasPosRole(ctx.roles),
  },
  {
    targetId: "app-inventory",
    title: "المخزون",
    icon: "📦",
    description: "تتبّع منتجاتك وكمياتها لحظة بلحظة: وارد، صادر، حركات، وتقييم المخزون.",
    tip: "📊 تنبيهات تلقائية عند انخفاض الكمية",
    condition: (ctx) => hasInventoryBusiness(ctx.businessType),
  },
  {
    targetId: "app-crm",
    title: "العملاء والموردين",
    icon: "🤝",
    description: "أدر علاقاتك مع العملاء والموردين: جهات الاتصال، كشوف الحساب، والمتابعة.",
    tip: "📞 ربط مباشر بالمبيعات والمشتريات",
  },
  {
    targetId: "app-reports",
    title: "التقارير",
    icon: "📉",
    description: "تقارير مالية وتحليلية شاملة: قائمة الدخل، المركز المالي، ميزان المراجعة، وتقارير ضريبية.",
    tip: "📈 رسوم بيانية تفاعلية + تصدير Excel و PDF",
  },
  {
    targetId: "app-tax",
    title: "المحاسبة الضريبية",
    icon: "🧮",
    description: "إدارة كاملة لضريبة القيمة المضافة: التقارير الدورية، التقديمات، وحساب الضريبة المستحقة تلقائياً.",
    tip: "🇵🇸 متوافق مع القانون الضريبي الفلسطيني (16%)",
    condition: (ctx) => ctx.vatEnabled !== false,
  },
  {
    targetId: "app-settings",
    title: "الإعدادات",
    icon: "⚙️",
    description: "خصّص نظامك: بيانات الشركة، الصلاحيات، وإعدادات الطباعة والتصدير.",
    tip: "💡 ابدأ هنا بإعداد بيانات شركتك!",
  },
];

/**
 * يُرجع الخطوات المُطبَّقة فعلياً بعد فلترة:
 *   1) شرط condition
 *   2) معرّف التطبيق موجود ضمن visibleAppIds
 *   3) العنصر موجود ومرئي في DOM
 */
export function getEffectiveTourSteps(ctx: TourContext): TourStep[] {
  return tourSteps.filter((step) => {
    if (step.condition && !step.condition(ctx)) return false;
    const appId = step.targetId.replace(/^app-/, "");
    if (!ctx.visibleAppIds.has(appId)) return false;
    const el = findTourTarget(step.targetId);
    return !!el;
  });
}

/**
 * يعيد أول عنصر مرئي مطابق لـ data-tour-id (يفلتر النسخ المخفية مثل
 * البطاقات داخل قسم "المفضلة" المطوي).
 */
export function findTourTarget(targetId: string): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`)
  );
  if (candidates.length === 0) {
    // fallback للتوافق مع id القديم
    return document.getElementById(targetId);
  }
  // العنصر مرئي إذا كان offsetParent !== null (ليس داخل display:none)
  const visible = candidates.find((c) => c.offsetParent !== null);
  return visible || candidates[0];
}

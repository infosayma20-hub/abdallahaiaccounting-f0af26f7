// KPI Source Transparency metadata.
// Single source of truth for tooltips + "مصدر الرقم" drawer on the Reports
// landing page. Numbers themselves are still computed by loadExecutiveKPIs;
// this file only documents how they are computed so the UI can explain them.
import type { ExecutiveKPIs } from "./executive-kpis";

export type KpiKey = Exclude<keyof ExecutiveKPIs, "generatedAt" | "cogs">;

export interface KpiMeta {
  key: KpiKey;
  label: string;
  shortFormula: string;       // for hover tooltip (one line)
  formula: string;            // multi-line, shown in drawer
  sources: string[];          // tables / views referenced
  filters: string[];          // active filters at runtime (date range injected dynamically)
  included: string[];         // ✅ rules
  excluded: string[];         // ❌ rules
  reconcileLabel: string;     // human label of the master report
  reconcilePath: string;      // route to open
  isLifetime?: boolean;       // true → not affected by date range (live snapshot)
  accountCodes?: string[];    // hardcoded GL roots (dev info)
}

export const KPI_META: Record<KpiKey, KpiMeta> = {
  revenue: {
    key: "revenue",
    label: "الإيرادات",
    shortFormula: "صافي الدائن في حسابات 4xxx (بدون ضريبة)",
    formula: "Σ amount(credit_account_code LIKE '4%') − Σ amount(debit_account_code LIKE '4%')",
    sources: ["transactions (دفتر اليومية)"],
    filters: ["نطاق التاريخ", "المستأجر الحالي"],
    included: [
      "كل قيود الإيرادات في 4xxx (مبيعات، خدمات، إيرادات أخرى)",
      "مرتجعات المبيعات مطروحة تلقائياً (تُسجَّل كمدين على 4xxx)",
    ],
    excluded: [
      "ضريبة القيمة المضافة (تُسجَّل في 2190)",
      "القيود المحذوفة (is_deleted = true)",
      "القيود العكسية الناتجة عن إلغاء الفواتير",
    ],
    reconcileLabel: "إجمالي المبيعات / قائمة الأرباح والخسائر",
    reconcilePath: "/profit-loss",
    accountCodes: ["4xxx"],
  },
  grossProfit: {
    key: "grossProfit",
    label: "الربح الإجمالي",
    shortFormula: "الإيرادات − تكلفة البضاعة المباعة (5100)",
    formula: "revenue − Σ amount(debit 5100) − Σ amount(credit 5100)",
    sources: ["transactions"],
    filters: ["نطاق التاريخ", "المستأجر الحالي"],
    included: ["تكلفة البضاعة المباعة من حساب 5100 فقط"],
    excluded: [
      "المصاريف التشغيلية الأخرى (تظهر في صافي الربح)",
      "ضريبة القيمة المضافة",
      "القيود المحذوفة والعكسية",
    ],
    reconcileLabel: "قائمة الأرباح والخسائر — مجمل الربح",
    reconcilePath: "/profit-loss",
    accountCodes: ["4xxx", "5100"],
  },
  netProfit: {
    key: "netProfit",
    label: "صافي الربح",
    shortFormula: "الإيرادات − كل المصاريف (5xxx)",
    formula: "revenue − Σ(debit 5xxx − credit 5xxx)",
    sources: ["transactions"],
    filters: ["نطاق التاريخ", "المستأجر الحالي"],
    included: [
      "كل المصاريف ضمن 5xxx (تكلفة البضاعة + مصاريف تشغيلية)",
    ],
    excluded: [
      "ضريبة القيمة المضافة",
      "إيرادات/مصاريف غير مالية (إن وُجدت)",
      "القيود المحذوفة والعكسية",
    ],
    reconcileLabel: "قائمة الأرباح والخسائر — صافي الربح",
    reconcilePath: "/profit-loss",
    accountCodes: ["4xxx", "5xxx"],
  },
  inventoryValue: {
    key: "inventoryValue",
    label: "قيمة المخزون",
    shortFormula: "Σ max(الكمية, 0) × سعر التكلفة",
    formula: "Σ GREATEST(quantity, 0) × buy_price على جدول products",
    sources: ["products"],
    filters: ["المستأجر الحالي (لقطة لحظية)"],
    included: ["كل المنتجات بكمية موجبة بسعر التكلفة الحالي"],
    excluded: [
      "المنتجات بكمية سالبة لا تُنقص الإجمالي (تظهر في تقرير الجرد)",
      "الأصول الثابتة (12xx) — لها تقرير منفصل",
    ],
    reconcileLabel: "تقرير قيمة المخزون",
    reconcilePath: "/reports/inventory-valuation",
    isLifetime: true,
  },
  ar: {
    key: "ar",
    label: "الذمم المدينة",
    shortFormula: "صافي مدين الحساب 1130",
    formula: "Σ debit(1130*) − Σ credit(1130*) (لقطة لحظية)",
    sources: ["transactions"],
    filters: ["المستأجر الحالي (لقطة لحظية)"],
    included: ["كل الحسابات الفرعية تحت 1130 (ذمم العملاء)"],
    excluded: [
      "حسابات الأصول الأخرى (نقد، بنك، مخزون، أصول ثابتة)",
      "القيود المحذوفة والعكسية",
    ],
    reconcileLabel: "أعمار الذمم المدينة / كشف حساب عميل",
    reconcilePath: "/reports/ar-aging",
    isLifetime: true,
    accountCodes: ["1130"],
  },
  ap: {
    key: "ap",
    label: "الذمم الدائنة",
    shortFormula: "صافي دائن الحساب 2110",
    formula: "Σ credit(2110*) − Σ debit(2110*) (لقطة لحظية)",
    sources: ["transactions"],
    filters: ["المستأجر الحالي (لقطة لحظية)"],
    included: ["كل الحسابات الفرعية تحت 2110 (ذمم الموردين)"],
    excluded: [
      "ضريبة القيمة المضافة (2190)",
      "الالتزامات طويلة الأجل (22xx)",
      "القيود المحذوفة والعكسية",
    ],
    reconcileLabel: "أعمار الذمم الدائنة / كشف حساب مورد",
    reconcilePath: "/reports/ap-aging",
    isLifetime: true,
    accountCodes: ["2110"],
  },
  vatPayable: {
    key: "vatPayable",
    label: "ضريبة مستحقة",
    shortFormula: "صافي دائن حساب 2190 (ضريبة المخرجات − المدخلات)",
    formula: "Σ credit(2190*) − Σ debit(2190*) (لقطة لحظية)",
    sources: ["transactions", "tax_ledger (للتقرير الدوري)"],
    filters: ["المستأجر الحالي (لقطة لحظية)"],
    included: [
      "ضريبة المخرجات على المبيعات (دائن 2190)",
      "ضريبة المدخلات على المشتريات (مدين 2190)",
    ],
    excluded: [
      "ضريبة الدخل أو أي ضرائب أخرى",
      "القيود المحذوفة والعكسية",
    ],
    reconcileLabel: "التقرير الضريبي الدوري",
    reconcilePath: "/tax/periodic-report",
    isLifetime: true,
    accountCodes: ["2190"],
  },
  cashPosition: {
    key: "cashPosition",
    label: "السيولة (نقد + بنك)",
    shortFormula: "صافي مدين 1110 + 1120",
    formula: "net_debit(1110*) + net_debit(1120*)",
    sources: ["transactions"],
    filters: ["المستأجر الحالي (لقطة لحظية)"],
    included: [
      "كل حسابات الصندوق الفرعية تحت 1110",
      "كل حسابات البنوك الفرعية تحت 1120",
    ],
    excluded: [
      "الشيكات تحت التحصيل (1125/1150) — لها بنود منفصلة",
      "الشيكات الصادرة الآجلة (1160)",
      "القيود المحذوفة والعكسية",
    ],
    reconcileLabel: "حركة الصندوق + حركة البنك",
    reconcilePath: "/reports/cash-movement",
    isLifetime: true,
    accountCodes: ["1110", "1120"],
  },
};
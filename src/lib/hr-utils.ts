/**
 * Palestinian Labor Law HR Utilities
 * Based on Palestinian Labor Law No. 7 of 2000
 */

import { differenceInMonths, differenceInYears, isWeekend as isDateWeekend, eachDayOfInterval, getDay } from "date-fns";

// ━━━ Palestinian Official Holidays (Fixed dates) ━━━
export const FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: "رأس السنة الميلادية" },
  { month: 5, day: 1, name: "عيد العمال" },
  { month: 11, day: 15, name: "إعلان الاستقلال" },
  { month: 12, day: 25, name: "عيد الميلاد" },
];

// ━━━ Haversine Distance Calculation ━━━
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ━━━ Overtime Calculation (Palestinian Labor Law) ━━━
export type DayType = "regular" | "official_holiday" | "eid";

export const calculateOvertime = (totalHours: number, hourlyRate: number, dayType: DayType): number => {
  if (totalHours <= 0) return 0;

  if (dayType === "regular") {
    if (totalHours <= 8) return 0;
    return (totalHours - 8) * hourlyRate * 1.5;
  }

  if (dayType === "official_holiday") {
    if (totalHours <= 8) return totalHours * hourlyRate * 2;
    return 8 * hourlyRate * 2 + (totalHours - 8) * hourlyRate * 2.5;
  }

  // eid
  return totalHours * hourlyRate * 2.5;
};

// ━━━ Annual Leave Balance (Palestinian Labor Law) ━━━
export const calculateAnnualLeaveEntitlement = (startDate: string): number => {
  const yearsWorked = differenceInYears(new Date(), new Date(startDate));
  // قانون العمل الفلسطيني رقم 7/2000 — المادة 74
  // أقل من 5 سنوات: 14 يوم | 5 سنوات فأكثر: 21 يوم
  return yearsWorked < 5 ? 14 : 21;
};

export const calculateLeaveBalance = (
  startDate: string,
  previousYearBalance: number,
  usedThisYear: number,
  opts?: { asOf?: Date | string; honorProbation?: boolean; probationDays?: number }
) => {
  const fullEntitlement = calculateAnnualLeaveEntitlement(startDate);
  const maxCarryOver = fullEntitlement * 2;
  const carriedOver = Math.min(previousYearBalance, maxCarryOver);

  // Pro-rate by months worked in the reference calendar year (defaults to today,
  // but callers such as end-of-service settlements should pass the termination date).
  const today = opts?.asOf ? new Date(opts.asOf) : new Date();
  const year = today.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEndPlus1 = new Date(year + 1, 0, 1);
  const hire = new Date(startDate);
  let proStart = hire > yearStart ? hire : yearStart;

  // Palestinian labor law: annual leave accrues after the 3-month probation period.
  if (opts?.honorProbation) {
    const probation = opts.probationDays ?? 90;
    const afterProbation = new Date(hire);
    afterProbation.setDate(afterProbation.getDate() + probation);
    if (afterProbation > proStart) proStart = afterProbation;
  }

  const monthDiff = (from: Date, to: Date) => {
    const months =
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth()) +
      (to.getDate() - from.getDate()) / 30;
    return Math.max(0, months);
  };

  const monthsToYearEnd = Math.min(12, monthDiff(proStart, yearEndPlus1));
  const monthsAccrued = Math.min(monthsToYearEnd, monthDiff(proStart, today));

  const entitlement = +(fullEntitlement * (monthsToYearEnd / 12)).toFixed(2);
  const accruedToDate = +(fullEntitlement * (monthsAccrued / 12)).toFixed(2);

  // "متاح" = المستحق فعلياً حتى اليوم + رصيد مرحّل − مستخدم.
  // لا يجوز إظهار استحقاق مستقبلي لم يُكتسب بعد كأنه رصيد متاح للاستخدام،
  // لأن الموظف لا يستطيع أخذ إجازة على أشهر لم يعملها بعد.
  const available = +(carriedOver + accruedToDate - usedThisYear).toFixed(2);

  return {
    entitlement,        // prorated year entitlement (Feb→Dec for a Feb hire)
    accruedToDate,      // accrued so far up to today
    carriedOver,
    used: usedThisYear,
    // يُعرض بالسالب عند تجاوز الرصيد (سحب على المكشوف) — لا يتم تصفيره.
    available,
    overdrawn: available < 0,
    maxCarryOver,
    fullEntitlement,    // 14 / 21 / 30 by tenure
  };
};

/**
 * Sick leave balance — granted IN FULL from the start of the year (no monthly
 * accrual, unlike annual leave) and no carry-over between years.
 * fullEntitlement defaults to 14 (Palestinian labor law) if not overridden.
 */
export const calculateSickBalance = (
  startDate: string,
  usedThisYear: number,
  fullEntitlement = 14,
) => {
  const today = new Date();
  const year = today.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEndPlus1 = new Date(year + 1, 0, 1);
  const hire = new Date(startDate);
  const proStart = hire > yearStart ? hire : yearStart;

  const monthDiff = (from: Date, to: Date) => {
    const months =
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth()) +
      (to.getDate() - from.getDate()) / 30;
    return Math.max(0, months);
  };

  const monthsToYearEnd = Math.min(12, monthDiff(proStart, yearEndPlus1));

  // الإجازة المرضية متاحة بالكامل من بداية السنة (أو من تاريخ التعيين إذا
  // بدأ خلال السنة، مع احتساب الاستحقاق النسبي لبقية السنة فقط).
  const entitlement = +(fullEntitlement * (monthsToYearEnd / 12)).toFixed(2);
  const accruedToDate = entitlement; // كامل الاستحقاق متاح فوراً

  const sickAvailable = +(entitlement - usedThisYear).toFixed(2);

  return {
    entitlement,
    accruedToDate,
    used: usedThisYear,
    // المتاح = كامل استحقاق السنة − المستخدم.
    // يظهر بالسالب عند تجاوز الرصيد بدل تصفيره.
    available: sickAvailable,
    overdrawn: sickAvailable < 0,
    fullEntitlement,
  };
};

/**
 * فترة التجربة للإجازة السنوية: لا يحق للموظف طلب إجازة سنوية قبل إتمام
 * 3 أشهر (90 يوماً) من تاريخ المباشرة.
 */

/** سقف أيام الإجازة المرضية المدفوعة بأجر كامل خلال السنة (قانون العمل). */
export const SICK_FULL_PAY_DAYS = 14;
/** سقف أيام الإجازة المرضية المدفوعة (كامل + نصف) خلال السنة — بعده بدون أجر. */
export const SICK_HALF_PAY_DAYS = 14;
export const SICK_PAID_DAYS_CAP = SICK_FULL_PAY_DAYS + SICK_HALF_PAY_DAYS; // 28

/**
 * توزيع أيام الإجازة المرضية في فترة معيّنة على شريحتين:
 *  - أيام بأجر كامل (ضمن أول 14 يوم من السنة)
 *  - أيام بنصف أجر (من 15 حتى 28)
 *  - أيام بدون أجر (كل ما زاد عن 28)
 *
 * @param priorUsedThisYear أيام المرضية المستهلكة قبل بداية الفترة من نفس السنة
 * @param daysInPeriod      أيام المرضية داخل الفترة الحالية
 */
export const splitSickPayDays = (
  priorUsedThisYear: number,
  daysInPeriod: number,
  fullPayCap = SICK_FULL_PAY_DAYS,
  paidCap = SICK_PAID_DAYS_CAP,
) => {
  const prior = Math.max(0, Number(priorUsedThisYear) || 0);
  const days = Math.max(0, Number(daysInPeriod) || 0);
  const remainingFull = Math.max(0, fullPayCap - prior);
  const fullDays = Math.min(days, remainingFull);
  const remainingHalf = Math.max(0, paidCap - Math.max(prior, fullPayCap) - (fullDays > 0 ? 0 : 0));
  const halfDays = +Math.min(days - fullDays, remainingHalf).toFixed(2);
  const unpaidDays = +(days - fullDays - halfDays).toFixed(2);
  return {
    fullDays: +fullDays.toFixed(2),
    halfDays,
    unpaidDays,
    /** عدد الأيام المدفوعة فعلياً (نصف أجر = 0.5 يوم) */
    paidEquivalentDays: +(fullDays + halfDays * 0.5).toFixed(2),
  };
};

export const ANNUAL_LEAVE_PROBATION_DAYS = 90;

export const getAnnualLeaveProbation = (
  startDate: string | null | undefined,
  probationDays = ANNUAL_LEAVE_PROBATION_DAYS,
) => {
  if (!startDate) return { eligible: true, eligibleFrom: null as string | null, daysRemaining: 0 };
  const hire = new Date(startDate);
  if (isNaN(hire.getTime())) return { eligible: true, eligibleFrom: null as string | null, daysRemaining: 0 };
  const eligibleAt = new Date(hire);
  eligibleAt.setDate(eligibleAt.getDate() + probationDays);
  const now = new Date();
  const msPerDay = 86400000;
  const daysRemaining = Math.max(0, Math.ceil((eligibleAt.getTime() - now.getTime()) / msPerDay));
  return {
    eligible: now >= eligibleAt,
    eligibleFrom: eligibleAt.toISOString().split("T")[0],
    daysRemaining,
  };
};

// ━━━ Work Days Calculation ━━━
export const getWorkDaysInMonth = (year: number, month: number, weeklyOffDays: number[] = [6]): number => {
  // weeklyOffDays: 5=Friday, 6=Saturday (default Palestinian weekend is Friday+Saturday but configurable)
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const days = eachDayOfInterval({ start, end });
  return days.filter(d => !weeklyOffDays.includes(getDay(d))).length;
};

export const getWeeklyDaysOffInMonth = (year: number, month: number, weeklyOffDays: number[] = [6]): number => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const days = eachDayOfInterval({ start, end });
  return days.filter(d => weeklyOffDays.includes(getDay(d))).length;
};

// ━━━ Salary Slip Calculation ━━━
export interface SalarySlipInput {
  baseSalary: number;
  hourlyRate: number;
  workDaysPerWeek: number;
  workHoursPerDay: number;
  presentDays: number;
  annualLeaveDays: number;
  sickLeaveDays: number;
  officialHolidayDays: number;
  weeklyDaysOff: number;
  totalWorkDays: number;
  transportationPerDay: number;
  mealPerDay: number;
  spouseAllowance: number;
  childrenCount: number;
  childAllowancePerChild: number;
  overtimeHours: number;
  overtimeAmount: number;
  advanceDeductions: number;
  otherDeductions: number;
  customAllowances: number;
  socialInsuranceRate: number;
}

export interface SalarySlip {
  // Days
  workDays: number;
  presentDays: number;
  annualLeaveDays: number;
  sickLeaveDays: number;
  officialHolidayDays: number;
  weeklyDaysOff: number;
  totalPaidDays: number;
  absentDays: number;

  // Earnings
  basicSalary: number;
  transportationAllowance: number;
  mealAllowance: number;
  spouseAllowance: number;
  childrenAllowance: number;
  overtimeAmount: number;
  customAllowances: number;
  totalEarnings: number;

  // Deductions
  absenceDeduction: number;
  lateDeduction: number;
  advanceDeduction: number;
  socialInsurance: number;
  otherDeductions: number;
  totalDeductions: number;

  // Net
  netSalary: number;
}

export const calculateSalarySlip = (input: SalarySlipInput): SalarySlip => {
  const totalPaidDays =
    input.presentDays + input.annualLeaveDays + input.sickLeaveDays +
    input.officialHolidayDays + input.weeklyDaysOff;

  const absentDays = Math.max(0, input.totalWorkDays - input.presentDays - input.annualLeaveDays - input.sickLeaveDays);

  // Basic salary calculation with 25-day rule
  let basicSalary = input.baseSalary;
  if (totalPaidDays < 25 && absentDays > 0) {
    const dailyRate = input.baseSalary / input.totalWorkDays;
    const deduction = absentDays * dailyRate;
    if (deduction >= 20) {
      basicSalary = input.baseSalary - deduction;
    }
  }

  // Daily allowances (only for present days)
  const transportationAllowance = input.presentDays * input.transportationPerDay;
  const mealAllowance = input.presentDays * input.mealPerDay;
  const childrenAllowance = input.childrenCount * input.childAllowancePerChild;

  const totalEarnings =
    basicSalary + transportationAllowance + mealAllowance +
    input.spouseAllowance + childrenAllowance +
    input.overtimeAmount + input.customAllowances;

  // Deductions
  const absenceDeduction = basicSalary < input.baseSalary ? input.baseSalary - basicSalary : 0;
  const socialInsurance = basicSalary * input.socialInsuranceRate;
  const totalDeductions =
    absenceDeduction + input.advanceDeductions + socialInsurance + input.otherDeductions;

  const netSalary = totalEarnings - totalDeductions + absenceDeduction; // absenceDeduction already reflected in basicSalary

  return {
    workDays: input.totalWorkDays,
    presentDays: input.presentDays,
    annualLeaveDays: input.annualLeaveDays,
    sickLeaveDays: input.sickLeaveDays,
    officialHolidayDays: input.officialHolidayDays,
    weeklyDaysOff: input.weeklyDaysOff,
    totalPaidDays,
    absentDays,
    basicSalary,
    transportationAllowance,
    mealAllowance,
    spouseAllowance: input.spouseAllowance,
    childrenAllowance,
    overtimeAmount: input.overtimeAmount,
    customAllowances: input.customAllowances,
    totalEarnings,
    absenceDeduction,
    lateDeduction: 0,
    advanceDeduction: input.advanceDeductions,
    socialInsurance,
    otherDeductions: input.otherDeductions,
    totalDeductions,
    netSalary: totalEarnings - totalDeductions + absenceDeduction,
  };
};

// ━━━ Termination / End of Service Calculation ━━━
export const calculateTermination = (
  startDate: string,
  terminationDate: string,
  baseSalary: number,
  leaveBalance: number,
  unpaidAdvances: number,
  options?: { currentMonthSalary?: number }
) => {
  // Total months worked (consistent single source, avoids the
  // differenceInYears + (differenceInMonths % 12) mismatch bug).
  const totalMonths = Math.max(0, differenceInMonths(new Date(terminationDate), new Date(startDate)));
  const yearsWorked = totalMonths / 12;

  // Palestinian Labor Law: one month salary per year of service, pro-rata for
  // partial years. Use the same base for annual-leave payout (baseSalary/30 * days).
  const severancePay = Math.max(0, baseSalary * yearsWorked);
  const unusedLeavePay = Math.max(0, (baseSalary / 30) * Math.max(0, leaveBalance));

  // Pro-rata current month. Callers may pass an attendance-based value when
  // the employee has actual attendance records for the termination month.
  const termDate = new Date(terminationDate);
  const termDay = termDate.getDate();
  const daysInMonth = new Date(termDate.getFullYear(), termDate.getMonth() + 1, 0).getDate();
  const fallbackMonthSalary = (baseSalary / daysInMonth) * termDay;
  const currentMonthSalary = Math.max(0, options?.currentMonthSalary ?? fallbackMonthSalary);

  const advanceBalance = Math.max(0, unpaidAdvances);
  const totalDues = severancePay + unusedLeavePay + currentMonthSalary - advanceBalance;

  return {
    yearsWorked,
    severancePay,
    unusedLeavePay,
    currentMonthSalary,
    advanceBalance,
    totalDues: Math.max(0, totalDues),
  };
};

// ━━━ Excel Import Template Columns ━━━
export const EMPLOYEE_IMPORT_COLUMNS = [
  "اسم الموظف",
  "رقم الهوية",
  "الجنس",
  "تاريخ الميلاد",
  "الجنسية",
  "رقم الهاتف",
  "البريد الإلكتروني",
  "العنوان",
  "تاريخ التعيين",
  "المسمى الوظيفي",
  "القسم",
  "نوع العقد",
  "الراتب الأساسي",
  "نوع الراتب",
  "أيام العمل/أسبوع",
  "ساعات العمل/يوم",
  "بدل مواصلات/يوم",
  "بدل وجبات/يوم",
  "الحالة الاجتماعية",
  "عدد الأبناء",
  "علاوة زوجة",
  "علاوة أبناء/طفل",
  "رصيد الإجازة السنوية",
  "اسم البنك",
  "رقم الحساب",
  "جهة الطوارئ",
  "هاتف الطوارئ",
];

export const mapExcelRowToEmployee = (row: Record<string, any>, userId: string) => ({
  user_id: userId,
  full_name: row["اسم الموظف"] || "",
  id_number: String(row["رقم الهوية"] || ""),
  gender: row["الجنس"] === "أنثى" ? "female" : "male",
  date_of_birth: row["تاريخ الميلاد"] || null,
  nationality: row["الجنسية"] || null,
  phone: String(row["رقم الهاتف"] || ""),
  email: row["البريد الإلكتروني"] || null,
  address: row["العنوان"] || null,
  start_date: row["تاريخ التعيين"] || new Date().toISOString().split("T")[0],
  job_title: row["المسمى الوظيفي"] || null,
  department: row["القسم"] || null,
  contract_type: row["نوع العقد"] || "permanent",
  base_salary: Number(row["الراتب الأساسي"]) || 0,
  salary_type: row["نوع الراتب"] || "شهري",
  work_days_per_week: Number(row["أيام العمل/أسبوع"]) || 6,
  work_hours_per_day: Number(row["ساعات العمل/يوم"]) || 8,
  transportation_allowance_per_day: Number(row["بدل مواصلات/يوم"]) || 0,
  meal_allowance_per_day: Number(row["بدل وجبات/يوم"]) || 0,
  marital_status: row["الحالة الاجتماعية"] === "متزوج" ? "married" : row["الحالة الاجتماعية"] === "مطلق" ? "divorced" : "single",
  children_count: Number(row["عدد الأبناء"]) || 0,
  spouse_allowance_amount: Number(row["علاوة زوجة"]) || 0,
  child_allowance_per_child: Number(row["علاوة أبناء/طفل"]) || 0,
  annual_leave_balance: Number(row["رصيد الإجازة السنوية"]) || 0,
  annual_leave_days: 14,
  sick_leave_days: 14,
  hourly_rate: 0,
  bank_name: row["اسم البنك"] || null,
  bank_account: row["رقم الحساب"] || null,
  emergency_contact: row["جهة الطوارئ"] || null,
  emergency_phone: row["هاتف الطوارئ"] || null,
  is_active: true,
});

export const formatCurrency = (n: number) => `₪ ${n.toLocaleString("en", { minimumFractionDigits: 2 })}`;

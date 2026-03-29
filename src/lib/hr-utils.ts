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
  if (yearsWorked < 3) return 14;
  if (yearsWorked < 5) return 21;
  return 30;
};

export const calculateLeaveBalance = (
  startDate: string,
  previousYearBalance: number,
  usedThisYear: number
) => {
  const entitlement = calculateAnnualLeaveEntitlement(startDate);
  const maxCarryOver = entitlement * 2;
  const carriedOver = Math.min(previousYearBalance, maxCarryOver);
  const available = carriedOver + entitlement - usedThisYear;

  return {
    entitlement,
    carriedOver,
    used: usedThisYear,
    available: Math.max(0, available),
    maxCarryOver,
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
  unpaidAdvances: number
) => {
  const years = differenceInYears(new Date(terminationDate), new Date(startDate));
  const months = differenceInMonths(new Date(terminationDate), new Date(startDate)) % 12;

  const severancePay = baseSalary * (years + months / 12);
  const unusedLeavePay = (baseSalary / 30) * leaveBalance;

  // Pro-rata current month
  const termDay = new Date(terminationDate).getDate();
  const daysInMonth = new Date(new Date(terminationDate).getFullYear(), new Date(terminationDate).getMonth() + 1, 0).getDate();
  const currentMonthSalary = (baseSalary / daysInMonth) * termDay;

  const totalDues = severancePay + unusedLeavePay + currentMonthSalary - unpaidAdvances;

  return {
    yearsWorked: years + months / 12,
    severancePay: Math.max(0, severancePay),
    unusedLeavePay: Math.max(0, unusedLeavePay),
    currentMonthSalary,
    advanceBalance: unpaidAdvances,
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
  work_hours_per_day: Number(row["ساعات العمل/يوم"]) || 10,
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

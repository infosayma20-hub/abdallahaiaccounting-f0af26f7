/**
 * Malaki Preset — bit-for-bit mirror of src/lib/malaki-payroll.ts
 * 
 * Constants here MUST equal Malaki Engine constants exactly.
 * Any divergence will be caught by the comparison tool.
 * 
 * This is NOT generic logic. It is a faithful port so the new engine
 * can produce identical results for the Malaki tenant during S2-A.
 */

export const MALAKI_CONSTANTS = {
  MONTH_DAYS: 28,
  WEEKLY_OFFS: 4,
  DEFAULT_HOURLY_RATE: 9.6,
  OVERTIME_MULT: 1.5,
  HOLIDAY_OVERTIME_MULT: 2.5,

  ANNUAL_INCREMENT_PER_YEAR: 100, // ₪
  FOOD_TRANSPORT_DEFAULT: 600, // ₪/month
  FOOD_TRANSPORT_ACTIVATION_MONTHS: 3,
  FOOD_TRANSPORT_DAILY_DEDUCTION: 20, // ₪ per extra holiday day above 4

  FAMILY_ALLOWANCE_ACTIVATION_MONTHS: 6,
  FAMILY_PER_WIFE: 200,
  FAMILY_PER_CHILD: 70,

  FIXED_DEDUCTION_THRESHOLD_DAYS: 25, // (working+leave+4) >= 25 → no deduction
  FIXED_DEDUCTION_MIN_AMOUNT: 20, // ignore if < 20

  ATTENDANCE_BONUS_MAX_ABSENT: 4, // absent <= 4 days qualifies
  ATTENDANCE_BONUS_RATE: 9.6, // 4 * (4 - absent) * 9.6

  FOOD_GROUP_RATE: 0.9,
  FOOD_INDIVIDUAL_RATE: 0.5,

  LAW_CHANGE_DATE: '2024-07-01',
  SEVERANCE_BASE: 2000,
  SEVERANCE_DIVISOR: 36, // 3 years * 12 months
  VACATION_HOUR_RATE_MULT: 8, // vacation_pay = balance * 9.6 * 8
} as const;
/**
 * Portal business profile
 * ------------------------------------------------------------------
 * The management portal (بوابة الإدارة) started as a single-tenant
 * screen for the Malaky (restaurant) account. It is now offered to every
 * client, so domain-specific wording (meals, cashiers, dishes) must be
 * driven by a per-tenant profile instead of being hardcoded.
 *
 * SAFETY RULE: `null` (no profile configured) === legacy behaviour.
 * Existing tenants keep exactly the screen they have today.
 */

export type PortalProfile = 'restaurant' | 'retail' | 'general';

export interface PortalTerms {
  /** Person operating the sale terminal */
  cashier: string;
  cashiers: string;
  topCashier: string;
  byCashier: string;
  noCashierData: string;
  /** Sellable line item */
  item: string;
  byItem: string;
  topItem: string;
  unit: string;
  /** Whether employee-meal-subsidy UI is meaningful for this tenant */
  showEmployeeMeals: boolean;
}

const RESTAURANT_TERMS: PortalTerms = {
  cashier: 'كاشير',
  cashiers: 'كاشير',
  topCashier: 'أعلى كاشير',
  byCashier: 'حسب الكاشير',
  noCashierData: 'لا توجد بيانات كاشير',
  item: 'صنف',
  byItem: 'حسب الصنف',
  topItem: 'أعلى صنف',
  unit: 'قطعة',
  showEmployeeMeals: true,
};

const RETAIL_TERMS: PortalTerms = {
  cashier: 'بائع',
  cashiers: 'بائع',
  topCashier: 'أعلى بائع',
  byCashier: 'حسب البائع',
  noCashierData: 'لا توجد بيانات بائعين',
  item: 'صنف',
  byItem: 'حسب الصنف',
  topItem: 'أعلى صنف',
  unit: 'قطعة',
  showEmployeeMeals: false,
};

const GENERAL_TERMS: PortalTerms = {
  ...RETAIL_TERMS,
  cashier: 'مستخدم',
  cashiers: 'مستخدم',
  topCashier: 'أعلى مستخدم',
  byCashier: 'حسب المستخدم',
  noCashierData: 'لا توجد بيانات',
};

export function getPortalTerms(profile: PortalProfile | null | undefined): PortalTerms {
  switch (profile) {
    case 'retail':
      return RETAIL_TERMS;
    case 'general':
      return GENERAL_TERMS;
    // `restaurant` and `null` (legacy, unconfigured) share the original wording
    default:
      return RESTAURANT_TERMS;
  }
}

export const PORTAL_PROFILE_OPTIONS: { value: PortalProfile; label: string }[] = [
  { value: 'restaurant', label: 'مطاعم / كافيهات' },
  { value: 'retail', label: 'تجزئة / معارض' },
  { value: 'general', label: 'عام' },
];
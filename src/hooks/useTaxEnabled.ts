import { useCompanySettings } from "@/hooks/useCompanySettings";

/**
 * Hook to check if VAT/tax is enabled at the company level.
 * When disabled, all tax-related UI elements should be hidden.
 */
export const useTaxEnabled = () => {
  const { settings } = useCompanySettings();
  return {
    taxEnabled: settings?.vat_enabled ?? true,
    defaultTaxRate: settings?.vat_rate ?? 16,
  };
};

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBootstrap } from "@/hooks/useBootstrap";

export interface CompanyData {
  id: string;
  name: string;
  logo_url: string | null;
  industry: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
}

const defaultCompany: CompanyData = {
  id: "",
  name: "",
  logo_url: null,
  industry: null,
  address: null,
  phone: null,
  email: null,
  tax_number: null,
};

const COMPANY_NAME_PLACEHOLDERS = new Set(["شركتي", "الشركة", "اسم الشركة"]);

const normalizeCompanyName = (value?: string | null) => {
  const trimmed = value?.trim() || "";
  return COMPANY_NAME_PLACEHOLDERS.has(trimmed) ? "" : trimmed;
};

interface CompanyContextValue {
  company: CompanyData;
  loading: boolean;
  refreshCompany: () => Promise<void>;
  updateCompanyLogo: (url: string | null) => void;
}

const CompanyContext = createContext<CompanyContextValue>({
  company: defaultCompany,
  loading: true,
  refreshCompany: async () => {},
  updateCompanyLogo: () => {},
});

export const useCompany = () => useContext(CompanyContext);

export const CompanyProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const bootstrap = useBootstrap();
  const [logoOverride, setLogoOverride] = useState<string | null | undefined>(undefined);

  // كل بيانات الشركة تأتي من حزمة البدء الموحّدة — كانت 4 طلبات متتالية
  // (companies ثم profiles ثم companies بالربط ثم company_settings).
  const data = bootstrap.data;
  const company: CompanyData = !user
    ? defaultCompany
    : (() => {
        const resolvedCompany = data?.company ?? null;
        const settingsData = data?.company_settings ?? null;
        const profileData = data?.profile ?? null;
        const name =
          normalizeCompanyName(settingsData?.company_name) ||
          normalizeCompanyName(profileData?.company_name) ||
          normalizeCompanyName(resolvedCompany?.name) ||
          "";
        const logo =
          logoOverride !== undefined
            ? logoOverride
            : resolvedCompany?.logo_url || settingsData?.logo_url || null;
        return {
          id: resolvedCompany?.id || "",
          name,
          logo_url: logo,
          industry: profileData?.work_field || null,
          address: resolvedCompany?.address || settingsData?.address || null,
          phone: resolvedCompany?.phone || settingsData?.phone || null,
          email: resolvedCompany?.email || settingsData?.email || null,
          tax_number: resolvedCompany?.tax_number || settingsData?.tax_number || null,
        };
      })();

  const loading = !!user && bootstrap.isLoading;

  const refreshCompany = useCallback(async () => {
    setLogoOverride(undefined);
    await bootstrap.refetch();
  }, [bootstrap.refetch]);

  const updateCompanyLogo = useCallback((url: string | null) => {
    setLogoOverride(url);
  }, []);

  // تغيّر الحساب — صفّر تجاوز الشعار.
  useEffect(() => {
    setLogoOverride(undefined);
  }, [user?.id]);

  return (
    <CompanyContext.Provider value={{ company, loading, refreshCompany, updateCompanyLogo }}>
      {children}
    </CompanyContext.Provider>
  );
};

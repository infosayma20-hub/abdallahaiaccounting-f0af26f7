import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const [company, setCompany] = useState<CompanyData>(defaultCompany);
  const [loading, setLoading] = useState(true);

  const fetchCompany = useCallback(async () => {
    const userId = user?.id;
    if (!userId) {
      setCompany(defaultCompany);
      setLoading(false);
      return;
    }

    try {
      const { data: companyData } = await supabase
        .from("companies")
        .select("id, name, logo_url, address, phone, email, tax_number")
        .eq("owner_id", userId)
        .maybeSingle();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("company_name, work_field, company_id")
        .eq("user_id", userId)
        .maybeSingle();

      let resolvedCompany = companyData;
      if (!resolvedCompany && profileData?.company_id) {
        const { data: linkedCompany } = await supabase
          .from("companies")
          .select("id, name, logo_url, address, phone, email, tax_number")
          .eq("id", profileData.company_id)
          .maybeSingle();
        resolvedCompany = linkedCompany;
      }

      const { data: settingsData } = await supabase
        .from("company_settings" as any)
        .select("company_name, logo_url, address, phone, email, tax_number")
        .eq("user_id", userId)
        .maybeSingle() as any;

      const name =
        normalizeCompanyName((settingsData as any)?.company_name) ||
        normalizeCompanyName(profileData?.company_name) ||
        normalizeCompanyName(resolvedCompany?.name) ||
        "";

      const logo = resolvedCompany?.logo_url || (settingsData as any)?.logo_url || null;

      setCompany({
        id: resolvedCompany?.id || "",
        name,
        logo_url: logo,
        industry: profileData?.work_field || null,
        address: resolvedCompany?.address || (settingsData as any)?.address || null,
        phone: resolvedCompany?.phone || (settingsData as any)?.phone || null,
        email: resolvedCompany?.email || (settingsData as any)?.email || null,
        tax_number: resolvedCompany?.tax_number || (settingsData as any)?.tax_number || null,
      });
    } catch (err) {
      console.error("Failed to load company data:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const updateCompanyLogo = useCallback((url: string | null) => {
    setCompany(prev => ({ ...prev, logo_url: url }));
  }, []);

  return (
    <CompanyContext.Provider value={{ company, loading, refreshCompany: fetchCompany, updateCompanyLogo }}>
      {children}
    </CompanyContext.Provider>
  );
};

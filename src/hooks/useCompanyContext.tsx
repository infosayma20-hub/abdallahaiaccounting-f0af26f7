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
    if (!user) {
      setCompany(defaultCompany);
      setLoading(false);
      return;
    }

    try {
      // Fetch from companies table
      const { data: companyData } = await supabase
        .from("companies")
        .select("id, name, logo_url, address, phone, email, tax_number")
        .eq("owner_id", user.id)
        .maybeSingle();

      // Also fetch from profiles for extra info
      const { data: profileData } = await supabase
        .from("profiles")
        .select("company_name, work_field, company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      // If not owner, try via company_id from profile
      let resolvedCompany = companyData;
      if (!resolvedCompany && profileData?.company_id) {
        const { data: linkedCompany } = await supabase
          .from("companies")
          .select("id, name, logo_url, address, phone, email, tax_number")
          .eq("id", profileData.company_id)
          .maybeSingle();
        resolvedCompany = linkedCompany;
      }

      // Also check company_settings for logo if companies doesn't have one
      const { data: settingsData } = await supabase
        .from("company_settings" as any)
        .select("company_name, logo_url, address, phone, email, tax_number")
        .eq("user_id", user.id)
        .maybeSingle() as any;

      const name = resolvedCompany?.name || (settingsData as any)?.company_name || profileData?.company_name || "";
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
  }, [user]);

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

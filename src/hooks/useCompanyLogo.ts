import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useCompanyLogo = () => {
  const { user } = useAuth();
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [companySubtitle, setCompanySubtitle] = useState<string>("");
  const [companyPhone, setCompanyPhone] = useState<string>("");
  const [companyEmail, setCompanyEmail] = useState<string>("");
  const [companyAddress, setCompanyAddress] = useState<string>("");
  const [taxNumber, setTaxNumber] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    const fetchCompany = async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, logo_url, phone, email, address, tax_number")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (data) {
        setCompanyName(data.name || "");
        setCompanyPhone(data.phone || "");
        setCompanyEmail(data.email || "");
        setCompanyAddress(data.address || "");
        setTaxNumber(data.tax_number || "");

        if (data.logo_url) {
          try {
            const response = await fetch(data.logo_url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => setLogoBase64(reader.result as string);
            reader.readAsDataURL(blob);
          } catch {
            setLogoBase64(null);
          }
        }
      }
    };
    fetchCompany();
  }, [user]);

  return { logoBase64, companyName, companySubtitle, companyPhone, companyEmail, companyAddress, taxNumber };
};

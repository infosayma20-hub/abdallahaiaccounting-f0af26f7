import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Redirects to the main Account Statement page with the suppliers tab pre-selected.
 * This ensures suppliers get all the same features: customization, line items,
 * Excel export, PDF preview, filters, cheques, year comparison, etc.
 */
const SupplierStatementPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Preserve any existing query params (like contact_id)
    const params = new URLSearchParams(searchParams);
    params.set("contact_type", "مورد");
    navigate(`/account-statement?${params.toString()}`, { replace: true });
  }, []);

  return null;
};

export default SupplierStatementPage;

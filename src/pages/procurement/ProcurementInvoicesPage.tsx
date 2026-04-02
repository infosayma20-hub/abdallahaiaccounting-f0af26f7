import { Navigate } from "react-router-dom";

const ProcurementInvoicesPage = () => {
  return <Navigate to="/invoices?type=purchase" replace />;
};

export default ProcurementInvoicesPage;

import { useNavigate } from "react-router-dom";
import EmployeeStockCountTab from "@/components/employee/EmployeeStockCountTab";

/** مساحة عمل مستقلة للجرد — الرجوع يعيد لاختيار مساحة العمل فقط (مثل موظف المستودع). */
export default function StockCountWorkspacePage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-lg">
        <EmployeeStockCountTab onBack={() => navigate("/choose-workspace", { replace: true })} />
      </div>
    </div>
  );
}

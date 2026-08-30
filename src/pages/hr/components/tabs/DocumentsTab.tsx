import { Card } from "@/components/ui/card";
import EmployeeDocumentsManager from "@/components/hr/EmployeeDocumentsManager";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

interface Props {
  data: Employee360Data;
}

export function DocumentsTab({ data }: Props) {
  const e: any = data.employee || {};
  const ownerId = e.user_id || e.auth_user_id;

  if (!e.id || !ownerId) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        <p className="text-sm">لا يمكن تحميل مستندات هذا الموظف (بيانات الملكية غير مكتملة).</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <EmployeeDocumentsManager
        employeeId={e.id}
        ownerId={ownerId}
        companyId={e.company_id}
        mode="hr"
      />
    </div>
  );
}

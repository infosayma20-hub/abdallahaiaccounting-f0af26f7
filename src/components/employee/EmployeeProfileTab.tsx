import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, User, Building2, Briefcase, Phone, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Employee {
  full_name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  branch_id: string | null;
}

interface Props {
  employee: Employee;
  branchName?: string;
}

export default function EmployeeProfileTab({ employee, branchName }: Props) {
  const { signOut, user } = useAuth();

  const fields = [
    { icon: Briefcase, label: "المنصب", value: employee.position },
    { icon: Building2, label: "القسم", value: employee.department },
    { icon: Building2, label: "الفرع", value: branchName },
    { icon: Phone, label: "الهاتف", value: employee.phone },
    { icon: Mail, label: "البريد", value: employee.email || user?.email },
  ].filter((f) => f.value);

  const bottomPad = "calc(72px + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: bottomPad }}>
      {/* Avatar & Name */}
      <div className="text-center pt-4">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <User className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{employee.full_name}</h2>
        <Badge variant="outline" className="mt-1 text-[10px]">موظف</Badge>
      </div>

      {/* Info Card */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <f.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-muted-foreground">{f.label}</div>
                <div className="text-sm font-medium text-foreground truncate">{f.value}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sign out */}
      <Button
        variant="outline"
        className="w-full h-12 rounded-2xl gap-2 border-destructive/30 text-destructive hover:bg-destructive/5 active:scale-[0.97] transition-transform"
        onClick={signOut}
      >
        <LogOut className="h-4 w-4" />
        تسجيل خروج
      </Button>
    </div>
  );
}

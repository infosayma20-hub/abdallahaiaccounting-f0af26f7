import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserCog, Info, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PolicyAssignmentPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ربط الموظفين بالسياسات</h1>
          <p className="text-sm text-muted-foreground">تعيين سياسات الرواتب والدوام لكل موظف.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Info className="h-7 w-7 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">هذه الشاشة قيد التفعيل</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                هذه الشاشة مخصصة لربط الموظفين بسياسات الرواتب والدوام بشكل جماعي.
                <br />
                حالياً يمكنك تعيين السياسة لكل موظف من بطاقة الموظف نفسه (ضمن إعدادات الراتب).
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              <Button asChild variant="default">
                <Link to="/employees">
                  <ArrowLeft className="h-4 w-4 ml-1" /> فتح الموظفين
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/payroll-settings">سياسات الرواتب</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/hr/settings">إعدادات HR</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
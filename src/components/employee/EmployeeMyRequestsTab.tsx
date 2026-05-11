import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  employeeId: string;
}

const formLabels: Record<string, string> = {
  leave_request: "طلب إجازة",
  advance_request: "طلب سلفة",
  loan_request: "طلب قرض حسن",
  correction_request: "تصحيح بصمة",
  attendance_edit_request: "تعديل بصمة",
  overtime_request: "طلب أوفرتايم",
  hr_message: "رسالة لـ HR",
  employee_info: "معلومات الموظف",
  birthday_whatsapp: "معلومات الموظف",
  complaints: "شكاوى وملاحظات",
  disciplinary_action: "إجراء عقابي",
  facility_quality: "جودة المرافق",
  equipment_fault: "أعطال المعدات",
  inventory_balance: "رصيد الأصناف",
};

const statusLabel = (s: string) => {
  switch (s) {
    case "pending": return { text: "قيد المراجعة", emoji: "🟡", variant: "outline" as const };
    case "approved": return { text: "تمت الموافقة", emoji: "✅", variant: "default" as const };
    case "rejected": return { text: "مرفوض", emoji: "❌", variant: "destructive" as const };
    default: return { text: s, emoji: "⏳", variant: "outline" as const };
  }
};

const leaveTypeLabels: Record<string, string> = {
  annual: "سنوية",
  regular: "عادية",
  sick: "مرضية",
  personal: "شخصية",
  unpaid: "بدون راتب",
};

export default function EmployeeMyRequestsTab({ employeeId }: Props) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("employee_forms")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50);
      setSubmissions(data || []);
      setLoading(false);
    };
    fetch();
  }, [employeeId]);

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 className="text-lg font-bold pt-2 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        طلباتي السابقة ({submissions.length})
      </h2>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
        </div>
      ) : submissions.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">لا يوجد طلبات سابقة</p>
          </CardContent>
        </Card>
      ) : (
        submissions.map(sub => {
          const st = statusLabel(sub.status);
          const formData = sub.form_data as Record<string, any> | null;
          const leaveType = formData?.leave_type;
          const leaveLabel = leaveType ? leaveTypeLabels[leaveType] || leaveType : null;

          return (
            <Card key={sub.id} className="border-border bg-card">
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{formLabels[sub.form_type] || sub.form_type}</span>
                    {leaveLabel && sub.form_type === "leave_request" && (
                      <Badge variant="secondary" className="text-[10px]">{leaveLabel}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{format(new Date(sub.created_at), "dd/MM/yyyy")}</span>
                    <Badge variant={st.variant} className="text-[10px]">{st.emoji} {st.text}</Badge>
                  </div>
                </div>
                {sub.review_notes && (
                  <p className="text-xs text-primary bg-primary/5 rounded-lg p-2">💬 {sub.review_notes}</p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

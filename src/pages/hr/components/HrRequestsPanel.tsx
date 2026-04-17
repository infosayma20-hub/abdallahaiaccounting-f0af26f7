import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, X, Plane, FileText, HandCoins, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  pendingRequests: {
    leaves: any[];
    loans: any[];
    forms: any[];
  };
  employees: { id: string; name: string }[];
}

export function HrRequestsPanel({ pendingRequests, employees }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const empName = (id: string) => employees.find((e) => e.id === id)?.name || "—";

  const review = async (
    table: "leave_requests" | "employee_forms",
    id: string,
    status: "approved" | "rejected",
  ) => {
    const arabicStatus = status === "approved" ? "معتمد" : "مرفوض";
    const { error } = await (supabase as any)
      .from(table)
      .update({ status: arabicStatus, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: status === "approved" ? "تم الاعتماد" : "تم الرفض",
      description: "تم تحديث حالة الطلب بنجاح",
    });
    qc.invalidateQueries({ queryKey: ["hr-command-center"] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-right flex items-center justify-end gap-2">
          <FileText className="h-4 w-4 text-primary" />
          الطلبات المعلقة
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="leaves">
          <TabsList className="w-full justify-start mb-3">
            <TabsTrigger value="leaves" className="gap-1.5">
              <Plane className="h-3.5 w-3.5" />
              إجازات ({pendingRequests.leaves.length})
            </TabsTrigger>
            <TabsTrigger value="forms" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              نماذج ({pendingRequests.forms.length})
            </TabsTrigger>
            <TabsTrigger value="loans" className="gap-1.5">
              <HandCoins className="h-3.5 w-3.5" />
              قروض ({pendingRequests.loans.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leaves" className="mt-0">
            {pendingRequests.leaves.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
                {pendingRequests.leaves.slice(0, 20).map((r) => (
                  <li key={r.id} className="py-2.5 flex items-center gap-3">
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => review("leave_requests", r.id, "approved")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600 hover:bg-rose-500/10"
                        onClick={() => review("leave_requests", r.id, "rejected")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <button
                      onClick={() => navigate(`/hr/employee/${r.employee_id}`)}
                      className="flex-1 min-w-0 text-right hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {r.leave_type}
                        </Badge>
                        <p className="text-sm font-medium truncate">{empName(r.employee_id)}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {r.start_date} → {r.end_date} ({r.days_count} يوم)
                      </p>
                    </button>
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="forms" className="mt-0">
            {pendingRequests.forms.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
                {pendingRequests.forms.slice(0, 20).map((f) => (
                  <li key={f.id} className="py-2.5 flex items-center gap-3">
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => review("employee_forms", f.id, "approved")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600 hover:bg-rose-500/10"
                        onClick={() => review("employee_forms", f.id, "rejected")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <button
                      onClick={() => navigate(`/hr/employee/${f.employee_id}`)}
                      className="flex-1 min-w-0 text-right hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {f.form_type}
                        </Badge>
                        <p className="text-sm font-medium truncate">{empName(f.employee_id)}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {new Date(f.created_at).toLocaleDateString("ar")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="loans" className="mt-0">
            <Empty msg="القروض تُسجَّل مباشرة بدون مرحلة طلب." />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Empty({ msg = "لا توجد طلبات معلقة" }: { msg?: string }) {
  return <p className="text-center text-sm text-muted-foreground py-8">✓ {msg}</p>;
}

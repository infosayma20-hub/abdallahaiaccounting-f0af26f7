import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Star, CheckCircle2, XCircle, ShieldCheck, Loader2 } from "lucide-react";
import { usePayrollPolicies, type PayrollPolicy } from "@/hooks/hr/usePayrollPolicies";
import PolicyFormDialog from "./PolicyFormDialog";
import PolicyAssignmentTable from "./PolicyAssignmentTable";

export default function PayrollPoliciesPage() {
  const { list, counts, remove, setDefault, toggleActive } = usePayrollPolicies();
  const [editing, setEditing] = useState<PayrollPolicy | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<PayrollPolicy | null>(null);

  const policies = list.data || [];

  return (
    <div dir="rtl" className="container max-w-7xl mx-auto px-3 md:px-6 py-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> سياسات الرواتب
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            عرّف عدة سياسات (إداريين، عمال، سائقين…) ثم اربط كل موظف بسياسته.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" /> سياسة جديدة
        </Button>
      </div>

      <Tabs defaultValue="policies" className="w-full">
        <TabsList>
          <TabsTrigger value="policies">السياسات</TabsTrigger>
          <TabsTrigger value="assign">تعيين الموظفين</TabsTrigger>
        </TabsList>

        {/* Policies grid */}
        <TabsContent value="policies" className="mt-4">
          {list.isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> جار التحميل…
            </div>
          ) : !policies.length ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                لا يوجد سياسات بعد. اضغط <b>"سياسة جديدة"</b> لإنشاء أول سياسة.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {policies.map(p => {
                const n = counts.data?.get(p.id) || 0;
                return (
                  <Card key={p.id} className={p.is_default ? "border-primary/40 ring-1 ring-primary/20" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 justify-between">
                        <span className="truncate">{p.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {p.is_default && <Badge className="bg-primary/10 text-primary border-primary/30 gap-1"><Star className="h-3 w-3" /> افتراضية</Badge>}
                          {p.is_active ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" /> نشطة</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground gap-1"><XCircle className="h-3 w-3" /> معطلة</Badge>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                      <div className="text-xs grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                        <span className="text-muted-foreground">أساس الراتب</span>
                        <span className="font-medium">{({ monthly: "شهري", daily: "يومي", hourly: "بالساعة" } as any)[p.salary_basis]}</span>
                        <span className="text-muted-foreground">أيام الشهر</span>
                        <span className="font-medium">{p.month_days_mode === "custom" ? p.month_days_custom : p.month_days_mode.replace("fixed_", "")}</span>
                        <span className="text-muted-foreground">ساعات يومية</span>
                        <span className="font-medium">{p.daily_work_hours}</span>
                        <span className="text-muted-foreground">مضاعف الأوفر</span>
                        <span className="font-medium">×{p.overtime_multiplier}</span>
                        <span className="text-muted-foreground">الموظفون المرتبطون</span>
                        <span className="font-bold text-primary">{n}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditing(p)}>
                          <Pencil className="h-3.5 w-3.5" /> تعديل
                        </Button>
                        {!p.is_default && (
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setDefault.mutate(p.id)} disabled={setDefault.isPending}>
                            <Star className="h-3.5 w-3.5" /> افتراضية
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8" onClick={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })}>
                          {p.is_active ? "تعطيل" : "تفعيل"}
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 mr-auto"
                          onClick={() => setToDelete(p)}
                          disabled={p.is_default || n > 0}
                          title={p.is_default ? "لا يمكن حذف السياسة الافتراضية" : n > 0 ? "هناك موظفون مرتبطون بهذه السياسة" : ""}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> حذف
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Assignment */}
        <TabsContent value="assign" className="mt-4">
          <PolicyAssignmentTable policies={policies} />
        </TabsContent>
      </Tabs>

      <PolicyFormDialog open={creating} onOpenChange={setCreating} policy={null} />
      <PolicyFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} policy={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف السياسة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف السياسة "{toDelete?.name}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (toDelete) remove.mutate(toDelete.id); setToDelete(null); }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

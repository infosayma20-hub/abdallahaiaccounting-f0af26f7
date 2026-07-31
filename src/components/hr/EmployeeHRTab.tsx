import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Star, AlertTriangle, Award, Ban, RotateCcw, Eye, EyeOff, Link2, Shield } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import EmployeeLinkedActionsSection from "@/components/hr/EmployeeLinkedActionsSection";
import { useEmployeeLinkedActions, matchLinkedActions, type LinkedActionRow } from "@/hooks/hr/useEmployeeLinkedActions";
import { LinkedActionBody } from "@/components/hr/LinkedActionDetailDialog";
import { typeLabel, typeColor, penaltyLabel } from "@/lib/hrMessages";

interface Props {
  employeeId: string;
  userId: string;
  employee: any;
}

const RECORD_SECTIONS = [
  { type: "performance", title: "سجل الأداء", icon: Star, color: "text-amber-500" },
  { type: "warning", title: "سجل الإنذارات والمخالفات", icon: AlertTriangle, color: "text-destructive" },
  { type: "reward", title: "المكافآت والترقيات", icon: Award, color: "text-emerald-500" },
];

const WARNING_TYPES = ["شفهي", "خطي", "إنذار نهائي"];
const REWARD_TYPES = ["مكافأة", "ترقية", "علاوة"];

export default function EmployeeHRTab({ employeeId, userId, employee }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<string>("performance");
  const [form, setForm] = useState({
    record_date: new Date().toISOString().split("T")[0],
    title: "",
    description: "",
    rating: 3,
    amount: 0,
    action_taken: "",
    period: "",
  });
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [recordDetail, setRecordDetail] = useState<any | null>(null);
  const linked = useEmployeeLinkedActions(employeeId);
  const linkedForDetail: LinkedActionRow[] = recordDetail ? matchLinkedActions(recordDetail, linked.rows) : [];

  useEffect(() => { fetchRecords(); }, [employeeId]);

  const fetchRecords = async () => {
    const { data } = await supabase
      .from("employee_hr_records")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .order("record_date", { ascending: false });
    setRecords((data as any[]) || []);
  };

  const handleAdd = async () => {
    const { error } = await supabase.from("employee_hr_records").insert({
      user_id: userId,
      employee_id: employeeId,
      record_type: formType,
      record_date: form.record_date,
      title: form.title,
      description: form.description,
      rating: formType === "performance" ? form.rating : null,
      amount: formType === "reward" ? form.amount : null,
      action_taken: formType === "warning" ? form.action_taken : null,
      period: formType === "performance" ? form.period : null,
      created_by: userId,
    } as any);
    if (error) toast.error("خطأ");
    else {
      toast.success("تمت الإضافة");
      setShowForm(false);
      setForm({ record_date: new Date().toISOString().split("T")[0], title: "", description: "", rating: 3, amount: 0, action_taken: "", period: "" });
      fetchRecords();
    }
  };

  const openForm = (type: string) => {
    setFormType(type);
    setShowForm(true);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { toast.error("سبب الإلغاء إلزامي"); return; }
    setSaving(true);
    const { error } = await supabase.from("employee_hr_records")
      .update({
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        cancel_reason: cancelReason.trim(),
      } as any)
      .eq("id", cancelTarget.id);
    setSaving(false);
    if (error) { toast.error("تعذر الإلغاء"); return; }
    toast.success("تم إلغاء السجل");
    setCancelTarget(null); setCancelReason("");
    fetchRecords();
  };

  const restoreRecord = async (r: any) => {
    const { error } = await supabase.from("employee_hr_records")
      .update({ cancelled_at: null, cancelled_by: null, cancel_reason: null } as any)
      .eq("id", r.id);
    if (error) { toast.error("تعذرت الاستعادة"); return; }
    toast.success("تمت استعادة السجل");
    fetchRecords();
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          ["الجنسية", employee?.nationality],
          ["تاريخ الميلاد", employee?.date_of_birth],
          ["رصيد الإجازة الحالي", `${Number(employee?.annual_leave_balance || 0)} يوم`],
          ["رصيد السنة السابقة", `${Number(employee?.previous_year_balance || 0)} يوم`],
          ["العنوان", employee?.address],
          ["ملاحظات", employee?.notes],
        ].map(([label, val]) => (
          <div key={label as string} className="flex justify-between border-b border-border/30 pb-1">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{val || "—"}</span>
          </div>
        ))}
      </div>

      <Separator />

      {/* Record sections */}
      {RECORD_SECTIONS.map(section => {
        const allSection = records.filter(r => r.record_type === section.type);
        const cancelledCount = allSection.filter(r => r.cancelled_at).length;
        const sectionRecords = showCancelled ? allSection : allSection.filter(r => !r.cancelled_at);
        return (
          <div key={section.type}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <section.icon className={`h-4 w-4 ${section.color}`} />
                {section.title}
                {cancelledCount > 0 && (
                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                    {cancelledCount} ملغي
                  </Badge>
                )}
              </h4>
              <div className="flex items-center gap-1">
                {cancelledCount > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[11px] h-7 gap-1 text-muted-foreground"
                    onClick={() => setShowCancelled(v => !v)}
                  >
                    {showCancelled ? <><EyeOff className="h-3 w-3" /> إخفاء الملغى</> : <><Eye className="h-3 w-3" /> عرض الملغى</>}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => openForm(section.type)}>
                  <Plus className="h-3 w-3" /> إضافة
                </Button>
              </div>
            </div>

            {sectionRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">لا توجد سجلات</p>
            ) : (
              <div className="w-full overflow-x-auto rounded-lg border border-border/60">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right whitespace-nowrap">التاريخ</TableHead>
                    {section.type === "performance" && <TableHead className="text-right">الفترة</TableHead>}
                    <TableHead className="text-right whitespace-nowrap">{section.type === "performance" ? "التقييم" : "النوع"}</TableHead>
                    <TableHead className="text-right min-w-[240px]">{section.type === "reward" ? "المبلغ/التفاصيل" : "الوصف"}</TableHead>
                    {section.type === "warning" && <TableHead className="text-right min-w-[180px]">الإجراء</TableHead>}
                    {section.type === "warning" && <TableHead className="text-right whitespace-nowrap">مرتبط بإجراء مُرسل</TableHead>}
                    <TableHead className="text-right w-[150px] whitespace-nowrap">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionRecords.map(r => {
                    const links = section.type === "warning" ? matchLinkedActions(r, linked.rows) : [];
                    return (
                    <TableRow
                      key={r.id}
                      className={r.cancelled_at ? "bg-muted/30 text-muted-foreground [&_td]:line-through" : ""}
                    >
                      <TableCell className="text-sm whitespace-nowrap">{r.record_date}</TableCell>
                      {section.type === "performance" && <TableCell className="text-sm">{r.period || "—"}</TableCell>}
                      <TableCell className="text-sm">
                        {section.type === "performance" && r.rating ? (
                          <span>{"⭐".repeat(r.rating)}</span>
                        ) : (
                          <Badge variant="outline" className="text-xs">{r.title}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {section.type === "reward" && r.amount ? `${Number(r.amount).toLocaleString()} ₪ — ` : ""}
                        <span className="line-clamp-2 break-words">{r.description || "—"}</span>
                      </TableCell>
                      {section.type === "warning" && (
                        <TableCell className="text-sm">
                          <span className="line-clamp-2 break-words">{r.action_taken || "—"}</span>
                        </TableCell>
                      )}
                      {section.type === "warning" && (
                        <TableCell className="text-sm no-underline [&_*]:no-underline">
                          {links.length > 0 ? (
                            <Badge variant="outline" className="text-xs gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                              <Link2 className="h-3 w-3" /> {links.length}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">غير مرتبط</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-sm no-underline [&_*]:no-underline">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => setRecordDetail({ ...r, __section: section.type })}
                          >
                            <Eye className="h-3.5 w-3.5" /> عرض
                          </Button>
                          {r.cancelled_at ? (
                            <>
                            <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">ملغي</Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-emerald-600"
                              title={`استعادة (سبب الإلغاء: ${r.cancel_reason || "—"})`}
                              onClick={() => restoreRecord(r)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            </>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600 hover:bg-red-50"
                              title="إلغاء السجل"
                              onClick={() => { setCancelTarget(r); setCancelReason(""); }}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </div>
        );
      })}

      <Separator />

      <EmployeeLinkedActionsSection
        employeeId={employeeId}
        rows={linked.rows}
        loading={linked.loading}
        onRefresh={linked.refetch}
      />

      {/* Record detail */}
      <Dialog open={!!recordDetail} onOpenChange={(o) => { if (!o) setRecordDetail(null); }}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base text-right">
              {recordDetail?.title || "تفاصيل السجل"} — {recordDetail?.record_date}
            </DialogTitle>
          </DialogHeader>
          {recordDetail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ["التاريخ", recordDetail.record_date],
                  ["النوع", recordDetail.title],
                  ["الفترة", recordDetail.period],
                  ["التقييم", recordDetail.rating ? "⭐".repeat(recordDetail.rating) : null],
                  ["المبلغ", recordDetail.amount ? `${Number(recordDetail.amount).toLocaleString()} ₪` : null],
                  ["الحالة", recordDetail.cancelled_at ? "ملغي" : "ساري"],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3 border-b border-border/30 py-1">
                      <span className="text-muted-foreground shrink-0">{k}</span>
                      <span className="font-medium text-foreground text-left">{v as string}</span>
                    </div>
                  ))}
              </div>

              <div>
                <div className="font-semibold mb-1">الوصف / السبب</div>
                <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap break-words leading-relaxed">
                  {recordDetail.description || "—"}
                </div>
              </div>

              {recordDetail.action_taken && (
                <div>
                  <div className="font-semibold mb-1">الإجراء المتخذ</div>
                  <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap break-words">{recordDetail.action_taken}</div>
                </div>
              )}

              {recordDetail.cancel_reason && (
                <div>
                  <div className="font-semibold mb-1">سبب الإلغاء</div>
                  <div className="rounded-md bg-red-50 text-red-800 p-3 whitespace-pre-wrap break-words">{recordDetail.cancel_reason}</div>
                </div>
              )}

              <Separator />

              <div>
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-red-600" />
                  الإجراءات المُرسلة للموظف المرتبطة بهذه المخالفة
                  <Badge variant="outline" className="text-xs">{linkedForDetail.length}</Badge>
                </div>
                {linkedForDetail.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا يوجد إجراء مُرسل مرتبط بهذا السجل.</p>
                ) : (
                  <div className="space-y-4">
                    {linkedForDetail.map((row) => (
                      <div key={row.id} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          {row.meta && <Badge className={`text-xs ${typeColor(row.meta.type)}`}>{typeLabel(row.meta.type)}</Badge>}
                          {row.meta?.penalty_kind && (
                            <span className="text-xs text-muted-foreground">{penaltyLabel(row.meta.penalty_kind)}</span>
                          )}
                        </div>
                        <LinkedActionBody row={row} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {formType === "performance" ? "إضافة تقييم أداء" : formType === "warning" ? "إضافة إنذار / مخالفة" : "إضافة مكافأة / ترقية"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>التاريخ</Label><Input type="date" value={form.record_date} onChange={e => setForm({ ...form, record_date: e.target.value })} /></div>

            {formType === "performance" && (
              <>
                <div><Label>الفترة</Label><Input value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="مثال: الربع الأول 2026" /></div>
                <div>
                  <Label>التقييم (1-5)</Label>
                  <Select value={String(form.rating)} onValueChange={v => setForm({ ...form, rating: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{"⭐".repeat(n)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {formType === "warning" && (
              <>
                <div>
                  <Label>النوع</Label>
                  <Select value={form.title} onValueChange={v => setForm({ ...form, title: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                    <SelectContent>
                      {WARNING_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>الإجراء المتخذ</Label><Input value={form.action_taken} onChange={e => setForm({ ...form, action_taken: e.target.value })} /></div>
              </>
            )}

            {formType === "reward" && (
              <>
                <div>
                  <Label>النوع</Label>
                  <Select value={form.title} onValueChange={v => setForm({ ...form, title: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                    <SelectContent>
                      {REWARD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>المبلغ / التفاصيل</Label><Input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              </>
            )}

            <div><Label>الوصف / السبب</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleAdd}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء السجل</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم وسم السجل كملغي مع حفظ السبب. يمكنك استعادته لاحقاً من زر «عرض الملغى».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-red-600">سبب الإلغاء (إلزامي) *</Label>
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء..."
            />
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); confirmCancel(); }}>
              تأكيد الإلغاء
            </AlertDialogAction>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

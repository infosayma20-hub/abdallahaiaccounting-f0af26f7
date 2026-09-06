import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, RefreshCw, ChevronDown, ChevronLeft, UserCog, Send, FileText, CheckCircle2, MessageSquare, Plus, Gavel } from "lucide-react";
import { typeLabel, typeColor, penaltyLabel, STATUS_LABELS } from "@/lib/hrMessages";
import SendHRMessageDialog, { type SendTarget } from "@/components/hr/SendHRMessageDialog";
import { LinkedActionBody } from "@/components/hr/LinkedActionDetailDialog";
import {
  useDisciplinaryCases, caseTitle, caseStage, caseManagementDecision, STAGE_LABELS, STAGE_TONE,
  type DisciplinaryCase,
} from "@/hooks/hr/useDisciplinaryCases";

interface Props {
  employeeId: string;
  employeeName?: string;
  authUserId: string;
  canIssuePenalty?: boolean;
  /** فتح نموذج إضافة سجل مخالفة داخلي */
  onAddRecord?: () => void;
}

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString("ar") : "—");

/**
 * سجل موحّد للمخالفة: كتاب المدير ← إجراء الموارد للموظف ← اطّلاع/ردّ الموظف
 * كل مخالفة في بطاقة واحدة بدل جداول منفصلة.
 */
export default function DisciplinaryCasesSection({ employeeId, employeeName, authUserId, canIssuePenalty = true, onAddRecord }: Props) {
  const { cases, loading, refetch } = useDisciplinaryCases(employeeId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sendTargets, setSendTargets] = useState<SendTarget[] | null>(null);
  const [reportDetail, setReportDetail] = useState<DisciplinaryCase | null>(null);

  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-red-600" />
          سجل المخالفات الموحّد (المدير ← الموارد ← الموظف)
          {cases.length > 0 && <Badge variant="outline" className="text-xs">{cases.length}</Badge>}
        </h4>
        <div className="flex items-center gap-1">
          {onAddRecord && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onAddRecord}>
              <Plus className="h-3 w-3" /> إضافة مخالفة
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={refetch} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>
      </div>

      {cases.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{loading ? "جاري التحميل..." : "لا توجد مخالفات مسجلة"}</p>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => {
            const stage = caseStage(c);
            const decision = caseManagementDecision(c);
            const hrRec = c.report?.hr_recommendation || c.actions.find((a) => a.hr_recommendation)?.hr_recommendation || null;
            const hrRecNotes = c.report?.hr_recommendation_notes || c.actions.find((a) => a.hr_recommendation_notes)?.hr_recommendation_notes || null;
            const open = !!expanded[c.key];
            const report = c.report;
            return (
              <Card key={c.key} className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${STAGE_TONE[stage]}`}>{STAGE_LABELS[stage]}</Badge>
                      <span className="text-sm font-semibold break-words">{caseTitle(c)}</span>
                      <span className="text-xs text-muted-foreground">{c.openedAt.slice(0, 10)}</span>
                    </div>

                    {/* الخط الزمني المختصر */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className={`inline-flex items-center gap-1 ${report ? "text-foreground" : ""}`}>
                        <UserCog className="h-3.5 w-3.5" />
                        {report ? `كتاب المدير${report.form_data?.manager_name ? ` — ${report.form_data.manager_name}` : ""}` : "بدون كتاب مدير"}
                      </span>
                      <ChevronLeft className="h-3 w-3" />
                      <span className={`inline-flex items-center gap-1 ${c.actions.length ? "text-foreground" : ""}`}>
                        <Send className="h-3.5 w-3.5" />
                        {c.actions.length ? `إجراء الموارد (${c.actions.length})` : "لم يصدر إجراء"}
                      </span>
                      <ChevronLeft className="h-3 w-3" />
                      <span className={`inline-flex items-center gap-1 ${stage === "acknowledged" || stage === "responded" ? "text-emerald-700" : ""}`}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {stage === "responded" ? "ردّ الموظف" : stage === "acknowledged" ? "اطّلع الموظف" : "بانتظار الموظف"}
                      </span>
                      {decision && (
                        <>
                          <ChevronLeft className="h-3 w-3" />
                          <span className={`inline-flex items-center gap-1 ${decision.decision === "approved" ? "text-emerald-700" : "text-red-700"}`}>
                            <Gavel className="h-3.5 w-3.5" />
                            {decision.decision === "approved" ? "اعتماد الإدارة" : "عدم اعتماد الإدارة"}
                          </span>
                        </>
                      )}
                      {c.records.length > 0 && (
                        <>
                          <ChevronLeft className="h-3 w-3" />
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <FileText className="h-3.5 w-3.5" /> سجل داخلي ({c.records.length})
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => toggle(c.key)}>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                      {open ? "إخفاء" : "التفاصيل"}
                    </Button>
                    {canIssuePenalty && (
                      <Button
                        size="sm"
                        variant={c.actions.length === 0 ? "default" : "ghost"}
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          setSendTargets([
                            {
                              employee_id: employeeId,
                              employee_name: employeeName,
                              attendance_date: report ? report.created_at.slice(0, 10) : c.openedAt.slice(0, 10),
                              default_subject: caseTitle(c),
                              default_body: report?.form_data?.description || "",
                              source_form_id: report?.id || null,
                              source_form_type: report?.form_type || null,
                            },
                          ])
                        }
                      >
                        <Send className="h-3.5 w-3.5" />
                        {c.actions.length === 0 ? "إصدار إجراء للموظف" : "إجراء إضافي"}
                      </Button>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="mt-3 space-y-4">
                    <Separator />

                    {(hrRec || decision) && (
                      <div>
                        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                          <Gavel className="h-4 w-4 text-primary" /> قرار الإدارة وكتاب التوصية
                        </div>
                        {hrRec && (
                          <div className="rounded-md border border-border/60 p-3 text-sm mb-2">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">توصية الموارد البشرية</Badge>
                              <span className={hrRec === "approve" ? "text-emerald-700 text-xs" : "text-red-700 text-xs"}>
                                {hrRec === "approve" ? "توصية بالاعتماد" : "توصية بعدم الاعتماد"}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap break-words">{hrRecNotes || "بدون ملاحظات"}</div>
                          </div>
                        )}
                        {decision ? (
                          <div className={`rounded-md p-3 text-sm border ${decision.decision === "approved" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`}>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs bg-background">
                                {decision.decision === "approved" ? "اعتماد الإجراء" : "عدم اعتماد الإجراء"}
                              </Badge>
                              <span className="text-xs opacity-80">{fmt(decision.decidedAt)}</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words">
                              {decision.notes || "لم تُسجّل ملاحظات مع القرار."}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">لم يصدر قرار الإدارة بعد.</p>
                        )}
                      </div>
                    )}

                    {report && (
                      <div>
                        <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                          <UserCog className="h-4 w-4 text-amber-600" /> كتاب المدير المرفوع للموارد
                        </div>
                        <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {report.form_data?.description || report.title || "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>المدير: {report.form_data?.manager_name || "—"}</span>
                          <span>الفرع: {report.form_data?.branch || "—"}</span>
                          <span>الوردية: {report.form_data?.shift || "—"}</span>
                          <span>أُرسل: {fmt(report.created_at)}</span>
                          <span>الحالة: {STATUS_LABELS[report.status] || report.status}</span>
                        </div>
                        {report.review_notes && (
                          <div className="mt-2 rounded-md bg-amber-50 text-amber-900 p-2 text-sm whitespace-pre-wrap">
                            ملاحظة المراجعة: {report.review_notes}
                          </div>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs mt-1" onClick={() => setReportDetail(c)}>
                          عرض كامل الحقول
                        </Button>
                      </div>
                    )}

                    {c.actions.length > 0 && (
                      <div>
                        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                          <Send className="h-4 w-4 text-red-600" /> إجراء الموارد المُرسل للموظف
                        </div>
                        <div className="space-y-3">
                          {c.actions.map((a) => (
                            <div key={a.id} className="rounded-lg border border-border/60 p-3">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                {a.meta && <Badge className={`text-xs ${typeColor(a.meta.type)}`}>{typeLabel(a.meta.type)}</Badge>}
                                {a.meta?.penalty_kind && (
                                  <span className="text-xs text-muted-foreground">{penaltyLabel(a.meta.penalty_kind)}</span>
                                )}
                              </div>
                              <LinkedActionBody row={a} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.records.length > 0 && (
                      <div>
                        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" /> السجل الداخلي للمخالفة
                        </div>
                        <div className="space-y-2">
                          {c.records.map((r) => (
                            <div key={r.id} className={`rounded-md border border-border/60 p-3 text-sm ${r.cancelled_at ? "opacity-60" : ""}`}>
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">{r.title || "—"}</Badge>
                                <span className="text-xs text-muted-foreground">{r.record_date}</span>
                                {r.cancelled_at && (
                                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">ملغي</Badge>
                                )}
                              </div>
                              <div className="whitespace-pre-wrap break-words">{r.description || "—"}</div>
                              {r.action_taken && (
                                <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">الإجراء: {r.action_taken}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.actions.some((a) => a.meta?.employee_response) && (
                      <p className="text-xs text-indigo-700 flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" /> يوجد ردّ من الموظف ضمن الإجراءات أعلاه.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <SendHRMessageDialog
        open={!!sendTargets}
        onOpenChange={(o) => { if (!o) setSendTargets(null); }}
        authUserId={authUserId}
        targets={sendTargets || []}
        defaultType="penalty"
        canIssuePenalty={canIssuePenalty}
        onSent={() => { setSendTargets(null); refetch(); }}
      />

      <Dialog open={!!reportDetail} onOpenChange={(o) => { if (!o) setReportDetail(null); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base text-right">كتاب المدير — كامل الحقول</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {Object.entries((reportDetail?.report?.form_data || {}) as Record<string, any>).map(([k, v]) => (
              <div key={k} className="border-b border-border/30 py-1">
                <span className="text-muted-foreground">{k}: </span>
                <span className="whitespace-pre-wrap break-words">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

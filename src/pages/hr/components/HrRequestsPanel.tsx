import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Check,
  X,
  Eye,
  Plane,
  FileText,
  HandCoins,
  Fingerprint,
  Clock,
  Wallet,
  MessageSquare,
  HelpCircle,
  MapPin,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { tFormType } from "@/lib/hrLabels";

interface EmployeeLite {
  id: string;
  name: string;
  branch?: string | null;
}

interface Props {
  pendingRequests: {
    leaves: any[];
    loans: any[];
    forms: any[];
  };
  employees: EmployeeLite[];
}

// ─── Arabic mapping for form_type ───────────────────────────────
const FORM_TYPE_AR: Record<string, { label: string; icon: any }> = {
  leave_request: { label: "طلب إجازة", icon: Plane },
  advance_request: { label: "طلب سلفة", icon: Wallet },
  loan_request: { label: "طلب قرض", icon: HandCoins },
  correction_request: { label: "تصحيح بصمة", icon: Fingerprint },
  overtime_request: { label: "طلب أوفر تايم", icon: Clock },
  hr_message: { label: "رسالة لـ HR", icon: MessageSquare },
  complaint: { label: "شكوى وملاحظات", icon: MessageSquare },
  complaints: { label: "شكوى وملاحظات", icon: MessageSquare },
  employee_info: { label: "معلومات الموظف", icon: FileText },
  birthday_whatsapp: { label: "معلومات الموظف", icon: FileText },
  disciplinary_action: { label: "إجراء عقابي", icon: FileText },
  other: { label: "أخرى", icon: HelpCircle },
};

const formTypeMeta = (t: string) => {
  const hit = FORM_TYPE_AR[t];
  if (hit) return hit;
  // fallback: use shared Arabic helper, never expose raw English keys
  const arabic = tFormType(t);
  return { label: arabic && arabic !== t ? arabic : "أخرى", icon: FileText };
};

const STATUS_AR: Record<string, string> = {
  pending: "قيد المراجعة",
  معلقة: "قيد المراجعة",
  "قيد المراجعة": "قيد المراجعة",
  approved: "تمت الموافقة",
  معتمد: "تمت الموافقة",
  موافقة: "تمت الموافقة",
  rejected: "مرفوض",
  مرفوض: "مرفوض",
  مرفوضة: "مرفوض",
};

const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mn}`;
};

const fmtMoney = (v: any): string | null => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(n)} ₪`;
};

/** يستخرج المبلغ (إن وُجد) من form_data للنموذج */
const extractAmount = (f: any): string | null => {
  const fd = f?.form_data || {};
  return fmtMoney(fd.amount ?? fd.value ?? fd.requested_amount ?? null);
};

/** يستخرج وصف/تفاصيل النموذج من حقول مرنة */
const extractDetails = (f: any): string => {
  const fd = f?.form_data || {};
  const t = f?.form_type as string;

  // طلب إجازة → نطاق التواريخ
  if (t === "leave_request" && (fd.start_date || fd.end_date)) {
    const range = `${fd.start_date ?? "—"} → ${fd.end_date ?? "—"}`;
    const type = fd.leave_type ? ` | ${fd.leave_type}` : "";
    return `${range}${type}`;
  }
  // أوفر تايم → عدد ساعات
  if (t === "overtime_request" && fd.hours) {
    return `${fd.hours} ساعة`;
  }
  // تصحيح بصمة → الوقت/التاريخ
  if (t === "correction_request") {
    const when = fd.date || fd.target_date || "";
    const time = fd.time || fd.target_time || "";
    const reason = fd.reason || fd.notes || "";
    return [when, time, reason].filter(Boolean).join(" — ") || "—";
  }

  return (
    fd.description ||
    fd.details ||
    fd.reason ||
    fd.notes ||
    fd.message ||
    f?.review_notes ||
    "—"
  );
};

export function HrRequestsPanel({ pendingRequests, employees }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const empMap = new Map(employees.map((e) => [e.id, e]));
  const empName = (id: string) => empMap.get(id)?.name || "—";
  const empBranch = (id: string) => empMap.get(id)?.branch || "—";

  const review = async (
    table: "employee_leaves" | "employee_forms",
    id: string,
    status: "approved" | "rejected",
  ) => {
    const arabicStatus =
      table === "employee_leaves"
        ? status === "approved" ? "موافقة" : "مرفوضة"
        : status === "approved" ? "معتمد" : "مرفوض";
    const { error } = await (supabase as any)
      .from(table)
      .update({ status: arabicStatus, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    // Sync employee_info → employees row (does NOT touch fingerprint_id)
    if (table === "employee_forms" && status === "approved") {
      const { data: f } = await (supabase as any)
        .from("employee_forms")
        .select("form_type, form_data, employee_id")
        .eq("id", id)
        .maybeSingle();
      if (f?.form_type === "employee_info" && f.employee_id) {
        const d = (f.form_data || {}) as Record<string, any>;
        const maritalMap: Record<string, string> = {
          "أعزب": "single", "متزوج": "married", "مطلق": "divorced", "أرمل": "widowed",
        };
        const phone = d.whatsapp || (d.whatsapp_prefix && d.whatsapp_local
          ? `${d.whatsapp_prefix}${String(d.whatsapp_local).replace(/\D/g, "").replace(/^0/, "")}`
          : null);
        const patch: Record<string, any> = {};
        if (phone) patch.phone = phone;
        if (d.date_of_birth) patch.date_of_birth = d.date_of_birth;
        if (d.id_number) patch.id_number = String(d.id_number).replace(/\D/g, "");
        if (d.malaky_start_date) patch.start_date = d.malaky_start_date;
        if (d.marital_status) patch.marital_status = maritalMap[d.marital_status] || d.marital_status;
        if (d.children_count !== undefined && d.children_count !== "") patch.children_count = Number(d.children_count) || 0;
        if (Object.keys(patch).length > 0) {
          await (supabase as any).from("employees").update(patch).eq("id", f.employee_id);
        }
      }
    }
    toast({
      title: status === "approved" ? "تمت الموافقة" : "تم الرفض",
      description: "تم تحديث حالة الطلب بنجاح",
    });
    qc.invalidateQueries({ queryKey: ["hr-command-center"] });
    qc.invalidateQueries({ queryKey: ["leaves-all-records"] });
    qc.invalidateQueries({ queryKey: ["employee-360"] });
  };

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-right flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          الطلبات المعلقة
        </CardTitle>
      </CardHeader>
      <CardContent dir="rtl">
        <Tabs defaultValue="forms" dir="rtl">
          <TabsList className="w-full justify-start mb-3 flex-row-reverse">
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

          {/* ─── Leaves tab ───────────────────────────── */}
          <TabsContent value="leaves" className="mt-0">
            {pendingRequests.leaves.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
                {pendingRequests.leaves.slice(0, 30).map((r) => (
                  <RequestRow
                    key={r.id}
                    title={empName(r.employee_id)}
                    branch={empBranch(r.employee_id)}
                    typeLabel={r.leave_type || "إجازة"}
                    TypeIcon={Plane}
                    amount={null}
                    details={`${r.start_date} → ${r.end_date} (${r.days_count} يوم)`}
                    dateLabel={fmtDateTime(r.created_at)}
                    statusLabel={STATUS_AR[r.status] || r.status || "قيد المراجعة"}
                    onApprove={() => review("employee_leaves", r.id, "approved")}
                    onReject={() => review("employee_leaves", r.id, "rejected")}
                    onView={() => navigate(`/hr/employee/${r.employee_id}`)}
                  />
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ─── Forms tab ────────────────────────────── */}
          <TabsContent value="forms" className="mt-0">
            {pendingRequests.forms.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
                {pendingRequests.forms.slice(0, 30).map((f) => {
                  const meta = formTypeMeta(f.form_type);
                  return (
                    <RequestRow
                      key={f.id}
                      title={empName(f.employee_id)}
                      branch={empBranch(f.employee_id)}
                      typeLabel={meta.label}
                      TypeIcon={meta.icon}
                      amount={extractAmount(f)}
                      details={extractDetails(f)}
                      dateLabel={fmtDateTime(f.created_at)}
                      statusLabel={STATUS_AR[f.status] || f.status || "قيد المراجعة"}
                      onApprove={() => review("employee_forms", f.id, "approved")}
                      onReject={() => review("employee_forms", f.id, "rejected")}
                      onView={() => navigate(`/hr/employee/${f.employee_id}`)}
                    />
                  );
                })}
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

// ─────────────────────────────────────────────────────────────────
interface RowProps {
  title: string;
  branch: string;
  typeLabel: string;
  TypeIcon: any;
  amount: string | null;
  details: string;
  dateLabel: string;
  statusLabel: string;
  onApprove: () => void;
  onReject: () => void;
  onView: () => void;
}

function RequestRow({
  title,
  branch,
  typeLabel,
  TypeIcon,
  amount,
  details,
  dateLabel,
  statusLabel,
  onApprove,
  onReject,
  onView,
}: RowProps) {
  return (
    <li className="py-3 flex items-start gap-3" dir="rtl">
      {/* Body */}
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate">{title}</p>
          {branch && branch !== "—" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {branch}
            </span>
          )}
          <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
            <TypeIcon className="h-3 w-3" />
            {typeLabel}
          </Badge>
          {amount && (
            <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/20">
              {amount}
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">
          {details}
        </p>

        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          <span>{dateLabel}</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          title="موافقة"
          className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
          onClick={onApprove}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="رفض"
          className="h-7 w-7 text-rose-600 hover:bg-rose-500/10"
          onClick={onReject}
        >
          <X className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="عرض"
          className="h-7 w-7 text-muted-foreground hover:bg-accent"
          onClick={onView}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function Empty({ msg = "لا توجد طلبات معلقة" }: { msg?: string }) {
  return <p className="text-center text-sm text-muted-foreground py-8">✓ {msg}</p>;
}
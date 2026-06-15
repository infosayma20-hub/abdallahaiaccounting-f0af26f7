import { Badge } from "@/components/ui/badge";
import { FileEdit, Send, Eye, CheckCircle2, XCircle } from "lucide-react";

export type WorkflowStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected";

const meta: Record<WorkflowStatus, { label: string; icon: any; cls: string }> = {
  draft:        { label: "مسودة",        icon: FileEdit,    cls: "bg-slate-100 text-slate-700 border-slate-200" },
  submitted:    { label: "مُرسلة",        icon: Send,        cls: "bg-blue-50 text-blue-700 border-blue-200" },
  under_review: { label: "قيد المراجعة",  icon: Eye,         cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:     { label: "معتمدة",        icon: CheckCircle2,cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:     { label: "مرفوضة",        icon: XCircle,     cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function FormStatusBadge({ status }: { status?: string | null }) {
  const s = (status || "draft") as WorkflowStatus;
  const m = meta[s] || meta.draft;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[11px] font-medium">{m.label}</span>
    </Badge>
  );
}
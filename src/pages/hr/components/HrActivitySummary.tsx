import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle2, XCircle, ClipboardList, Printer, UserCog, Eye, Send, UserCheck } from "lucide-react";
import { tFormType } from "@/lib/hrLabels";

type ActivityItem = {
  id: string;
  at: string;
  text: string;
  actor: string;
  kind: "approve" | "reject" | "submit" | "print" | "user" | "info" | "seen";
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_BACK = 7;

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / DAY_MS);
  const datePart = new Intl.DateTimeFormat("ar-PS", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  if (diff === 0) return `اليوم — ${datePart}`;
  if (diff === 1) return `أمس — ${datePart}`;
  return datePart;
}

function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat("ar-PS", { hour: "2-digit", minute: "2-digit" }).format(new Date(dateStr));
}

const KIND_META: Record<ActivityItem["kind"], { Icon: any; cls: string }> = {
  approve: { Icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  reject: { Icon: XCircle, cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  submit: { Icon: Send, cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  print: { Icon: Printer, cls: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  user: { Icon: UserCog, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  seen: { Icon: Eye, cls: "bg-muted text-muted-foreground" },
  info: { Icon: ClipboardList, cls: "bg-muted text-muted-foreground" },
};

const AUDIT_ACTION: Record<string, { kind: ActivityItem["kind"]; verb: string }> = {
  created: { kind: "submit", verb: "قدّم طلب جديد" },
  workflow_submitted: { kind: "submit", verb: "أرسل طلباً للمراجعة" },
  approved: { kind: "approve", verb: "اعتمد" },
  rejected: { kind: "reject", verb: "رفض" },
  hr_recommendation_approve: { kind: "approve", verb: "قدّم توصية الموارد البشرية بالموافقة على" },
  hr_recommendation_reject: { kind: "reject", verb: "قدّم توصية الموارد البشرية بالرفض على" },
  final_decision: { kind: "approve", verb: "أصدر القرار النهائي على" },
  management_seen: { kind: "seen", verb: "اطّلع على" },
  employee_acknowledged: { kind: "seen", verb: "وقّع الموظف بالاطلاع على" },
};

const USER_ACTION: Record<string, string> = {
  create_user: "أنشأ مستخدماً جديداً",
  create_team_account: "أنشأ حساب فريق",
  change_role: "غيّر دور مستخدم",
  reset_password_denied: "محاولة مرفوضة لإعادة تعيين كلمة مرور",
};

export function HrActivitySummary() {
  const since = useMemo(() => new Date(Date.now() - DAYS_BACK * DAY_MS).toISOString(), []);

  const { data: items, isLoading } = useQuery({
    queryKey: ["hr-activity-summary", since],
    queryFn: async (): Promise<ActivityItem[]> => {
      const [auditRes, printsRes, usersRes] = await Promise.all([
        supabase
          .from("employee_form_audit_log")
          .select("id, created_at, action, actor_name, employee_forms(form_type, employees(full_name))")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("employee_letter_prints")
          .select("id, printed_at, printed_by_name, employee_name")
          .gte("printed_at", since)
          .order("printed_at", { ascending: false })
          .limit(100),
        supabase
          .from("activity_log")
          .select("id, created_at, action, actor_name, entity_label")
          .eq("entity_type", "user")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const out: ActivityItem[] = [];

      for (const r of auditRes.data ?? []) {
        const meta = AUDIT_ACTION[r.action];
        if (!meta) continue;
        const form = (r as any).employee_forms;
        const formLabel = tFormType(form?.form_type);
        const empName = form?.employees?.full_name;
        out.push({
          id: `a-${r.id}`,
          at: r.created_at,
          text: `${meta.verb} «${formLabel}»${empName ? ` — ${empName}` : ""}`,
          actor: r.actor_name || "النظام",
          kind: meta.kind,
        });
      }

      for (const r of printsRes.data ?? []) {
        out.push({
          id: `p-${r.id}`,
          at: r.printed_at,
          text: `طبع كتاب إثبات عمل للموظف «${r.employee_name}»`,
          actor: r.printed_by_name || "—",
          kind: "print",
        });
      }

      for (const r of usersRes.data ?? []) {
        const verb = USER_ACTION[r.action];
        if (!verb) continue;
        out.push({
          id: `u-${r.id}`,
          at: r.created_at,
          text: `${verb}${r.entity_label ? `: ${r.entity_label}` : ""}`,
          actor: r.actor_name || "—",
          kind: "user",
        });
      }

      out.sort((a, b) => b.at.localeCompare(a.at));
      return out.slice(0, 150);
    },
    refetchInterval: 60_000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const it of items ?? []) {
      const day = it.at.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(it);
    }
    return Array.from(map.entries()).map(([day, list]) => ({ day, list }));
  }, [items]);

  return (
    <Card dir="rtl" className="rounded-3xl border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-lg font-bold">
          <span className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </span>
            ملخص النشاطات
          </span>
          {items && (
            <Badge variant="secondary" className="text-xs font-normal">
              آخر {DAYS_BACK} أيام
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          الحركات التي تمت على نماذج الموظفين والطلبات والكتب، مجمّعة حسب اليوم
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            لا توجد نشاطات مسجلة خلال الأيام الماضية
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ day, list }) => (
              <div key={day}>
                <div className="mb-3 flex items-center gap-3">
                  <h3 className="text-sm font-bold text-foreground">{formatDayLabel(day)}</h3>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{list.length} حركة</span>
                </div>
                <ul className="space-y-2">
                  {list.map((it) => {
                    const meta = KIND_META[it.kind];
                    return (
                      <li
                        key={it.id}
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.cls}`}
                        >
                          <meta.Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{it.text}</p>
                          <p className="text-xs text-muted-foreground">بواسطة: {it.actor}</p>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatTime(it.at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default HrActivitySummary;

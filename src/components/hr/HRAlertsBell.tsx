import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ClipboardList, MessagesSquare, Loader2, Cake, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ensureNotificationPermission, notifyChat } from "@/lib/chat-notify";

type FormAlert = {
  id: string;
  title: string;
  form_type: string;
  at: string;
  employee_name: string;
};

/** Human labels for every request type an employee can send to HR. */
const FORM_TYPE_LABEL: Record<string, string> = {
  leave_request: "طلب إجازة",
  advance_request: "طلب سلفة",
  loan_request: "طلب قرض",
  overtime_request: "طلب ساعات إضافية",
  correction_request: "طلب تصحيح بصمة",
  complaints: "شكوى / اقتراح",
  disciplinary_action: "إجراء عقابي",
  employee_info: "تحديث بيانات موظف",
  hr_message: "رسالة للموارد البشرية",
  facility_quality: "تقرير مدير الجودة اليومي",
  inventory_balance: "نموذج جرد",
  dynamic_template: "نموذج ديناميكي",
  birthday_whatsapp: "تهنئة عيد ميلاد",
};

function formTypeLabel(t?: string | null) {
  if (!t) return "نموذج";
  return FORM_TYPE_LABEL[t] || "نموذج";
}

type ChatAlert = {
  id: string;
  employee_name: string;
  preview: string;
  unread: number;
  at: string | null;
};

type BirthdayAlert = {
  id: string;
  employee_name: string;
  phone: string | null;
  daysLeft: number;
  dateLabel: string;
};

type MilestoneAlert = {
  key: string;
  id: string;
  employee_name: string;
  label: string;
  daysLeft: number;
  dateLabel: string;
};

/** محطات الخدمة التي تترتب عليها إجراءات داخلية في قسم الموارد البشرية. */
const SERVICE_MILESTONES: { label: string; days?: number; months?: number; action: string }[] = [
  { label: "أسبوع عمل", days: 7, action: "تقييم فترة التعريف وتسليم العهدة" },
  { label: "3 أشهر", months: 3, action: "تقييم فترة التجربة الأولى" },
  { label: "6 أشهر", months: 6, action: "تقييم نصف سنوي / تثبيت" },
  { label: "سنة", months: 12, action: "تجديد العقد ورصيد الإجازة السنوية" },
  { label: "5 سنوات", months: 60, action: "مكافأة الولاء ومراجعة الراتب" },
];

function addMonths(base: Date, months: number) {
  const d = new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
  return d;
}

/** محطات الخدمة القادمة خلال 7 أيام (بما فيها اليوم) اعتماداً على تاريخ المباشرة. */
function computeMilestones(rows: { id: string; full_name: string; start_date: string | null }[]): MilestoneAlert[] {
  const today = new Date();
  const mid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: MilestoneAlert[] = [];
  rows.forEach((r) => {
    if (!r.start_date || r.start_date.length < 10) return;
    const y = Number(r.start_date.slice(0, 4));
    const m = Number(r.start_date.slice(5, 7));
    const d = Number(r.start_date.slice(8, 10));
    if (!y || !m || !d) return;
    const start = new Date(y, m - 1, d);
    SERVICE_MILESTONES.forEach((ms) => {
      const due = ms.days
        ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + ms.days)
        : addMonths(start, ms.months || 0);
      const daysLeft = Math.round((due.getTime() - mid.getTime()) / 86400000);
      if (daysLeft < 0 || daysLeft > 7) return;
      out.push({
        key: `${r.id}-${ms.label}`,
        id: r.id,
        employee_name: r.full_name,
        label: `${ms.label} — ${ms.action}`,
        daysLeft,
        dateLabel: due.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" }),
      });
    });
  });
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** أعياد الميلاد خلال الأيام السبعة القادمة (بما فيها اليوم). */
function computeBirthdays(rows: { id: string; full_name: string; phone: string | null; date_of_birth: string | null }[]): BirthdayAlert[] {
  const today = new Date();
  const mid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: BirthdayAlert[] = [];
  rows.forEach((r) => {
    if (!r.date_of_birth || r.date_of_birth.length < 10) return;
    const m = Number(r.date_of_birth.slice(5, 7));
    const d = Number(r.date_of_birth.slice(8, 10));
    if (!m || !d) return;
    let next = new Date(mid.getFullYear(), m - 1, d);
    if (next < mid) next = new Date(mid.getFullYear() + 1, m - 1, d);
    const daysLeft = Math.round((next.getTime() - mid.getTime()) / 86400000);
    if (daysLeft > 7) return;
    out.push({
      id: r.id,
      employee_name: r.full_name,
      phone: r.phone,
      daysLeft,
      dateLabel: next.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" }),
    });
  });
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

function ago(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Live alerts for HR/admin: new employee form submissions + unread employee chat messages. */
export default function HRAlertsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<FormAlert[]>([]);
  const [chats, setChats] = useState<ChatAlert[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayAlert[]>([]);
  const [milestones, setMilestones] = useState<MilestoneAlert[]>([]);
  const prevTotal = useRef<number | null>(null);

  const load = useCallback(async () => {
    const [formsRes, chatsRes, empRes] = await Promise.all([
      // Everything an employee sends to HR and is still waiting on a decision:
      // legacy forms use `status = pending`, newer dynamic templates move through
      // `workflow_status`. Archived forms are excluded.
      supabase
        .from("employee_forms")
        .select("id, title, form_type, status, submitted_at, created_at, workflow_status, employees!inner(full_name)")
        .is("archived_at", null)
        .or("status.eq.pending,workflow_status.in.(submitted,under_review)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("hr_chat_threads")
        .select("id, unread_for_hr, last_message_preview, last_message_at, employees!inner(full_name)")
        .gt("unread_for_hr", 0)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(25),
      supabase
        .from("employees")
        .select("id, full_name, phone, date_of_birth, start_date")
        .eq("is_active", true),
    ]);
    setLoading(false);
    if (empRes.data) {
      setBirthdays(computeBirthdays((empRes.data as any[]).filter((r) => r.date_of_birth)));
      setMilestones(computeMilestones(empRes.data as any[]));
    }
    if (formsRes.data) {
      setForms(
        (formsRes.data as any[]).map((r) => ({
          id: r.id,
          title: r.title || formTypeLabel(r.form_type),
          form_type: r.form_type,
          at: r.submitted_at || r.created_at,
          employee_name: r.employees?.full_name || "—",
        }))
      );
    }
    if (chatsRes.data) {
      setChats(
        (chatsRes.data as any[]).map((r) => ({
          id: r.id,
          employee_name: r.employees?.full_name || "—",
          preview: r.last_message_preview || "رسالة جديدة",
          unread: r.unread_for_hr ?? 0,
          at: r.last_message_at,
        }))
      );
    }
  }, []);

  useEffect(() => {
    ensureNotificationPermission();
    load();
    const channel = supabase
      .channel("hr-alerts-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_forms" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "hr_chat_threads" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const todayBirthdays = birthdays.filter((b) => b.daysLeft === 0);
  const todayMilestones = milestones.filter((m) => m.daysLeft === 0);
  const total =
    forms.length + chats.reduce((s, c) => s + c.unread, 0) + todayBirthdays.length + todayMilestones.length;

  // Sound + browser notification whenever the alert count grows.
  useEffect(() => {
    if (loading) return;
    const prev = prevTotal.current;
    prevTotal.current = total;
    if (prev === null || total <= prev) return;
    notifyChat("تنبيهات الموظفين", `لديك ${total} تنبيه جديد (رسائل / طلبات)`);
  }, [total, loading]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="تنبيهات الموظفين — طلبات ورسائل جديدة"
          className="relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] rounded-md text-rose-600 hover:bg-rose-500/10 shrink-0 h-auto"
        >
          <Bell className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">تنبيهات الموظفين</span>
          {total > 0 && (
            <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="end" className="w-[340px] p-0 max-h-[420px] overflow-y-auto">
        <div className="px-3 py-2 border-b border-border text-sm font-semibold">تنبيهات الموظفين</div>

        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && total === 0 && birthdays.length === 0 && milestones.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">لا توجد تنبيهات جديدة.</div>
        )}

        {milestones.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40">
              محطات خدمة الموظفين (أسبوع / 3 / 6 أشهر / سنة / 5 سنوات)
            </div>
            {milestones.map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  setOpen(false);
                  navigate(`/employees/${m.id}`);
                }}
                className="w-full text-right px-3 py-2 hover:bg-muted/50 border-b border-border/60"
              >
                <div className="flex items-center gap-2">
                  <Award className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-semibold truncate">{m.employee_name}</span>
                  {m.daysLeft === 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 shrink-0">اليوم</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">بعد {m.daysLeft} يوم</span>
                  )}
                  <span className="mr-auto text-[10px] text-muted-foreground">{m.dateLabel}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate mt-0.5">{m.label}</div>
              </button>
            ))}
          </div>
        )}

        {birthdays.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40">أعياد ميلاد الموظفين (خلال 7 أيام)</div>
            {birthdays.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setOpen(false);
                  navigate("/hr/reports?tab=occasions");
                }}
                className="w-full text-right px-3 py-2 hover:bg-muted/50 border-b border-border/60"
              >
                <div className="flex items-center gap-2">
                  <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                  <span className="text-xs font-semibold truncate">{b.employee_name}</span>
                  {b.daysLeft === 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-700 shrink-0">اليوم 🎂</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">بعد {b.daysLeft} يوم</span>
                  )}
                  <span className="mr-auto text-[10px] text-muted-foreground">{b.dateLabel}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {b.daysLeft === 0 ? "جهّز التهنئة والاحتفال للموظف اليوم" : "تحضير مسبق للتهنئة"}
                </div>
              </button>
            ))}
          </div>
        )}

        {chats.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40">رسائل جديدة</div>
            {chats.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setOpen(false);
                  navigate(`/hr/chat?thread=${c.id}`);
                }}
                className="w-full text-right px-3 py-2 hover:bg-muted/50 border-b border-border/60"
              >
                <div className="flex items-center gap-2">
                  <MessagesSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold truncate">{c.employee_name}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{ago(c.at)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate mt-0.5">{c.preview}</div>
              </button>
            ))}
          </div>
        )}

        {forms.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40">طلبات ونماذج بانتظار المراجعة</div>
            {forms.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setOpen(false);
                  navigate(`/employee-forms-management?formId=${f.id}`);
                }}
                className={cn("w-full text-right px-3 py-2 hover:bg-muted/50 border-b border-border/60")}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold truncate">{f.employee_name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 shrink-0">
                    {formTypeLabel(f.form_type)}
                  </span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{ago(f.at)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate mt-0.5">{f.title}</div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
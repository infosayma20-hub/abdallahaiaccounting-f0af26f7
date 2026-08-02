import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ClipboardList, MessagesSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type FormAlert = {
  id: string;
  title: string;
  form_type: string;
  at: string;
  employee_name: string;
};

type ChatAlert = {
  id: string;
  employee_name: string;
  preview: string;
  unread: number;
  at: string | null;
};

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

  const load = useCallback(async () => {
    const [formsRes, chatsRes] = await Promise.all([
      supabase
        .from("employee_forms")
        .select("id, title, form_type, submitted_at, created_at, workflow_status, employees!inner(full_name)")
        .in("workflow_status", ["submitted", "under_review"])
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("hr_chat_threads")
        .select("id, unread_for_hr, last_message_preview, last_message_at, employees!inner(full_name)")
        .gt("unread_for_hr", 0)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(25),
    ]);
    setLoading(false);
    if (formsRes.data) {
      setForms(
        (formsRes.data as any[]).map((r) => ({
          id: r.id,
          title: r.title || "نموذج",
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

  const total = forms.length + chats.reduce((s, c) => s + c.unread, 0);

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

        {!loading && total === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">لا توجد تنبيهات جديدة.</div>
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
                  navigate("/employee-forms-management");
                }}
                className={cn("w-full text-right px-3 py-2 hover:bg-muted/50 border-b border-border/60")}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold truncate">{f.employee_name}</span>
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
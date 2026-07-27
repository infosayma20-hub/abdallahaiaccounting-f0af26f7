import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useInternalMessages,
  IMRecipientInput,
  IMRole,
  InternalMessageRow,
} from "@/hooks/useInternalMessages";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab, FilterField, FilterCondition } from "@/components/finance/shell/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageSquarePlus,
  Inbox,
  Send,
  Archive,
  CheckCircle2,
  Clock,
  X,
  Reply as ReplyIcon,
  User as UserIcon,
  ShieldCheck,
  RefreshCw,
  Search,
} from "lucide-react";

const ROLE_LABELS: Record<IMRole, string> = {
  admin: "المالك / الأدمن",
  hr_manager: "الموارد البشرية",
  accountant_senior: "محاسب رئيسي",
  accountant_sales: "محاسب مبيعات",
  accountant_purchases: "محاسب مشتريات",
  cashier: "الصندوق",
  supervisor: "مشرف",
  super_admin: "سوبر أدمن",
};

interface TeamPerson {
  auth_user_id: string;
  name: string;
  role?: string;
}

function useTeamPeople() {
  const { user } = useAuth();
  const [people, setPeople] = useState<TeamPerson[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: owner } = await supabase.rpc("get_team_owner_id", {
        _user_id: user.id,
      });
      const ownerId = (owner as string) || user.id;
      const [profiles, employees, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, display_name")
          .or(`user_id.eq.${ownerId},invited_by.eq.${ownerId}`),
        supabase
          .from("employees")
          .select("auth_user_id, full_name, is_active")
          .eq("user_id", ownerId),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const byId = new Map<string, TeamPerson>();
      (profiles.data || []).forEach((p: any) => {
        if (!p.user_id) return;
        byId.set(p.user_id, {
          auth_user_id: p.user_id,
          name: p.full_name || p.display_name || "بدون اسم",
        });
      });
      (employees.data || []).forEach((e: any) => {
        if (!e.auth_user_id || e.is_active === false) return;
        const existing = byId.get(e.auth_user_id);
        byId.set(e.auth_user_id, {
          auth_user_id: e.auth_user_id,
          name: e.full_name || existing?.name || "موظف",
        });
      });
      const roleMap = new Map<string, string>();
      (roles.data || []).forEach((r: any) => {
        if (byId.has(r.user_id) && !roleMap.has(r.user_id)) {
          roleMap.set(r.user_id, r.role);
        }
      });
      const list = Array.from(byId.values()).map(p => ({
        ...p,
        role: roleMap.get(p.auth_user_id),
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      setPeople(list);
    })();
  }, [user?.id]);
  return people;
}

export default function InternalMessagesPage() {
  const { user } = useAuth();
  const {
    inbox,
    sent,
    recipients,
    unreadCount,
    isMyRecipient,
    send,
    markRead,
    markDone,
    archive,
    refresh,
  } = useInternalMessages();
  const people = useTeamPeople();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selected, setSelected] = useState<InternalMessageRow | null>(null);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"inbox" | "sent" | "archive">("inbox");
  const [search, setSearch] = useState("");
  const [shellFilters, setShellFilters] = useState<FilterCondition[]>([]);

  useEffect(() => {
    const prev = document.title;
    document.title = "الرسائل الداخلية";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    const openId = params.get("open");
    if (openId) {
      const m = [...inbox, ...sent].find(x => x.id === openId);
      if (m) setSelected(m);
    }
  }, [params, inbox, sent]);

  useEffect(() => {
    if (selected) markRead(selected.id).catch(() => {});
  }, [selected?.id, markRead]);

  const baseList =
    tab === "inbox"
      ? inbox.filter(m => m.status !== "archived")
      : tab === "sent"
      ? sent.filter(m => m.status !== "archived")
      : [...inbox, ...sent].filter(m => m.status === "archived");

  const list = baseList.filter(m => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !m.subject?.toLowerCase().includes(q) &&
        !m.body?.toLowerCase().includes(q) &&
        !(m.sender_name || "").toLowerCase().includes(q)
      )
        return false;
    }
    for (const f of shellFilters) {
      if (!f.value) continue;
      const v = f.value.toLowerCase();
      if (f.fieldKey === "status" && m.status !== f.value) return false;
      if (f.fieldKey === "priority" && (m as any).priority !== f.value) return false;
      if (f.fieldKey === "subject" && !m.subject?.toLowerCase().includes(v))
        return false;
    }
    return true;
  });

  const actionTabs: ActionTab[] = [
    {
      key: "home",
      label: "الرئيسية",
      groups: [
        {
          key: "new",
          label: "جديد",
          items: [
            {
              key: "compose",
              label: "رسالة جديدة",
              icon: MessageSquarePlus,
              onClick: () => setComposeOpen(true),
              variant: "primary",
              shortcut: "Alt+N",
            },
          ],
        },
        {
          key: "view",
          label: "عرض",
          items: [
            {
              key: "inbox",
              label: `الوارد${unreadCount ? ` (${unreadCount})` : ""}`,
              icon: Inbox,
              onClick: () => setTab("inbox"),
            },
            { key: "sent", label: "المرسل", icon: Send, onClick: () => setTab("sent") },
            {
              key: "archive",
              label: "الأرشيف",
              icon: Archive,
              onClick: () => setTab("archive"),
            },
          ],
        },
        {
          key: "tools",
          label: "أدوات",
          items: [
            {
              key: "refresh",
              label: "تحديث",
              icon: RefreshCw,
              onClick: () => refresh?.(),
            },
          ],
        },
      ],
    },
    {
      key: "actions",
      label: "إجراءات الرسالة",
      groups: [
        {
          key: "status",
          label: "الحالة",
          items: [
            {
              key: "done",
              label: "تم التنفيذ",
              icon: CheckCircle2,
              onClick: () => selected && markDone(selected.id, true),
              disabled: !selected || selected.status !== "open",
            },
            {
              key: "reopen",
              label: "إعادة فتح",
              icon: Clock,
              onClick: () => selected && markDone(selected.id, false),
              disabled: !selected || selected.status !== "done",
            },
            {
              key: "archive-sel",
              label: "أرشفة",
              icon: Archive,
              onClick: () => {
                if (!selected) return;
                archive(selected.id);
                setSelected(null);
              },
              disabled: !selected,
            },
          ],
        },
      ],
    },
  ];

  const filterFields: FilterField[] = [
    { key: "subject", label: "الموضوع", type: "text" },
    {
      key: "status",
      label: "الحالة",
      type: "option",
      options: [
        { value: "open", label: "مفتوحة" },
        { value: "done", label: "منفذة" },
        { value: "archived", label: "مؤرشفة" },
      ],
    },
    {
      key: "priority",
      label: "الأولوية",
      type: "option",
      options: [
        { value: "low", label: "منخفضة" },
        { value: "normal", label: "عادية" },
        { value: "high", label: "عالية" },
      ],
    },
  ];

  const totalCount = inbox.length + sent.length;
  const openCount = [...inbox, ...sent].filter(m => m.status === "open").length;
  const doneCount = [...inbox, ...sent].filter(m => m.status === "done").length;
  const overdueCount = [...inbox, ...sent].filter(
    m => m.remind_at && new Date(m.remind_at) <= new Date() && m.status === "open",
  ).length;

  return (
    <FinanceShell
      title="الرسائل الداخلية"
      subtitle="مراسلات بين الأقسام (موارد بشرية ↔ محاسبة ↔ إدارة) مع تذكيرات بتاريخ محدد"
      breadcrumb={[
        { label: "الرئيسية", href: "/" },
        { label: "التواصل الداخلي" },
        { label: tab === "inbox" ? "الوارد" : tab === "sent" ? "المرسل" : "الأرشيف" },
      ]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      filters={shellFilters}
      onFiltersChange={setShellFilters}
      storageKey="internal-messages-page"
      rightSlot={
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الرسائل..."
            className="h-8 w-56 pr-8 text-xs"
          />
        </div>
      }
    >
      <div className="space-y-4 w-full bg-muted/30 p-3 rounded-md border border-border" dir="rtl">
        {/* D365-style KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="الإجمالي" value={totalCount} sub="كل الرسائل" tone="default" />
          <KpiCard label="غير مقروءة" value={unreadCount} sub="في الوارد" tone="primary" />
          <KpiCard label="مفتوحة" value={openCount} sub="بانتظار التنفيذ" tone="warning" />
          <KpiCard label="متأخرة" value={overdueCount} sub="تجاوزت التذكير" tone="danger" />
        </div>

        {/* FastTab-style section switcher */}
        <div className="flex items-center gap-1 border border-border rounded-md bg-card px-2 shadow-sm">
          {[
            { k: "inbox", label: "الوارد", icon: Inbox, badge: unreadCount },
            { k: "sent", label: "المرسل", icon: Send, badge: 0 },
            { k: "archive", label: "الأرشيف", icon: Archive, badge: 0 },
          ].map(t => {
            const active = tab === (t.k as any);
            const Icon = t.icon;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k as any)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.badge > 0 && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                    {t.badge}
                  </Badge>
                )}
              </button>
            );
          })}
          <div className="mr-auto text-[11px] text-muted-foreground pb-2">
            {list.length} سجل • {doneCount} منفذ
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-3">
          <Card className="p-0 overflow-hidden max-h-[70vh] overflow-y-auto border border-border rounded-md bg-card shadow-sm">
              {list.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  لا توجد رسائل
                </div>
              ) : (
                list.map(m => {
                  const mine = recipients.filter(
                    r => r.message_id === m.id && isMyRecipient(r)
                  );
                  const unread = tab === "inbox" && mine.some(r => !r.read_at);
                  const done = m.status === "done";
                  const overdue =
                    m.remind_at &&
                    new Date(m.remind_at) <= new Date() &&
                    m.status === "open";
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelected(m)}
                      className={`w-full text-right p-3 border-b border-border hover:bg-muted/40 transition-colors ${
                        selected?.id === m.id ? "bg-primary/5" : ""
                      } ${unread ? "font-semibold" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {unread && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                        <span className="text-sm truncate flex-1">{m.subject}</span>
                        {done && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        )}
                        {overdue && (
                          <Clock className="h-3.5 w-3.5 text-warning" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                        <span className="truncate">
                          {tab === "sent" ? "إلى: " : "من: "}
                          {tab === "sent"
                            ? summarizeRecipients(
                                recipients.filter(r => r.message_id === m.id),
                                people
                              )
                            : m.sender_name || "—"}
                        </span>
                        <span className="shrink-0">
                          {new Date(m.created_at).toLocaleDateString("ar-EG", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      {m.remind_at && (
                        <div className="text-[10px] mt-1 inline-flex items-center gap-1 text-primary">
                          <Clock className="h-3 w-3" />
                          تذكير: {m.remind_at}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </Card>

          <Card className="p-4 min-h-[300px] border border-border rounded-md bg-card shadow-sm">
              {selected ? (
                <MessageView
                  message={selected}
                  recipients={recipients.filter(r => r.message_id === selected.id)}
                  people={people}
                  currentUserId={user?.id}
                  onClose={() => setSelected(null)}
                  onDone={() => markDone(selected.id, true)}
                  onReopen={() => markDone(selected.id, false)}
                  onArchive={() => {
                    archive(selected.id);
                    setSelected(null);
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  اختر رسالة لعرضها
                </div>
              )}
            </Card>
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        people={people}
        onSend={async payload => {
          try {
            await send(payload);
            toast.success("تم إرسال الرسالة");
            setComposeOpen(false);
          } catch (e: any) {
            toast.error("فشل الإرسال", { description: e?.message });
          }
        }}
      />
    </FinanceShell>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
      ? "text-warning"
      : tone === "danger"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="border border-border rounded-md bg-card px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function summarizeRecipients(
  recs: { recipient_user_id: string | null; recipient_role: string | null }[],
  people: TeamPerson[]
) {
  const names = recs.map(r => {
    if (r.recipient_user_id) {
      return (
        people.find(p => p.auth_user_id === r.recipient_user_id)?.name ||
        "شخص"
      );
    }
    if (r.recipient_role) {
      return ROLE_LABELS[r.recipient_role as IMRole] || r.recipient_role;
    }
    return "";
  });
  return names.filter(Boolean).slice(0, 3).join("، ");
}

function MessageView({
  message,
  recipients,
  people,
  currentUserId,
  onClose,
  onDone,
  onReopen,
  onArchive,
}: {
  message: InternalMessageRow;
  recipients: any[];
  people: TeamPerson[];
  currentUserId?: string;
  onClose: () => void;
  onDone: () => void;
  onReopen: () => void;
  onArchive: () => void;
}) {
  const [replies, setReplies] = useState<any[]>([]);
  const [replyBody, setReplyBody] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("internal_message_replies" as any)
        .select("*")
        .eq("message_id", message.id)
        .order("created_at");
      setReplies((data as any) || []);
    })();
  }, [message.id]);

  const sendReply = async () => {
    if (!replyBody.trim() || !currentUserId) return;
    const { error } = await supabase.from("internal_message_replies" as any).insert({
      message_id: message.id,
      user_id: message.user_id,
      sender_id: currentUserId,
      body: replyBody.trim(),
    });
    if (error) {
      toast.error("تعذّر الرد", { description: error.message });
      return;
    }
    setReplyBody("");
    const { data } = await supabase
      .from("internal_message_replies" as any)
      .select("*")
      .eq("message_id", message.id)
      .order("created_at");
    setReplies((data as any) || []);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{message.subject}</h2>
          <p className="text-xs text-muted-foreground">
            من {message.sender_name || "—"} •{" "}
            {new Date(message.created_at).toLocaleString("ar-EG")}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {message.status === "open" ? (
            <Button size="sm" variant="outline" onClick={onDone} className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> تم التنفيذ
            </Button>
          ) : message.status === "done" ? (
            <Button size="sm" variant="ghost" onClick={onReopen}>
              إعادة فتح
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onArchive} className="gap-1">
            <Archive className="h-4 w-4" /> أرشفة
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 text-[11px]">
        <span className="text-muted-foreground">إلى:</span>
        {recipients.map(r => (
          <Badge key={r.id} variant="secondary" className="gap-1">
            {r.recipient_role ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <UserIcon className="h-3 w-3" />
            )}
            {r.recipient_role
              ? ROLE_LABELS[r.recipient_role as IMRole] || r.recipient_role
              : people.find(p => p.auth_user_id === r.recipient_user_id)?.name || "شخص"}
            {r.cc && <span className="opacity-60">(نسخة)</span>}
            {r.done_at && <CheckCircle2 className="h-3 w-3 text-success" />}
          </Badge>
        ))}
      </div>

      {message.remind_at && (
        <div className="text-xs bg-primary/5 border border-primary/20 rounded-md p-2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          تذكير في: <span className="font-semibold">{message.remind_at}</span>
        </div>
      )}

      <div className="whitespace-pre-wrap text-sm border rounded-md p-3 bg-muted/20">
        {message.body}
      </div>

      {replies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">الردود</p>
          {replies.map(r => (
            <div key={r.id} className="border rounded-md p-2 text-sm">
              <div className="text-[11px] text-muted-foreground mb-1">
                {r.sender_name || "—"} •{" "}
                {new Date(r.created_at).toLocaleString("ar-EG")}
              </div>
              <div className="whitespace-pre-wrap">{r.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <Textarea
          placeholder="اكتب رداً..."
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
          className="min-h-[64px]"
        />
        <Button onClick={sendReply} className="gap-1" disabled={!replyBody.trim()}>
          <ReplyIcon className="h-4 w-4" /> رد
        </Button>
      </div>
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  people,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  people: TeamPerson[];
  onSend: (payload: {
    subject: string;
    body: string;
    recipients: IMRecipientInput[];
    remind_at: string | null;
    priority: "low" | "normal" | "high";
  }) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [picks, setPicks] = useState<IMRecipientInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [personId, setPersonId] = useState<string>("");
  const [roleKey, setRoleKey] = useState<string>("");

  const addPerson = () => {
    if (!personId) return;
    if (picks.some(p => "user_id" in p && p.user_id === personId)) return;
    setPicks(prev => [...prev, { user_id: personId }]);
    setPersonId("");
  };
  const addRole = () => {
    if (!roleKey) return;
    if (picks.some(p => "role" in p && p.role === roleKey)) return;
    setPicks(prev => [...prev, { role: roleKey as IMRole }]);
    setRoleKey("");
  };
  const removeIdx = (idx: number) =>
    setPicks(prev => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setSubject("");
    setBody("");
    setRemindAt("");
    setPriority("normal");
    setPicks([]);
  };

  const submit = async () => {
    if (!subject.trim() || !body.trim() || picks.length === 0) {
      toast.error("الرجاء تعبئة الموضوع والنص واختيار مستلم واحد على الأقل");
      return;
    }
    setBusy(true);
    try {
      await onSend({
        subject: subject.trim(),
        body: body.trim(),
        recipients: picks,
        remind_at: remindAt || null,
        priority,
      });
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>رسالة داخلية جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">المستلمون</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <div className="flex gap-1">
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="اختر شخص" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map(p => (
                      <SelectItem key={p.auth_user_id} value={p.auth_user_id}>
                        {p.name}
                        {p.role ? ` — ${ROLE_LABELS[p.role as IMRole] || p.role}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" type="button" onClick={addPerson}>
                  إضافة
                </Button>
              </div>
              <div className="flex gap-1">
                <Select value={roleKey} onValueChange={setRoleKey}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="أو اختر دور/قسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as IMRole[]).map(r => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" type="button" onClick={addRole}>
                  إضافة
                </Button>
              </div>
            </div>
            {picks.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {picks.map((p, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {"user_id" in p
                      ? people.find(x => x.auth_user_id === p.user_id)?.name || "شخص"
                      : ROLE_LABELS[p.role]}
                    <button
                      onClick={() => removeIdx(i)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">الموضوع</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="مثال: صرف القرض الحسن لأدهم قرارية"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">النص</Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="اكتب تفاصيل الطلب أو الملاحظات..."
              className="min-h-[100px] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">تاريخ التذكير (اختياري)</Label>
              <Input
                type="date"
                value={remindAt}
                onChange={e => setRemindAt(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">الأولوية</Label>
              <Select value={priority} onValueChange={v => setPriority(v as any)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">منخفضة</SelectItem>
                  <SelectItem value="normal">عادية</SelectItem>
                  <SelectItem value="high">عالية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "جارٍ الإرسال..." : "إرسال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

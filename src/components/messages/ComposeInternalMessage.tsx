import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useInternalMessages, IMRole, IMRecipientInput } from "@/hooks/useInternalMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";

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

interface Person {
  auth_user_id: string;
  name: string;
  role?: string;
}

interface Props {
  buttonLabel?: string;
  buttonClassName?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "icon";
  contextType?: string;
  contextId?: string;
  contextLabel?: string;
  defaultSubject?: string;
  defaultBody?: string;
  compact?: boolean;
}

export function ComposeInternalMessage({
  buttonLabel = "رسالة داخلية",
  buttonClassName,
  variant = "outline",
  size = "sm",
  contextType,
  contextId,
  contextLabel,
  defaultSubject = "",
  defaultBody = "",
  compact = false,
}: Props) {
  const { user } = useAuth();
  const { send } = useInternalMessages();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [remindAt, setRemindAt] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [picks, setPicks] = useState<IMRecipientInput[]>([]);
  const [personId, setPersonId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user?.id) return;
    (async () => {
      const { data: owner } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
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
      const byId = new Map<string, Person>();
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
        if (byId.has(r.user_id) && !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
      });
      const list = Array.from(byId.values())
        .map(p => ({ ...p, role: roleMap.get(p.auth_user_id) }))
        .filter(p => p.auth_user_id !== user.id);
      list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      setPeople(list);
    })();
  }, [open, user?.id]);

  const reset = () => {
    setSubject(defaultSubject);
    setBody(defaultBody);
    setRemindAt("");
    setPriority("normal");
    setPicks([]);
  };

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

  const submit = async () => {
    if (!subject.trim() || !body.trim() || picks.length === 0) {
      toast.error("الرجاء تعبئة الموضوع والنص واختيار مستلم واحد على الأقل");
      return;
    }
    setBusy(true);
    try {
      await send({
        subject: subject.trim(),
        body: body.trim(),
        recipients: picks,
        remind_at: remindAt || null,
        priority,
        context_type: contextType,
        context_id: contextId,
        context_label: contextLabel,
      });
      toast.success("تم الإرسال — سيصل الإشعار للمستلمين داخل الشركة");
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error("فشل الإرسال", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus className="h-4 w-4 ml-1" />
        {!compact && buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>رسالة داخلية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">المستلمون (داخل شركتك فقط)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                <div className="flex gap-1">
                  <Select value={personId} onValueChange={setPersonId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="شخص محدد" />
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
                    +
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Select value={roleKey} onValueChange={setRoleKey}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="قسم/دور" />
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
                    +
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
                        type="button"
                        onClick={() => setPicks(prev => prev.filter((_, idx) => idx !== i))}
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
                placeholder="مثال: صرف القرض الحسن لأدهم قرارية مع راتب شهر 7"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">النص</Label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="التفاصيل..."
                className="min-h-[100px] text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">تاريخ تذكير (اختياري)</Label>
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
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "جارٍ الإرسال..." : "إرسال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ComposeInternalMessage;

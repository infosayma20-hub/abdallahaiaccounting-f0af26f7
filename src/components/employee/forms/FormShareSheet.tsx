import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Building2, Users, Mail, Loader2, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Recipient {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  formId: string;
  formTitle: string;
  pdfUrl: string | null;
  ensurePdf: () => Promise<string>; // returns a (signed) URL
  companyId: string;
  defaultMessage?: string;
}

const normalizePhonePalestine = (raw: string): string => {
  let p = (raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0")) p = "+972" + p.slice(1);
  if (!p.startsWith("+")) p = "+972" + p;
  return p.replace(/^\+/, "");
};

export default function FormShareSheet({
  open, onClose, formId, formTitle, pdfUrl, ensurePdf, companyId, defaultMessage,
}: Props) {
  const [tab, setTab] = useState<"whatsapp" | "management" | "hr" | "email">("whatsapp");
  const [managers, setManagers] = useState<Recipient[]>([]);
  const [hrs, setHrs] = useState<Recipient[]>([]);
  const [phone, setPhone] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [email, setEmail] = useState("");
  const [emailName, setEmailName] = useState("");
  const [selectedAdmin, setSelectedAdmin] = useState<string>("");
  const [selectedHr, setSelectedHr] = useState<string>("");
  const [message, setMessage] = useState(defaultMessage || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      // load admins / hr managers via user_roles join with profiles+employees
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "hr_manager"]);
      const ids = (roleRows || []).map((r: any) => r.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", ids);
      const byUser = new Map((profs || []).map((p: any) => [p.id, p]));
      const adminList: Recipient[] = [];
      const hrList: Recipient[] = [];
      for (const r of roleRows || []) {
        const p: any = byUser.get(r.user_id);
        if (!p) continue;
        const item: Recipient = {
          id: r.user_id,
          name: p.full_name || p.email || "—",
          phone: p.phone,
          email: p.email,
          role: r.role,
        };
        if (r.role === "admin") adminList.push(item);
        if (r.role === "hr_manager") hrList.push(item);
      }
      setManagers(adminList);
      setHrs(hrList);
    })();
  }, [open]);

  const buildMessage = (url: string) =>
    `${message ? message + "\n\n" : ""}📄 ${formTitle}\n${url}`;

  const callShare = async (payload: any) => {
    setBusy(true);
    try {
      const url = pdfUrl || (await ensurePdf());
      const { data, error } = await supabase.functions.invoke("share-employee-form", {
        body: { formId, companyId, pdfUrl: url, ...payload },
      });
      if (error) throw error;
      return { url, data };
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!phone.trim()) return toast({ title: "أدخل رقم الواتساب", variant: "destructive" });
    try {
      const num = normalizePhonePalestine(phone);
      const { url } = await callShare({
        channel: "whatsapp",
        recipient: num,
        recipientName: phoneName || null,
        message,
      });
      const waUrl = `https://wa.me/${num}?text=${encodeURIComponent(buildMessage(url))}`;
      window.open(waUrl, "_blank");
      toast({ title: "تم فتح واتساب" });
      onClose();
    } catch (e: any) {
      toast({ title: "تعذر الإرسال", description: e.message, variant: "destructive" });
    }
  };

  const sendToManagement = async () => {
    try {
      await callShare({
        channel: "management",
        recipient: selectedAdmin || null,
        message,
      });
      toast({ title: "تم إرسال النموذج إلى الإدارة" });
      onClose();
    } catch (e: any) {
      toast({ title: "تعذر الإرسال", description: e.message, variant: "destructive" });
    }
  };

  const sendToHr = async () => {
    try {
      await callShare({
        channel: "hr",
        recipient: selectedHr || null,
        message,
      });
      toast({ title: "تم إرسال النموذج إلى HR" });
      onClose();
    } catch (e: any) {
      toast({ title: "تعذر الإرسال", description: e.message, variant: "destructive" });
    }
  };

  const sendByEmail = async () => {
    if (!email.trim()) return toast({ title: "أدخل البريد الإلكتروني", variant: "destructive" });
    try {
      await callShare({
        channel: "email",
        recipient: email.trim(),
        recipientName: emailName || null,
        message,
      });
      toast({ title: "تم إرسال البريد" });
      onClose();
    } catch (e: any) {
      toast({ title: "تعذر الإرسال", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[95vw]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" /> مشاركة النموذج
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">رسالة (اختياري)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ملاحظة تُرفق مع النموذج…"
              rows={2}
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="whatsapp"><MessageCircle className="h-4 w-4 ml-1" />واتساب</TabsTrigger>
              <TabsTrigger value="management"><Building2 className="h-4 w-4 ml-1" />إدارة</TabsTrigger>
              <TabsTrigger value="hr"><Users className="h-4 w-4 ml-1" />HR</TabsTrigger>
              <TabsTrigger value="email"><Mail className="h-4 w-4 ml-1" />بريد</TabsTrigger>
            </TabsList>

            <TabsContent value="whatsapp" className="space-y-3 pt-3">
              {managers.length > 0 && (
                <div>
                  <Label className="text-xs">اختر مديراً</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const m = managers.find((x) => x.id === e.target.value);
                      if (m?.phone) { setPhone(m.phone); setPhoneName(m.name); }
                    }}
                  >
                    <option value="">— اختر —</option>
                    {managers.filter((m) => m.phone).map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.phone})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label className="text-xs">رقم الواتساب</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="مثال: 0599123456" />
              </div>
              <div>
                <Label className="text-xs">الاسم (اختياري)</Label>
                <Input value={phoneName} onChange={(e) => setPhoneName(e.target.value)} />
              </div>
              <Button onClick={sendWhatsApp} disabled={busy} className="w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                إرسال عبر واتساب
              </Button>
            </TabsContent>

            <TabsContent value="management" className="space-y-3 pt-3">
              <Label className="text-xs">المدير المستلم (اختياري — وإلا يصل لكل المديرين)</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={selectedAdmin}
                onChange={(e) => setSelectedAdmin(e.target.value)}
              >
                <option value="">كل المديرين</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Button onClick={sendToManagement} disabled={busy} className="w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                إرسال إلى الإدارة
              </Button>
            </TabsContent>

            <TabsContent value="hr" className="space-y-3 pt-3">
              <Label className="text-xs">مدير HR المستلم (اختياري)</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={selectedHr}
                onChange={(e) => setSelectedHr(e.target.value)}
              >
                <option value="">كل مدراء HR</option>
                {hrs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Button onClick={sendToHr} disabled={busy} className="w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                إرسال إلى HR
              </Button>
            </TabsContent>

            <TabsContent value="email" className="space-y-3 pt-3">
              <div>
                <Label className="text-xs">البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  list="email-suggestions"
                />
                <datalist id="email-suggestions">
                  {[...managers, ...hrs].filter((m) => m.email).map((m) => (
                    <option key={m.id} value={m.email!}>{m.name}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label className="text-xs">الاسم (اختياري)</Label>
                <Input value={emailName} onChange={(e) => setEmailName(e.target.value)} />
              </div>
              <Button onClick={sendByEmail} disabled={busy} className="w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                إرسال عبر البريد
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
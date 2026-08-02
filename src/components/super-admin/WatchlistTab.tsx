import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Plus, RefreshCw, Search, Trash2, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface WatchRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  reason: string | null;
  risk_level: string;
  notify_on_login: boolean;
  notify_on_export: boolean;
  track_pages: boolean;
  trial_expires_at: string | null;
  max_records: number | null;
  is_active: boolean;
  created_at: string;
}

interface PageView {
  id: string;
  user_id: string;
  path: string;
  page_title: string | null;
  event_kind: string;
  created_at: string;
}

interface Props {
  cardBg: string;
  cardBorder: string;
  divider: string;
  textPrimary: string;
  textMuted: string;
}

const KIND_LABEL: Record<string, string> = {
  page_view: "فتح شاشة",
  login: "دخول",
  export: "تصدير",
  print: "طباعة",
};

export default function WatchlistTab({ cardBg, cardBorder, divider, textPrimary, textMuted }: Props) {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [views, setViews] = useState<PageView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [emailQuery, setEmailQuery] = useState("");
  const [form, setForm] = useState({ reason: "", days: "14", maxRecords: "50" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("account_watchlist")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("تعذّر تحميل قائمة المراقبة");
      return;
    }
    setRows((data ?? []) as WatchRow[]);
  }, []);

  const loadViews = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("watchlist_page_views")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    setViews((data ?? []) as PageView[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) void loadViews(selected);
    else setViews([]);
  }, [selected, loadViews]);

  const addWatch = async () => {
    const email = emailQuery.trim().toLowerCase();
    if (!email) return;
    const { data: found, error: findErr } = await supabase.rpc("admin_list_companies");
    let userId: string | null = null;
    let name: string | null = null;
    if (!findErr && Array.isArray(found)) {
      const hit = (found as Array<Record<string, unknown>>).find(
        (r) => String(r.email ?? "").toLowerCase() === email
      );
      if (hit) {
        userId = String(hit.id ?? hit.user_id ?? "");
        name = (hit.full_name as string) ?? (hit.name as string) ?? null;
      }
    }
    if (!userId) {
      toast.error("ما لقيت المستخدم بهذا الإيميل");
      return;
    }
    const days = parseInt(form.days, 10);
    const max = parseInt(form.maxRecords, 10);
    const { error } = await supabase.from("account_watchlist").upsert({
      user_id: userId,
      email,
      full_name: name,
      reason: form.reason || null,
      trial_expires_at: Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 86400000).toISOString()
        : null,
      max_records: Number.isFinite(max) && max > 0 ? max : null,
      is_active: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تمت إضافة الحساب لقائمة المراقبة");
    setAddOpen(false);
    setEmailQuery("");
    void load();
  };

  const toggle = async (row: WatchRow, field: keyof WatchRow, value: boolean) => {
    const { error } = await supabase
      .from("account_watchlist")
      .update({ [field]: value })
      .eq("user_id", row.user_id);
    if (error) return toast.error(error.message);
    void load();
  };

  const remove = async (row: WatchRow) => {
    const { error } = await supabase.from("account_watchlist").delete().eq("user_id", row.user_id);
    if (error) return toast.error(error.message);
    if (selected === row.user_id) setSelected(null);
    toast.success("تمت الإزالة من المراقبة");
    void load();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: textPrimary }}>
          <ShieldAlert className="h-5 w-5 text-amber-500" /> مراقبة الحسابات التجريبية
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 ml-1" /> إضافة حساب
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ background: cardBg, borderColor: cardBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right" style={{ borderBottom: `1px solid ${divider}`, color: textMuted }}>
              <th className="p-2 font-medium">الحساب</th>
              <th className="p-2 font-medium">السبب</th>
              <th className="p-2 font-medium">انتهاء التجربة</th>
              <th className="p-2 font-medium">سقف السجلات</th>
              <th className="p-2 font-medium">تتبع الشاشات</th>
              <th className="p-2 font-medium">تنبيه دخول</th>
              <th className="p-2 font-medium">نشط</th>
              <th className="p-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center" style={{ color: textMuted }}>
                  لا يوجد حسابات تحت المراقبة
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.user_id} style={{ borderBottom: `1px solid ${divider}` }}>
                  <td className="p-2" style={{ color: textPrimary }}>
                    <div className="font-medium">{r.full_name || "—"}</div>
                    <div className="text-xs" style={{ color: textMuted }}>{r.email}</div>
                  </td>
                  <td className="p-2 text-xs max-w-[220px]" style={{ color: textMuted }}>{r.reason || "—"}</td>
                  <td className="p-2 text-xs" style={{ color: textMuted }}>
                    {r.trial_expires_at ? (
                      <Badge variant={new Date(r.trial_expires_at) < new Date() ? "destructive" : "outline"}>
                        {format(new Date(r.trial_expires_at), "yyyy-MM-dd")}
                      </Badge>
                    ) : "—"}
                  </td>
                  <td className="p-2 text-xs" style={{ color: textMuted }}>{r.max_records ?? "—"}</td>
                  <td className="p-2">
                    <Switch checked={r.track_pages} onCheckedChange={(v) => void toggle(r, "track_pages", v)} />
                  </td>
                  <td className="p-2">
                    <Switch checked={r.notify_on_login} onCheckedChange={(v) => void toggle(r, "notify_on_login", v)} />
                  </td>
                  <td className="p-2">
                    <Switch checked={r.is_active} onCheckedChange={(v) => void toggle(r, "is_active", v)} />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="عرض النشاط"
                        onClick={() => setSelected(selected === r.user_id ? null : r.user_id)}>
                        {selected === r.user_id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" title="إزالة" onClick={() => void remove(r)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-lg border" style={{ background: cardBg, borderColor: cardBorder }}>
          <div className="p-3 font-bold text-sm" style={{ color: textPrimary, borderBottom: `1px solid ${divider}` }}>
            سجل النشاط ({views.length})
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y" style={{ borderColor: divider }}>
            {views.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: textMuted }}>لا يوجد نشاط مسجّل بعد</div>
            ) : (
              views.map((v) => (
                <div key={v.id} className="p-2 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px]">{KIND_LABEL[v.event_kind] ?? v.event_kind}</Badge>
                    <span className="truncate" style={{ color: textPrimary }}>{v.page_title || v.path}</span>
                    <span className="truncate" style={{ color: textMuted }}>{v.path}</span>
                  </div>
                  <span style={{ color: textMuted }}>{format(new Date(v.created_at), "yyyy-MM-dd HH:mm")}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب لقائمة المراقبة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">إيميل الحساب</Label>
              <div className="relative">
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pr-8" value={emailQuery} onChange={(e) => setEmailQuery(e.target.value)}
                  placeholder="example@gmail.com" />
              </div>
            </div>
            <div>
              <Label className="text-xs">سبب المراقبة</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="مثال: مكتب محاسبة — احتمال منافس" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">مدة التجربة (أيام)</Label>
                <Input type="number" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">سقف السجلات</Label>
                <Input type="number" value={form.maxRecords}
                  onChange={(e) => setForm({ ...form, maxRecords: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button onClick={() => void addWatch()}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

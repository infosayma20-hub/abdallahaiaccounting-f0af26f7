import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, QrCode as QrIcon, Download, Copy, Check, X, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

type Branch = { id: string; name: string; qr_menu_enabled: boolean; public_slug: string | null };
type Table = { id: string; name: string; section_id: string | null };
type Category = { id: string; name: string; show_in_qr_menu: boolean };
type Product = { id: string; name: string; show_in_qr_menu: boolean; pos_category_id: string | null; sell_price: number };
type Order = {
  id: string; status: string; created_at: string;
  customer_name: string | null; customer_phone: string | null;
  branch_id: string; table_id: string | null;
  items: any; notes: string | null;
};

// ASCII-only slug — keeps URLs/QR codes clean & avoids %D8 encoding
const slugify = (s: string) =>
  (s || "").toLowerCase().trim()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const fallbackAccountSlug = (userId: string) => `menu-${userId.slice(0, 6)}`;

export default function QRMenuAdminPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // settings
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState("dine_in");
  const [welcome, setWelcome] = useState("");
  const [requirePhone, setRequirePhone] = useState(false);
  const [accountSlug, setAccountSlug] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: cs }, { data: prof }, { data: br }, { data: cats }, { data: prods }] = await Promise.all([
        supabase.from("company_settings").select("qr_menu_enabled, qr_menu_mode, qr_menu_welcome_message, qr_menu_require_phone").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("public_slug, company_name, full_name, display_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("branches").select("id, name, qr_menu_enabled, public_slug").eq("user_id", user.id).order("name"),
        supabase.from("pos_categories").select("id, name, show_in_qr_menu").eq("user_id", user.id).order("sort_order").order("name"),
        supabase.from("products").select("id, name, show_in_qr_menu, pos_category_id, sell_price").eq("user_id", user.id).eq("is_pos_available", true).order("name"),
      ]);
      if (cs) {
        setEnabled(!!(cs as any).qr_menu_enabled);
        setMode((cs as any).qr_menu_mode || "dine_in");
        setWelcome((cs as any).qr_menu_welcome_message || "");
        setRequirePhone(!!(cs as any).qr_menu_require_phone);
      }
      if (prof) {
        const slug = (prof as any).public_slug || slugify((prof as any).company_name || (prof as any).full_name || (prof as any).display_name || "") || fallbackAccountSlug(user.id);
        setAccountSlug(slug);
      } else {
        setAccountSlug(fallbackAccountSlug(user.id));
      }
      setBranches((br as Branch[]) || []);
      setCategories((cats as Category[]) || []);
      setProducts((prods as Product[]) || []);
      setLoading(false);
    })();
  }, [user]);

  // Load tables and orders when a branch is selected
  useEffect(() => {
    if (!selectedBranch) { setTables([]); return; }
    supabase.from("restaurant_tables").select("id, name, section_id").eq("user_id", user!.id).eq("is_active", true).order("name")
      .then(({ data }) => setTables((data as Table[]) || []));
  }, [selectedBranch, user]);

  // Inbox: realtime
  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("qr_menu_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setOrders((data as Order[]) || []));
    load();
    const ch = supabase.channel("qr_menu_orders_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "qr_menu_orders", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const saveSettings = async () => {
    if (!user) return;
    const slug = slugify(accountSlug.trim()) || fallbackAccountSlug(user.id);
    const { error: e1 } = await supabase.from("company_settings").update({
      qr_menu_enabled: enabled, qr_menu_mode: mode,
      qr_menu_welcome_message: welcome, qr_menu_require_phone: requirePhone,
    }).eq("user_id", user.id);
    const { error: e2 } = await supabase.from("profiles").update({ public_slug: slug }).eq("user_id", user.id);
    if (e1 || e2) { toast.error("تعذّر الحفظ"); return; }
    setAccountSlug(slug);
    toast.success("تم الحفظ");
  };

  const updateBranch = async (id: string, patch: Partial<Branch>) => {
    const { error } = await supabase.from("branches").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...patch } as Branch : b));
  };

  const ensureBranchSlug = async (b: Branch) => {
    if (b.public_slug) return b.public_slug;
    const slug = slugify(b.name) || "br-" + b.id.slice(0, 8);
    await updateBranch(b.id, { public_slug: slug });
    return slug;
  };

  const enableAllBranches = async () => {
    if (!user) return;
    // Ensure account slug exists
    let acct = accountSlug.trim();
    if (!acct) {
      acct = fallbackAccountSlug(user.id);
      setAccountSlug(acct);
    }
    await supabase.from("company_settings").update({ qr_menu_enabled: true }).eq("user_id", user.id);
    await supabase.from("profiles").update({ public_slug: acct }).eq("user_id", user.id);
    setEnabled(true);
    // Ensure each branch has a slug + enabled
    for (const b of branches) {
      const slug = b.public_slug || (slugify(b.name) || "br-" + b.id.slice(0, 8));
      await supabase.from("branches").update({ public_slug: slug, qr_menu_enabled: true }).eq("id", b.id);
    }
    const { data: br } = await supabase.from("branches").select("id, name, qr_menu_enabled, public_slug").eq("user_id", user.id).order("name");
    setBranches((br as Branch[]) || []);
    toast.success("تم تفعيل QR لكل الفروع — انشر التطبيق لتفعيل الروابط للزبائن");
  };

  const toggleCategoryVis = async (c: Category) => {
    const v = !c.show_in_qr_menu;
    await supabase.from("pos_categories").update({ show_in_qr_menu: v }).eq("id", c.id);
    setCategories(prev => prev.map(x => x.id === c.id ? { ...x, show_in_qr_menu: v } : x));
  };
  const toggleProductVis = async (p: Product) => {
    const v = !p.show_in_qr_menu;
    await supabase.from("products").update({ show_in_qr_menu: v }).eq("id", p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, show_in_qr_menu: v } : x));
  };

  const buildMenuUrl = (branchSlug: string, tableCode?: string) => {
    if (!user) return "";
    const safeAccountSlug = slugify(accountSlug) || fallbackAccountSlug(user.id);
    const safeBranchSlug = branchSlug || "br";
    // Use the dedicated menu subdomain on production/preview, otherwise fallback to local /m route
    const isProd = window.location.origin.includes("amwali.app") || window.location.origin.includes("lovableproject.com");
    const domain = isProd ? "https://menu.amwali.app" : `${window.location.origin}/m`;
    const base = `${domain}/${encodeURIComponent(safeAccountSlug)}/${encodeURIComponent(safeBranchSlug)}`;
    return tableCode ? `${base}/${encodeURIComponent(tableCode)}` : base;
  };

  const acceptOrder = async (o: Order) => {
    const { error } = await supabase.from("qr_menu_orders").update({
      status: "accepted", accepted_at: new Date().toISOString(), accepted_by: user!.id,
    }).eq("id", o.id);
    if (error) toast.error(error.message); else toast.success("تم القبول — حوّل الطلب لسلة الكاشير من /pos");
  };
  const rejectOrder = async (o: Order) => {
    const reason = window.prompt("سبب الرفض؟") || "";
    const { error } = await supabase.from("qr_menu_orders").update({ status: "rejected", reject_reason: reason }).eq("id", o.id);
    if (error) toast.error(error.message);
  };

  if (loading) return <div className="p-6 text-center">جارٍ التحميل…</div>;

  const pendingCount = orders.filter(o => o.status === "pending").length;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pos")}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <QrIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">منيو QR</h1>
          {pendingCount > 0 && <Badge className="bg-red-600 text-white">{pendingCount} طلب جديد</Badge>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        <Tabs defaultValue="inbox" dir="rtl">
          <TabsList className="grid grid-cols-4 w-full" dir="rtl">
            <TabsTrigger value="inbox">الطلبات {pendingCount > 0 && <span className="mr-1 text-red-600">({pendingCount})</span>}</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
            <TabsTrigger value="branches">الفروع و QR</TabsTrigger>
            <TabsTrigger value="menu">المنتجات الظاهرة</TabsTrigger>
          </TabsList>

          {/* Inbox */}
          <TabsContent value="inbox" className="mt-4 space-y-3">
            {orders.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد طلبات بعد</p>}
            {orders.map(o => {
              const items = Array.isArray(o.items) ? o.items : [];
              const branch = branches.find(b => b.id === o.branch_id);
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={o.status === "pending" ? "default" : "secondary"}>{o.status}</Badge>
                        <span className="text-sm font-bold">{branch?.name || "—"}</span>
                        {o.customer_name && <span className="text-sm">{o.customer_name}</span>}
                        {o.customer_phone && <span className="text-xs text-muted-foreground">{o.customer_phone}</span>}
                      </div>
                      <ul className="mt-2 text-sm">
                        {items.map((it: any, i: number) => (
                          <li key={i}>• {it.qty}× {it.name} {it.note ? <span className="text-xs text-muted-foreground">({it.note})</span> : null}</li>
                        ))}
                      </ul>
                      {o.notes && <p className="text-xs text-muted-foreground mt-1">ملاحظة: {o.notes}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">{new Date(o.created_at).toLocaleString("ar")}</p>
                    </div>
                    {o.status === "pending" && (
                      <div className="flex flex-col gap-2">
                        <Button size="sm" onClick={() => acceptOrder(o)}><Check className="h-3 w-3 ml-1" />قبول</Button>
                        <Button size="sm" variant="outline" onClick={() => rejectOrder(o)}><X className="h-3 w-3 ml-1" />رفض</Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="mt-4 space-y-4">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label>تفعيل منيو QR لحسابك</Label>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
              <div>
                <Label>النمط</Label>
                <select value={mode} onChange={e => setMode(e.target.value)} className="w-full mt-1 h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="dine_in">داخل المطعم (طاولات)</option>
                  <option value="takeaway">استلام (Takeaway)</option>
                  <option value="both">كلاهما</option>
                </select>
              </div>
              <div>
                <Label>المعرّف العام (Slug)</Label>
                <Input value={accountSlug} onChange={e => setAccountSlug(slugify(e.target.value))} placeholder="مثال: malaki" />
                <p className="text-[11px] text-muted-foreground mt-1">يستخدم في رابط المنيو العام</p>
              </div>
              <div>
                <Label>رسالة الترحيب</Label>
                <Textarea value={welcome} onChange={e => setWelcome(e.target.value)} placeholder="أهلاً بكم في..." />
              </div>
              <div className="flex items-center justify-between">
                <Label>اشتراط رقم الجوال من الزبون</Label>
                <Switch checked={requirePhone} onCheckedChange={setRequirePhone} />
              </div>
              <Button onClick={saveSettings}>حفظ</Button>
            </Card>
          </TabsContent>

          {/* Branches & QR */}
          <TabsContent value="branches" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={enableAllBranches}>تفعيل QR لكل الفروع تلقائياً</Button>
            </div>
            {branches.map(b => (
              <Card key={b.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{b.name}</p>
                    <p className="text-xs text-muted-foreground">slug: {b.public_slug || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">تفعيل</Label>
                    <Switch checked={b.qr_menu_enabled} onCheckedChange={async (v) => {
                      if (v && !b.public_slug) await ensureBranchSlug(b);
                      await updateBranch(b.id, { qr_menu_enabled: v });
                    }} />
                    <Button size="sm" variant="outline" onClick={() => setSelectedBranch(b.id === selectedBranch ? "" : b.id)}>
                      {selectedBranch === b.id ? "إخفاء" : "عرض QR"}
                    </Button>
                    {b.qr_menu_enabled && b.public_slug && (
                      <Button size="sm" variant="default" onClick={() => window.open(buildMenuUrl(b.public_slug!), "_blank")}>
                        معاينة المنيو
                      </Button>
                    )}
                  </div>
                </div>
                {selectedBranch === b.id && b.qr_menu_enabled && b.public_slug && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {/* General branch QR */}
                    <QRCard label="منيو الفرع" url={buildMenuUrl(b.public_slug)} />
                    {tables.map(t => (
                      <QRCard key={t.id} label={`طاولة ${t.name}`} url={buildMenuUrl(b.public_slug!, t.id)} />
                    ))}
                  </div>
                )}
                {selectedBranch === b.id && (!b.qr_menu_enabled || !b.public_slug) && (
                  <p className="text-xs text-muted-foreground mt-2">فعّل المنيو أولاً لإظهار رموز QR</p>
                )}
              </Card>
            ))}
            {branches.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا يوجد فروع</p>}
          </TabsContent>

          {/* Menu visibility */}
          <TabsContent value="menu" className="mt-4 space-y-4">
            {categories.map(c => {
              const catProducts = products.filter(p => p.pos_category_id === c.id);
              return (
                <Card key={c.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-bold">{c.name}</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">إظهار القسم</Label>
                      <Switch checked={c.show_in_qr_menu} onCheckedChange={() => toggleCategoryVis(c)} />
                    </div>
                  </div>
                  {c.show_in_qr_menu && catProducts.length > 0 && (
                    <div className="mt-3 divide-y">
                      {catProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-1.5">
                          <span className="text-sm">{p.name} <span className="text-xs text-muted-foreground">₪{p.sell_price}</span></span>
                          <Switch checked={p.show_in_qr_menu} onCheckedChange={() => toggleProductVis(p)} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QRCard({ label, url }: { label: string; url: string }) {
  return (
    <div className="border rounded-lg p-3 flex flex-col items-center gap-2 bg-white">
      <QRCodeSVG value={url} size={140} includeMargin />
      <p className="text-xs font-bold text-center text-black">{label}</p>
      <div className="flex gap-1 w-full">
        <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]"
          onClick={() => { navigator.clipboard.writeText(url); toast.success("نُسخ الرابط"); }}>
          <Copy className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]"
          onClick={() => window.open(url, "_blank")}>
          فتح
        </Button>
      </div>
    </div>
  );
}
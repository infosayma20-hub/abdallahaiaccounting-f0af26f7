import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, X, Plus, Trash2, ShoppingCart, User, MapPin, CalendarDays, CreditCard, Package, FileText, Check, ChevronsUpDown, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FinanceShell, FastTabs, type FastTabItem } from "@/components/finance/shell";
import { syncContactFromOrder, syncProductsFromOrderItems } from "@/lib/order-contact-sync";

function ProductPicker({
  value,
  products,
  onSelect,
}: {
  value: string;
  products: any[];
  onSelect: (name: string, product?: any) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal h-9 text-xs", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || "اختر المنتج أو اكتب يدوياً"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) => {
            const s = search.trim().toLowerCase();
            if (!s) return 1;
            return val.toLowerCase().includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="ابحث بالاسم أو الكود..." />
          <CommandList>
            <CommandEmpty>
              <div className="text-xs space-y-2 py-2">
                <div>لا توجد نتائج</div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('[cmdk-input]');
                    const v = input?.value?.trim();
                    if (v) {
                      onSelect(v);
                      setOpen(false);
                    }
                  }}
                >
                  استخدام النص كمنتج جديد
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {products.map((p) => {
                const label = `${p.name}${p.sku ? " • " + p.sku : ""}`;
                return (
                  <CommandItem
                    key={p.id}
                    value={label}
                    onSelect={() => {
                      onSelect(p.name, p);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("ml-2 h-3.5 w-3.5", value === p.name ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.sku && <span className="text-[10px] text-muted-foreground">{p.sku}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const PAYMENT_METHODS = ["كاش", "تحويل بنكي", "شيك", "دفع إلكتروني", "آجل"];
const SOURCES = ["يدوي", "متجر إلكتروني", "واتساب", "هاتف", "أخرى"];
const STATUSES = ["جديد", "مؤكد", "قيد التجهيز", "جاهز للفوترة", "مفوتر", "جاهز للشحن", "تم الشحن", "تم التسليم", "مؤجل", "ملغي"];
const PAYMENT_STATUSES = ["غير مدفوع", "مدفوع جزئياً", "مدفوع كاملاً"];

const PROFILE_PLATFORMS: { value: string; label: string; prefix?: string }[] = [
  { value: "none", label: "— بدون —" },
  { value: "instagram", label: "إنستجرام", prefix: "https://instagram.com/" },
  { value: "facebook", label: "فيسبوك", prefix: "https://facebook.com/" },
  { value: "tiktok", label: "تيك توك", prefix: "https://tiktok.com/@" },
  { value: "snapchat", label: "سناب شات", prefix: "https://snapchat.com/add/" },
  { value: "whatsapp", label: "واتساب", prefix: "https://wa.me/" },
  { value: "x", label: "X (تويتر)", prefix: "https://x.com/" },
  { value: "website", label: "موقع/رابط آخر" },
];

const REGIONS: Record<string, string[]> = {
  "الداخل 48": ["حيفا", "يافا", "عكا", "الناصرة", "اللد", "الرملة", "أم الفحم", "الطيبة", "باقة الغربية", "سخنين", "شفاعمرو", "طمرة", "عرعرة", "كفر قاسم", "كفر كنا", "المغار", "دبورية", "عرابة", "كفر ياسيف"],
  "القدس": ["القدس", "أبو ديس", "العيزرية", "بيت حنينا", "شعفاط", "العيسوية", "سلوان", "الطور", "بيت صفافا", "صور باهر"],
  "الضفة الغربية": ["رام الله", "نابلس", "الخليل", "بيت لحم", "جنين", "طولكرم", "قلقيلية", "أريحا", "سلفيت", "طوباس", "يطا", "دورا", "حلحول", "بيت جالا", "بيت ساحور", "بيرزيت", "بيتونيا"],
  "النقب والجنوب": ["بئر السبع", "رهط", "تل السبع", "حورة", "كسيفة", "اللقية", "عرعرة النقب", "شقيب السلام"],
};

const defaultForm = {
  customer_name: "",
  customer_phone: "",
  customer_address: "",
  customer_profile_url: "",
  customer_profile_platform: "none",
  order_date: new Date().toISOString().split("T")[0],
  delivery_date: "",
  status: "جديد",
  subtotal: 0,
  discount: 0,
  shipping_cost: 0,
  total: 0,
  payment_status: "غير مدفوع",
  payment_method: "كاش",
  shipping_method: "",
  tracking_number: "",
  source: "يدوي",
  notes: "",
};

type Item = { id?: string; product_id?: string | null; product_name: string; quantity: number; unit_price: number; discount: number; total: number };

const fmt = (n: number) => `₪${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OrderFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;

  const [form, setForm] = useState(defaultForm);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const region = form.customer_address?.split(" - ")[0] || "";
  const city = form.customer_address?.split(" - ")[1] || "";
  const [cityOpen, setCityOpen] = useState(false);
  const cityOptions = REGIONS[region] || [];
  const platformInfo = PROFILE_PLATFORMS.find(p => p.value === form.customer_profile_platform);
  const profileFullUrl = (() => {
    const v = form.customer_profile_url?.trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (platformInfo?.prefix) return platformInfo.prefix + v.replace(/^@/, "");
    return v;
  })();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const prods = await fetchAllRows<any>((from, to) =>
        supabase.from("products").select("*").eq("user_id", user.id).range(from, to)
      );
      setProducts(prods || []);

      const cts = await fetchAllRows<any>((from, to) =>
        supabase.from("contacts")
          .select("id, contact_name, phone, address, contact_type")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .in("contact_type", ["عميل", "عميل ومورد"])
          .order("contact_name")
          .range(from, to)
      );
      setContacts(cts || []);

      if (isEdit && editId) {
        const [{ data: ord }, { data: its }] = await Promise.all([
          supabase.from("orders").select("*").eq("id", editId).maybeSingle(),
          supabase.from("order_items").select("*").eq("order_id", editId),
        ]);
        if (ord) {
          const o: any = ord;
          setForm({
            customer_name: o.customer_name || "",
            customer_phone: o.customer_phone || "",
            customer_address: o.customer_address || "",
            customer_profile_url: o.customer_profile_url || "",
            customer_profile_platform: o.customer_profile_platform || "none",
            order_date: o.order_date,
            delivery_date: o.delivery_date || "",
            status: o.status || "جديد",
            subtotal: Number(o.subtotal || 0),
            discount: Number(o.discount || 0),
            shipping_cost: Number(o.shipping_cost || 0),
            total: Number(o.total || 0),
            payment_status: o.payment_status || "غير مدفوع",
            payment_method: o.payment_method || "كاش",
            shipping_method: o.shipping_method || "",
            tracking_number: o.tracking_number || "",
            source: o.source || "يدوي",
            notes: o.notes || "",
          });
        }
        setItems(((its as any[]) || []).map(it => ({
          id: it.id,
          product_name: it.product_name,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          discount: Number(it.discount || 0),
          total: Number(it.total),
        })));
        setLoading(false);
      }
    })();
  }, [user, editId, isEdit]);

  const recalcTotal = (next: Item[]) => {
    const subtotal = next.reduce((s, i) => s + i.total, 0);
    setForm(prev => ({ ...prev, subtotal, total: subtotal - prev.discount + prev.shipping_cost }));
  };

  const addItem = () => {
    const next = [...items, { product_name: "", quantity: 1, unit_price: 0, discount: 0, total: 0 }];
    setItems(next);
  };

  const updateItem = (idx: number, field: keyof Item, value: any) => {
    const next = [...items];
    (next[idx] as any)[field] = value;
    if (field === "product_name") {
      const prod = products.find(p => p.name === value);
      if (prod) next[idx].unit_price = Number(prod.sell_price);
    }
    next[idx].total = next[idx].quantity * next[idx].unit_price - next[idx].discount;
    setItems(next);
    recalcTotal(next);
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    recalcTotal(next);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.customer_name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        user_id: user.id,
        customer_profile_platform: form.customer_profile_platform === "none" ? null : form.customer_profile_platform,
        customer_profile_url: form.customer_profile_url?.trim() || null,
      };

      if (isEdit && editId) {
        const { error } = await supabase.from("orders").update(payload).eq("id", editId);
        if (error) throw error;
        // Replace items
        await supabase.from("order_items").delete().eq("order_id", editId);
        if (items.length > 0) {
          const rows = items.map(i => ({
            order_id: editId,
            user_id: user.id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            total: i.total,
          }));
          const { error: itErr } = await supabase.from("order_items").insert(rows as any);
          if (itErr) throw itErr;
        }
        toast.success("تم حفظ التعديلات ✅");
      } else {
        payload.order_number = `ORD-${Date.now().toString(36).toUpperCase()}`;
        const { data, error } = await supabase.from("orders").insert(payload).select();
        if (error || !data?.[0]) throw error || new Error("فشل الإنشاء");
        const newId = data[0].id;
        if (items.length > 0) {
          const rows = items.map(i => ({
            order_id: newId,
            user_id: user.id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            total: i.total,
          }));
          await supabase.from("order_items").insert(rows as any);
        }
        // Sync contact + products silently
        await syncContactFromOrder({
          id: newId,
          user_id: user.id,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          customer_address: form.customer_address,
          order_number: payload.order_number,
          source: form.source,
        }).catch(() => {});
        await syncProductsFromOrderItems(newId, user.id).catch(() => {});
        toast.success("تم إنشاء الطلبية بنجاح ✅");
      }
      navigate("/orders");
    } catch (e: any) {
      toast.error("خطأ: " + (e?.message || "غير معروف"));
    } finally {
      setSaving(false);
    }
  };

  const tabs: FastTabItem[] = useMemo(() => [
    {
      key: "customer",
      title: "بيانات العميل",
      summary: form.customer_name ? `${form.customer_name}${form.customer_phone ? " • " + form.customer_phone : ""}` : "—",
      hasError: !form.customer_name.trim(),
      defaultOpen: true,
      children: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">اسم العميل *</label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerOpen}
                  className={cn("w-full justify-between font-normal h-10", !form.customer_name && "text-muted-foreground")}
                >
                  <span className="truncate">{form.customer_name || "ابحث عن عميل أو أضف جديد..."}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(val, search) => {
                    const s = search.trim().toLowerCase();
                    if (!s) return 1;
                    return val.toLowerCase().includes(s) ? 1 : 0;
                  }}
                >
                  <CommandInput
                    placeholder="ابحث بالاسم أو الهاتف أو اكتب اسم جديد..."
                    value={customerSearch}
                    onValueChange={setCustomerSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="text-xs text-muted-foreground py-2 text-center">ابدأ الكتابة لإضافة عميل</div>
                    </CommandEmpty>
                    {customerSearch.trim() && !contacts.some(c => c.contact_name?.trim().toLowerCase() === customerSearch.trim().toLowerCase()) && (
                      <CommandGroup heading="جديد">
                        <CommandItem
                          value={`__add__${customerSearch}`}
                          onSelect={async () => {
                            const v = customerSearch.trim();
                            if (!v || !user) return;
                            const { data, error } = await supabase.from("contacts").insert({
                              user_id: user.id,
                              contact_name: v,
                              contact_type: "عميل",
                              phone: form.customer_phone || null,
                              address: form.customer_address || null,
                              is_active: true,
                            } as any).select("id, contact_name, phone, address, contact_type").single();
                            if (error) { toast.error(error.message); return; }
                            if (data) {
                              setContacts(prev => [...prev, data]);
                              setForm(prev => ({ ...prev, customer_name: data.contact_name }));
                              toast.success("تم إضافة العميل");
                            }
                            setCustomerSearch("");
                            setCustomerOpen(false);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 ml-2" />
                          <span className="truncate">إضافة "{customerSearch.trim()}" كعميل جديد</span>
                        </CommandItem>
                      </CommandGroup>
                    )}
                    <CommandGroup>
                      {contacts.map((c) => {
                        const label = `${c.contact_name}${c.phone ? " • " + c.phone : ""}`;
                        return (
                          <CommandItem
                            key={c.id}
                            value={label}
                            onSelect={() => {
                              setForm(prev => ({
                                ...prev,
                                customer_name: c.contact_name,
                                customer_phone: prev.customer_phone || c.phone || "",
                                customer_address: prev.customer_address || c.address || "",
                              }));
                              setCustomerOpen(false);
                            }}
                          >
                            <Check className={cn("ml-2 h-3.5 w-3.5", form.customer_name === c.contact_name ? "opacity-100" : "opacity-0")} />
                            <div className="flex-1 flex items-center justify-between gap-2">
                              <span className="truncate">{c.contact_name}</span>
                              {c.phone && <span className="text-[10px] text-muted-foreground" dir="ltr">{c.phone}</span>}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="أو اكتب الاسم يدوياً"
              value={form.customer_name}
              onChange={e => setForm({ ...form, customer_name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الهاتف</label>
            <Input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المنطقة</label>
            <Select value={region} onValueChange={v => setForm({ ...form, customer_address: v })}>
              <SelectTrigger><SelectValue placeholder="اختر المنطقة" /></SelectTrigger>
              <SelectContent>{Object.keys(REGIONS).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المدينة</label>
            <Popover open={cityOpen} onOpenChange={setCityOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={cityOpen}
                  className={cn("w-full justify-between font-normal h-10", !city && "text-muted-foreground")}
                >
                  {city || (region ? "ابحث أو اختر المدينة..." : "اختر المنطقة أولاً")}
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder={region ? "ابحث عن مدينة..." : "اختر المنطقة أولاً ثم اكتب اسم المدينة"} />
                  <CommandList>
                    <CommandEmpty>
                      <div className="text-xs space-y-2 py-2">
                        <div>{region ? "لا توجد نتائج مطابقة" : "لا تتوفر مدن — اختر المنطقة أولاً"}</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7"
                          onClick={() => {
                            const input = document.querySelector<HTMLInputElement>('[cmdk-input]');
                            const v = input?.value?.trim();
                            if (v && region) {
                              setForm({ ...form, customer_address: `${region} - ${v}` });
                              setCityOpen(false);
                            }
                          }}
                        >
                          استخدام النص كمدينة جديدة
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {cityOptions.map(c => (
                        <CommandItem
                          key={c}
                          value={c}
                          onSelect={() => {
                            setForm({ ...form, customer_address: `${region} - ${c}` });
                            setCityOpen(false);
                          }}
                        >
                          <Check className={cn("ml-2 h-3.5 w-3.5", city === c ? "opacity-100" : "opacity-0")} />
                          {c}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">منصة البروفايل</label>
            <Select value={form.customer_profile_platform} onValueChange={v => setForm({ ...form, customer_profile_platform: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFILE_PLATFORMS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center justify-between">
              <span>رابط/معرّف البروفايل</span>
              {profileFullUrl && (
                <a
                  href={profileFullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  فتح <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </label>
            <Input
              dir="ltr"
              className="text-left"
              placeholder={platformInfo?.prefix ? `${platformInfo.prefix}username` : "username أو رابط كامل"}
              value={form.customer_profile_url}
              onChange={e => setForm({ ...form, customer_profile_url: e.target.value })}
              disabled={form.customer_profile_platform === "none"}
            />
          </div>
        </div>
      ),
    },
    {
      key: "dates",
      title: "التواريخ والمصدر",
      summary: `${form.order_date}${form.delivery_date ? " → " + form.delivery_date : ""}`,
      defaultOpen: true,
      children: (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">تاريخ الطلبية</label>
            <Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">تاريخ التسليم</label>
            <Input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المصدر</label>
            <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      ),
    },
    {
      key: "items",
      title: "بنود الطلبية",
      summary: `${items.length} بند • ${fmt(form.subtotal)}`,
      defaultOpen: true,
      children: (
        <div>
          <div className="flex justify-end mb-3">
            <Button size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-3.5 w-3.5" /> إضافة بند</Button>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-md">لا توجد بنود بعد — اضغط «إضافة بند»</div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-[11px] font-semibold text-muted-foreground">
                <div className="col-span-4">المنتج</div>
                <div className="col-span-2">الكمية</div>
                <div className="col-span-2">السعر</div>
                <div className="col-span-2">الخصم</div>
                <div className="col-span-1 text-right">الإجمالي</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-md p-2">
                  <div className="col-span-4">
                    <ProductPicker
                      value={item.product_name}
                      products={products}
                      onSelect={(name) => updateItem(idx, "product_name", name)}
                    />
                    <Input
                      className="h-8 mt-1 text-xs"
                      placeholder="أو اكتب اسم المنتج يدوياً"
                      value={item.product_name}
                      onChange={e => updateItem(idx, "product_name", e.target.value)}
                    />
                  </div>
                  <Input className="col-span-2 h-9 text-xs" type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} />
                  <Input className="col-span-2 h-9 text-xs" type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                  <Input className="col-span-2 h-9 text-xs" type="number" value={item.discount} onChange={e => updateItem(idx, "discount", Number(e.target.value))} />
                  <div className="col-span-1 text-right text-xs font-semibold">{item.total.toLocaleString()}</div>
                  <Button size="sm" variant="ghost" className="col-span-1 text-destructive h-8" onClick={() => removeItem(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "payment",
      title: "الدفع والشحن",
      summary: `${form.payment_method} • ${form.payment_status}`,
      defaultOpen: true,
      children: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">طريقة الدفع</label>
            <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">حالة الدفع</label>
            <Select value={form.payment_status} onValueChange={v => setForm({ ...form, payment_status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">حالة الطلبية</label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">طريقة الشحن</label>
            <Input value={form.shipping_method} onChange={e => setForm({ ...form, shipping_method: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">رقم التتبع</label>
            <Input value={form.tracking_number} onChange={e => setForm({ ...form, tracking_number: e.target.value })} />
          </div>
        </div>
      ),
    },
    {
      key: "totals",
      title: "الإجماليات والملاحظات",
      summary: fmt(form.total),
      defaultOpen: true,
      children: (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المجموع الفرعي</label>
              <Input value={form.subtotal} readOnly className="bg-muted" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الخصم</label>
              <Input type="number" value={form.discount} onChange={e => {
                const d = Number(e.target.value);
                setForm(f => ({ ...f, discount: d, total: f.subtotal - d + f.shipping_cost }));
              }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">تكلفة الشحن</label>
              <Input type="number" value={form.shipping_cost} onChange={e => {
                const s = Number(e.target.value);
                setForm(f => ({ ...f, shipping_cost: s, total: f.subtotal - f.discount + s }));
              }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الإجمالي</label>
              <Input value={form.total} readOnly className="bg-primary/5 font-bold text-base" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
            <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      ),
    },
  ], [form, items, products, contacts, region, city, cityOpen, customerOpen, customerSearch, user]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">جاري تحميل الطلبية...</div>;
  }

  return (
    <FinanceShell
      title={isEdit ? "تعديل الطلبية" : "طلبية جديدة"}
      subtitle={isEdit ? `تحديث بيانات الطلبية ${editId?.slice(0, 8)}` : "إنشاء طلبية بيع جديدة وتعقّب حالتها"}
      breadcrumb={[{ label: "المبيعات" }, { label: "الطلبيات", href: "/orders" }, { label: isEdit ? "تعديل" : "جديد" }]}
      rightSlot={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => navigate("/orders")}>
            <X className="h-3.5 w-3.5" /> إلغاء
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "جاري الحفظ..." : (isEdit ? "حفظ التعديلات" : "إنشاء الطلبية")}
          </Button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto">
        <FastTabs items={tabs} />
        <div className="h-16" />
      </div>
    </FinanceShell>
  );
}
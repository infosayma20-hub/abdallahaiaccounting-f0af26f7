import { ExternalLink, Package, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { FastTabItem } from "@/components/finance/shell";
import { CustomerPicker } from "./components/CustomerPicker";
import { ProductPicker } from "./components/ProductPicker";
import FabricSelect from "@/components/inventory/FabricSelect";
import SupplierPicker from "./components/SupplierPicker";
import {
  PAYMENT_METHODS, PAYMENT_STATUSES, PROFILE_PLATFORMS, REGIONS, SOURCES, STATUSES,
  fmt, type Item, type OrderForm,
} from "./constants";

export interface TabsArgs {
  form: OrderForm;
  setForm: React.Dispatch<React.SetStateAction<OrderForm>>;
  items: Item[];
  products: any[];
  contacts: any[];
  suppliers: { id: string; name: string }[];
  ownerId?: string | null;
  /** Bellona-only: manual order ref + item-level supplier linking (see src/config/orderProcurementLink.ts) */
  procurementLinkEnabled?: boolean;
  customerOpen: boolean;
  setCustomerOpen: (v: boolean) => void;
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  cityOpen: boolean;
  setCityOpen: (v: boolean) => void;
  onCreateContact: (name: string) => Promise<void>;
  onCreateSupplier: (name: string) => Promise<string | null>;
  addItem: () => void;
  updateItem: (idx: number, field: keyof Item, value: any) => void;
  removeItem: (idx: number) => void;
  openQuickAdd: (idx: number, prefillName?: string) => void;
}

export function buildOrderTabs(a: TabsArgs): FastTabItem[] {
  const region = a.form.customer_address?.split(" - ")[0] || "";
  const city = a.form.customer_address?.split(" - ")[1] || "";
  const cityOptions = REGIONS[region] || [];
  const platformInfo = PROFILE_PLATFORMS.find((p) => p.value === a.form.customer_profile_platform);
  const profileFullUrl = (() => {
    const v = a.form.customer_profile_url?.trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (platformInfo?.prefix) return platformInfo.prefix + v.replace(/^@/, "");
    return v;
  })();

  return [
    {
      key: "customer",
      title: "بيانات العميل",
      summary: a.form.customer_name ? `${a.form.customer_name}${a.form.customer_phone ? " • " + a.form.customer_phone : ""}` : "—",
      hasError: !a.form.customer_name.trim(),
      defaultOpen: true,
      children: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {a.procurementLinkEnabled && (
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">
                رقم الطلبية اليدوي <span className="text-primary font-semibold">(المرجع الأساسي — يظهر على الفواتير والسندات)</span>
              </label>
              <Input
                dir="ltr"
                className="text-left font-mono h-10 border-primary/40 bg-primary/5"
                placeholder="مثال: 1025 أو BL-2026-87"
                value={(a.form as any).manual_ref || ""}
                onChange={(e) => a.setForm((f) => ({ ...f, manual_ref: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                اختياري — يمنع تكرار نفس الرقم. اتركه فارغاً للاكتفاء بالرقم التلقائي.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">اسم العميل *</label>
            <CustomerPicker
              open={a.customerOpen}
              onOpenChange={a.setCustomerOpen}
              search={a.customerSearch}
              onSearchChange={a.setCustomerSearch}
              contacts={a.contacts}
              selectedName={a.form.customer_name}
              onSelectContact={(c) => {
                a.setForm((prev) => ({
                  ...prev,
                  customer_name: c.contact_name,
                  customer_phone: prev.customer_phone || c.phone || "",
                  customer_address: prev.customer_address || c.address || "",
                }));
                a.setCustomerOpen(false);
              }}
              onCreateContact={async (name) => {
                await a.onCreateContact(name);
                a.setCustomerSearch("");
                a.setCustomerOpen(false);
              }}
            />
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="أو اكتب الاسم يدوياً"
              value={a.form.customer_name}
              onChange={(e) => a.setForm((f) => ({ ...f, customer_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الهاتف</label>
            <Input value={a.form.customer_phone} onChange={(e) => a.setForm((f) => ({ ...f, customer_phone: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المنطقة</label>
            <Select value={region} onValueChange={(v) => a.setForm((f) => ({ ...f, customer_address: v }))}>
              <SelectTrigger><SelectValue placeholder="اختر المنطقة" /></SelectTrigger>
              <SelectContent>{Object.keys(REGIONS).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المدينة</label>
            <Popover open={a.cityOpen} onOpenChange={a.setCityOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={a.cityOpen}
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
                            const input = document.querySelector<HTMLInputElement>("[cmdk-input]");
                            const v = input?.value?.trim();
                            if (v && region) {
                              a.setForm((f) => ({ ...f, customer_address: `${region} - ${v}` }));
                              a.setCityOpen(false);
                            }
                          }}
                        >
                          استخدام النص كمدينة جديدة
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {cityOptions.map((c) => (
                        <CommandItem
                          key={c}
                          value={c}
                          onSelect={() => {
                            a.setForm((f) => ({ ...f, customer_address: `${region} - ${c}` }));
                            a.setCityOpen(false);
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
            <Select value={a.form.customer_profile_platform} onValueChange={(v) => a.setForm((f) => ({ ...f, customer_profile_platform: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFILE_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center justify-between">
              <span>رابط/معرّف البروفايل</span>
              {profileFullUrl && (
                <a href={profileFullUrl} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  فتح <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </label>
            <Input
              dir="ltr"
              className="text-left"
              placeholder={platformInfo?.prefix ? `${platformInfo.prefix}username` : "username أو رابط كامل"}
              value={a.form.customer_profile_url}
              onChange={(e) => a.setForm((f) => ({ ...f, customer_profile_url: e.target.value }))}
              disabled={a.form.customer_profile_platform === "none"}
            />
          </div>
        </div>
      ),
    },
    {
      key: "dates",
      title: "التواريخ والمصدر",
      summary: `${a.form.order_date}${a.form.delivery_date ? " → " + a.form.delivery_date : ""}`,
      defaultOpen: true,
      children: (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">تاريخ الطلبية</label>
            <Input type="date" value={a.form.order_date} onChange={(e) => a.setForm((f) => ({ ...f, order_date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">تاريخ التسليم</label>
            <Input type="date" value={a.form.delivery_date} onChange={(e) => a.setForm((f) => ({ ...f, delivery_date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المصدر</label>
            <Select value={a.form.source} onValueChange={(v) => a.setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      ),
    },
    {
      key: "items",
      title: "بنود الطلبية",
      summary: `${a.items.length} بند • ${fmt(a.form.subtotal)}`,
      defaultOpen: true,
      children: (
        <div>
          <div className="flex justify-end mb-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { a.addItem(); setTimeout(() => a.openQuickAdd(a.items.length), 0); }}
                className="gap-1"
              >
                <Package className="h-3.5 w-3.5" /> إضافة سريعة لمنتج
              </Button>
              <Button size="sm" variant="outline" onClick={a.addItem} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> إضافة بند
              </Button>
            </div>
          </div>
          {a.items.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-md">
              لا توجد بنود بعد — اضغط «إضافة بند»
            </div>
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
              {a.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-md p-2">
                  <div className="col-span-4">
                    <div className="flex items-center gap-1">
                      <div className="flex-1">
                        <ProductPicker
                          value={item.product_name}
                          products={a.products}
                          onSelect={(name) => a.updateItem(idx, "product_name", name)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-primary"
                        title="إضافة سريعة لمنتج جديد"
                        onClick={() => a.openQuickAdd(idx, item.product_name)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      className="h-8 mt-1 text-xs"
                      placeholder="أو اكتب اسم المنتج يدوياً"
                      value={item.product_name}
                      onChange={(e) => a.updateItem(idx, "product_name", e.target.value)}
                    />
                    <div className="mt-1">
                      <FabricSelect
                        value={item.fabric ?? null}
                        ownerId={a.ownerId}
                        onChange={(v) => a.updateItem(idx, "fabric", v)}
                      />
                    </div>
                    {a.procurementLinkEnabled && (
                      <div className="mt-1">
                        <SupplierPicker
                          value={item.supplier_id}
                          onChange={(v) => a.updateItem(idx, "supplier_id", v)}
                          suppliers={a.suppliers}
                          onCreate={a.onCreateSupplier}
                          disabled={!!item.procurement_order_id}
                        />
                        {item.procurement_order_id && (
                          <p className="text-[10px] text-emerald-600 mt-0.5">✓ تم إنشاء طلبية شراء لهذا البند</p>
                        )}
                      </div>
                    )}
                  </div>
                  <Input className="col-span-2 h-9 text-xs" type="number" value={item.quantity} onChange={(e) => a.updateItem(idx, "quantity", Number(e.target.value))} />
                  <Input className="col-span-2 h-9 text-xs" type="number" value={item.unit_price} onChange={(e) => a.updateItem(idx, "unit_price", Number(e.target.value))} />
                  <Input className="col-span-2 h-9 text-xs" type="number" value={item.discount} onChange={(e) => a.updateItem(idx, "discount", Number(e.target.value))} />
                  <div className="col-span-1 text-right text-xs font-semibold">{item.total.toLocaleString()}</div>
                  <Button size="sm" variant="ghost" className="col-span-1 text-destructive h-8" onClick={() => a.removeItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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
      summary: `${a.form.payment_method} • ${a.form.payment_status}`,
      defaultOpen: true,
      children: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">طريقة الدفع</label>
            <Select value={a.form.payment_method} onValueChange={(v) => a.setForm((f) => ({ ...f, payment_method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">حالة الدفع</label>
            <Select value={a.form.payment_status} onValueChange={(v) => a.setForm((f) => ({ ...f, payment_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">حالة الطلبية</label>
            <Select value={a.form.status} onValueChange={(v) => a.setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">طريقة الشحن</label>
            <Input value={a.form.shipping_method} onChange={(e) => a.setForm((f) => ({ ...f, shipping_method: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">رقم التتبع</label>
            <Input value={a.form.tracking_number} onChange={(e) => a.setForm((f) => ({ ...f, tracking_number: e.target.value }))} />
          </div>
        </div>
      ),
    },
    {
      key: "totals",
      title: "الإجماليات والملاحظات",
      summary: fmt(a.form.total),
      defaultOpen: true,
      children: (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المجموع الفرعي</label>
              <Input value={a.form.subtotal} readOnly className="bg-muted" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الخصم</label>
              <Input type="number" value={a.form.discount} onChange={(e) => {
                const d = Number(e.target.value);
                a.setForm((f) => ({ ...f, discount: d, total: f.subtotal - d + f.shipping_cost }));
              }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">تكلفة الشحن</label>
              <Input type="number" value={a.form.shipping_cost} onChange={(e) => {
                const s = Number(e.target.value);
                a.setForm((f) => ({ ...f, shipping_cost: s, total: f.subtotal - f.discount + s }));
              }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الإجمالي</label>
              <Input value={a.form.total} readOnly className="bg-primary/5 font-bold text-base" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
            <Textarea rows={3} value={a.form.notes} onChange={(e) => a.setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      ),
    },
  ];
}
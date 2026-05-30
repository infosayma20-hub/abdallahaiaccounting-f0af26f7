import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const COLOR_PRESETS = [
  { label: "Navy", value: "#1B3A5C" },
  { label: "أسود", value: "#1a1a1a" },
  { label: "أخضر داكن", value: "#1B4332" },
  { label: "بني", value: "#92400E" },
];

const LAYOUT_OPTIONS = [
  { value: "logo_left", label: "شعار يسار" },
  { value: "logo_right", label: "شعار يمين" },
  { value: "logo_center", label: "شعار وسط" },
  { value: "no_logo", label: "بدون شعار" },
];

const InvoiceTemplateCustomizer = ({ settings, onChange }: Props) => {
  const color = settings.invoice_primary_color || "#1B3A5C";
  const layout = settings.invoice_header_layout || "logo_right";
  const isCustomColor = !COLOR_PRESETS.some(p => p.value === color);
  const [showCustomPicker, setShowCustomPicker] = useState(isCustomColor);

  return (
    <div className="flex gap-6 min-h-[500px]" dir="rtl">
      {/* Left: Settings (40%) */}
      <div className="w-[40%] shrink-0 space-y-6 overflow-y-auto max-h-[calc(100vh-420px)] pl-4">
        {/* Section 1: Logo & Colors */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            الشعار والألوان
          </h4>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">شعار الشركة</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/40 transition-colors cursor-pointer">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="h-12 mx-auto object-contain" />
                ) : (
                  <p className="text-xs text-muted-foreground">ارفع شعارك — PNG/SVG حتى 2MB</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">اللون الرئيسي للفاتورة</Label>
              <div className="grid grid-cols-2 gap-2">
                {COLOR_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => { onChange({ invoice_primary_color: preset.value }); setShowCustomPicker(false); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      color === preset.value && !showCustomPicker
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full shrink-0 border border-border" style={{ backgroundColor: preset.value }} />
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowCustomPicker(true)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  showCustomPicker ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                }`}
              >
                <span className="w-4 h-4 rounded-full shrink-0 border border-border" style={{ backgroundColor: color }} />
                مخصص
              </button>
              {showCustomPicker && (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={color}
                    onChange={e => onChange({ invoice_primary_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0"
                  />
                  <Input
                    value={color}
                    onChange={e => onChange({ invoice_primary_color: e.target.value })}
                    className="text-xs font-mono h-8"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Section 2: Header Layout */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            تخطيط الهيدر
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {LAYOUT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onChange({ invoice_header_layout: opt.value })}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-all ${
                  layout === opt.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <LayoutIcon type={opt.value} color={color} />
                <span className="font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Section 3: Additional Info */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            معلومات إضافية
          </h4>
          <div className="space-y-2.5">
            {[
              { key: "show_tax_on_invoice" as const, label: "أظهر الرقم الضريبي" },
              { key: "show_bank_on_invoice" as const, label: "أظهر بيانات البنك للتحويل" },
              { key: "invoice_show_signature" as const, label: "أظهر مربع التوقيع والختم" },
              { key: "invoice_show_tax_summary" as const, label: "أظهر ملخص الضريبة (Tax Summary)" },
              { key: "invoice_show_amount_words" as const, label: "أظهر المبلغ كتابةً" },
              { key: "invoice_show_due_date" as const, label: "أظهر تاريخ الاستحقاق" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between py-1.5">
                <span className="text-xs">{item.label}</span>
                <Switch
                  checked={settings[item.key] as boolean}
                  onCheckedChange={v => onChange({ [item.key]: v })}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs text-muted-foreground">رسالة الفوتر الافتراضية</Label>
            <Textarea
              value={settings.invoice_footer_message || ""}
              onChange={e => onChange({ invoice_footer_message: e.target.value })}
              placeholder="شكراً لتعاملكم معنا"
              rows={2}
              className="text-xs resize-none"
            />
          </div>
        </div>
      </div>

      {/* Right: Live Preview (60%) */}
      <div className="flex-1 min-w-0">
        <div className="sticky top-0">
          <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-3 text-center">معاينة حية</p>
            <InvoicePreview settings={settings} color={color} layout={layout} />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Layout Icon Mini ─── */
const LayoutIcon = ({ type, color }: { type: string; color: string }) => (
  <div className="w-12 h-8 rounded border border-border bg-background flex items-center justify-between px-1" style={{ fontSize: 0 }}>
    {type === "logo_left" && (
      <>
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
        <div className="space-y-0.5 flex-1 mr-1">
          <div className="h-0.5 bg-muted-foreground/30 rounded w-full" />
          <div className="h-0.5 bg-muted-foreground/20 rounded w-3/4" />
        </div>
      </>
    )}
    {type === "logo_right" && (
      <>
        <div className="space-y-0.5 flex-1 ml-1">
          <div className="h-0.5 bg-muted-foreground/30 rounded w-full" />
          <div className="h-0.5 bg-muted-foreground/20 rounded w-3/4" />
        </div>
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      </>
    )}
    {type === "no_logo" && (
      <div className="w-full space-y-0.5 flex flex-col items-center">
        <div className="h-0.5 bg-muted-foreground/30 rounded w-3/4" />
        <div className="h-0.5 bg-muted-foreground/20 rounded w-1/2" />
      </div>
    )}
  </div>
);

/* ─── Live Invoice Preview ─── */
const InvoicePreview = ({ settings, color, layout }: { settings: CompanySettings; color: string; layout: string }) => {
  const companyName = settings.company_name || "اسم الشركة";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${color}-${layout}`}
        initial={{ opacity: 0.7, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-lg shadow-sm overflow-hidden text-[10px] leading-relaxed"
        style={{ direction: "rtl", minHeight: 400 }}
      >
        {/* Header */}
        <div className="px-4 py-3" style={{ backgroundColor: color }}>
          <div className={`flex items-center gap-3 ${layout === "logo_left" ? "flex-row-reverse" : ""}`}>
            {layout !== "no_logo" && (
              <div className="w-10 h-10 bg-white/20 rounded-md flex items-center justify-center shrink-0">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="" className="w-8 h-8 object-contain" />
                ) : (
                  <span className="text-white/60 text-[10px] font-medium">LOGO</span>
                )}
              </div>
            )}
            <div className={`flex-1 ${layout === "no_logo" ? "text-center" : ""}`}>
              <p className="text-white font-bold text-xs">{companyName}</p>
              {settings.address && <p className="text-white/70 text-[8px]">{settings.address}</p>}
              {settings.phone && <p className="text-white/70 text-[8px]">{settings.phone}</p>}
              {settings.phone2 && <p className="text-white/70 text-[8px]">{settings.phone2}</p>}
            </div>
          </div>
        </div>

        {/* Invoice Title */}
        <div className="text-center py-2 border-b border-gray-100">
          <p className="font-bold text-xs text-gray-800">فاتورة مبيعات</p>
          <p className="text-[8px] text-gray-400">نسخة أصلية</p>
        </div>

        {/* Invoice Meta */}
        <div className="px-4 py-2 flex justify-between text-[9px] text-gray-500 border-b border-gray-50">
          <span>رقم: INV-2026-0042</span>
          <span>التاريخ: 2026/03/13</span>
        </div>
        <div className="px-4 py-1.5 text-[9px] text-gray-600 border-b border-gray-50">
          العميل: <span className="font-medium text-gray-800">شركة النور للتجارة</span>
        </div>

        {/* Tax Number */}
        <AnimatePresence>
          {settings.show_tax_on_invoice && settings.tax_number && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-1 text-[8px] text-gray-400 border-b border-gray-50 overflow-hidden"
            >
              الرقم الضريبي: {settings.tax_number || "000000000"}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items Table */}
        <div className="px-4 py-2">
          <table className="w-full text-[9px]">
            <thead>
              <tr style={{ backgroundColor: `${color}10` }}>
                <th className="py-1 px-1 text-right font-medium text-gray-600">#</th>
                <th className="py-1 px-1 text-right font-medium text-gray-600">الصنف</th>
                <th className="py-1 px-1 text-center font-medium text-gray-600">الكمية</th>
                <th className="py-1 px-1 text-center font-medium text-gray-600">السعر</th>
                <th className="py-1 px-1 text-left font-medium text-gray-600">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "كرتون حليب طازج", qty: 10, price: 45 },
                { name: "عصير برتقال 1 لتر", qty: 24, price: 12 },
                { name: "سكر 5 كغ", qty: 5, price: 28 },
              ].map((item, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1 px-1 text-gray-400">{i + 1}</td>
                  <td className="py-1 px-1 text-gray-700">{item.name}</td>
                  <td className="py-1 px-1 text-center text-gray-600">{item.qty}</td>
                  <td className="py-1 px-1 text-center text-gray-600">₪{item.price}</td>
                  <td className="py-1 px-1 text-left text-gray-700 font-medium">₪{item.qty * item.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-4 py-2 border-t border-gray-100">
          <div className="flex justify-between text-[9px] text-gray-600 py-0.5">
            <span>المجموع قبل الضريبة</span>
            <span>₪1,078</span>
          </div>
          <AnimatePresence>
            {settings.invoice_show_tax_summary && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex justify-between text-[9px] text-gray-500 py-0.5">
                  <span>ضريبة القيمة المضافة 16%</span>
                  <span>₪172.48</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-dashed border-gray-200" style={{ color }}>
            <span>صافي الفاتورة</span>
            <span>₪{settings.invoice_show_tax_summary ? "1,250.48" : "1,078"}</span>
          </div>
        </div>

        {/* Amount in words */}
        <AnimatePresence>
          {settings.invoice_show_amount_words && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-1.5 text-[8px] text-gray-500 bg-gray-50/50 overflow-hidden"
            >
              المبلغ كتابةً: ألف وثمانية وسبعون شيكل فقط لا غير
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bank Details */}
        <AnimatePresence>
          {settings.show_bank_on_invoice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-1.5 text-[8px] text-gray-400 border-t border-gray-50 overflow-hidden"
            >
              بنك القدس — فرع رام الله — حساب 1234567890
            </motion.div>
          )}
        </AnimatePresence>

        {/* Signature */}
        <AnimatePresence>
          {settings.invoice_show_signature && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-3 flex justify-between items-end border-t border-gray-100 overflow-hidden"
            >
              <div className="text-center">
                <div className="w-20 border-b border-dashed border-gray-300 mb-1" />
                <p className="text-[8px] text-gray-400">توقيع المستلم</p>
              </div>
              <div className="text-center">
                <div className="w-20 border-b border-dashed border-gray-300 mb-1" />
                <p className="text-[8px] text-gray-400">التوقيع والختم</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        {(settings.invoice_footer_message || settings.invoice_footer) && (
          <div className="px-4 py-2 text-center text-[8px] text-gray-400 border-t border-gray-100" style={{ backgroundColor: `${color}08` }}>
            {settings.invoice_footer_message || settings.invoice_footer}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default InvoiceTemplateCustomizer;

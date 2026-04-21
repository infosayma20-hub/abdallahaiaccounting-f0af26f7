import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Save, Sparkles, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useAuth } from "@/hooks/useAuth";
import { getThemeForUser, type PrintTheme, DEFAULT_THEME } from "@/lib/print-themes";
import { amountToArabicWords } from "@/lib/arabic-number-words";
import EditableText from "./EditableText";
// PDF imports removed — print only

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: any;
  embedded?: boolean;
}

const fmt = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const TEMPLATE_TITLES: Record<string, string> = {
  QUO: "عرض سعر", CON: "عقد بيع", DEM: "مطالبة مالية", DN: "إشعار دين",
  CN: "إشعار دائن", RCP: "وصل استلام", SUP: "عقد توريد", OD: "إشعار تأخر سداد",
  POA: "تفويض رسمي", CLR: "خطاب إخلاء طرف",
};

const PrintTemplatePreview = ({ open, onOpenChange, document: doc, embedded = false }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { logoBase64, companyName, companyPhone, companyEmail, companyAddress, taxNumber } = useCompanyLogo();
  const { user } = useAuth();
  const theme = getThemeForUser(user?.email);
  const isCustom = theme.id !== "default";

  const type = doc?.template_type || "";
  const data = doc?.data || {};
  const title = TEMPLATE_TITLES[type] || type;
  const currency = data.currency || "شيكل";

  // ---------- Inline editable text overrides ----------
  // Persisted to print_documents.data.custom_text. The default strings live
  // alongside each render below; the user can override any of them inline and
  // optionally enhance them with AI (see EditableText).
  const initialOverrides: Record<string, string> = (data.custom_text as any) || {};
  const [customText, setCustomText] = useState<Record<string, string>>(initialOverrides);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset overrides whenever a different document is loaded
  useEffect(() => {
    setCustomText((doc?.data?.custom_text as Record<string, string>) || {});
    setDirty(false);
  }, [doc?.id]);

  /** Get the current text for a key — user override if present, else fallback. */
  const getText = (key: string, fallback: string) =>
    customText[key] != null ? customText[key] : fallback;

  /** Set/clear an override and mark the document as dirty. */
  const setText = (key: string, fallback: string) => (next: string) => {
    setCustomText((prev) => {
      const out = { ...prev };
      if (next === fallback || next.trim() === "") {
        // Restore default by removing the override
        delete out[key];
      } else {
        out[key] = next;
      }
      return out;
    });
    setDirty(true);
  };

  /** Editable wrapper — tiny shorthand to keep the body renderers readable. */
  const Edit = ({
    k,
    fallback,
    as = "span",
    style,
  }: {
    k: string;
    fallback: string;
    as?: "p" | "span" | "div";
    style?: React.CSSProperties;
  }) => (
    <EditableText
      as={as}
      value={getText(k, fallback)}
      onChange={setText(k, fallback)}
      aiContext={title}
      disabled={!doc?.id /* can't persist edits without an id (preview mode) */}
      style={style}
    />
  );

  const handleSaveEdits = async () => {
    if (!doc?.id) {
      toast({ title: "لا يمكن حفظ التعديلات في وضع المعاينة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const nextData = { ...(doc.data || {}), custom_text: customText };
      const { error } = await supabase
        .from("print_documents")
        .update({ data: nextData })
        .eq("id", doc.id);
      if (error) throw error;
      // Mutate the in-memory doc so subsequent prints use the saved text
      doc.data = nextData;
      setDirty(false);
      toast({ title: "✅ تم حفظ التعديلات" });
    } catch (err: any) {
      toast({ title: "خطأ في الحفظ", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetEdits = () => {
    setCustomText({});
    setDirty(true);
    toast({ title: "تم استرجاع النص الافتراضي" });
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;

    // Clone the content so we can rewrite relative image URLs to absolute ones
    // (relative paths break inside about:blank windows in some browsers).
    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (src && !/^(https?:|data:|blob:)/.test(src)) {
        img.setAttribute("src", new URL(src, window.location.origin).href);
      }
    });
    // Strip any AI floating toolbars that might have been left in the DOM.
    clone.querySelectorAll(".no-print").forEach((el) => el.remove());

    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet">
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: ${theme.fontFamily}; direction: rtl; font-size: 11px; color: ${theme.textColor}; margin: 0; padding: 12mm 18mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 5px 8px; text-align: right; border-bottom: 1px solid #E5E7EB; font-size: 10px; }
        th { font-weight: 600; border-top: 1px solid ${theme.primaryColor}; border-bottom: 1px solid ${theme.primaryColor}; font-size: 9px; }
        .sig-line { border-top: 1px solid #9CA3AF; width: 150px; margin-top: 30px; padding-top: 4px; text-align: center; font-size: 10px; color: #6B7280; }
        .amount-block { text-align: center; margin: 14px 0; padding: 10px; }
        .amount-value { font-size: ${theme.amountFontSize}px; font-weight: 800; color: ${theme.amountColor}; }
        .amount-words { font-size: 11px; color: #666; font-style: italic; margin-top: 4px; }
        .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: ${theme.watermarkOpacity}; z-index: 0; pointer-events: none; }
        /* Remove any leftover edit affordances from contentEditable elements */
        [contenteditable] { outline: none !important; }
        .no-print { display: none !important; }
        img { max-width: 100%; }
      </style></head><body>${clone.innerHTML}</body></html>`);
    w.document.close();

    // Wait for fonts + images to load before triggering the print dialog.
    const triggerPrint = () => {
      try { w.focus(); w.print(); } catch {}
      // Give the print dialog a moment, then close.
      setTimeout(() => { try { w.close(); } catch {} }, 500);
    };
    const imgs = Array.from(w.document.images);
    const waitImages = Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
            }),
      ),
    );
    const waitFonts =
      (w.document as any).fonts?.ready instanceof Promise
        ? (w.document as any).fonts.ready
        : Promise.resolve();
    Promise.all([waitImages, waitFonts]).then(() => setTimeout(triggerPrint, 100));
  };

  // PDF download removed — print only

  // Doulia-specific body renderers with premium styling
  const renderDouliQuotationBody = () => (
    <>
      <p style={{ fontSize: 12, lineHeight: 2, marginBottom: 10 }}>
        يسرنا في <strong>{companyName}</strong> أن نضع بين أيديكم عرض سعر
        {data.work_description ? ` على ${data.work_description}` : " لتنفيذ الأعمال المطلوبة"}:
      </p>
      {data.specs && (
        <div style={{ background: theme.lightBg, padding: "8px 12px", borderRadius: 6, marginBottom: 10, position: "relative", overflow: "hidden" }}>
          <div style={{ fontWeight: 700, marginBottom: 4, textDecoration: "underline", fontSize: 12 }}>المواصفات</div>
          <div style={{ whiteSpace: "pre-line", lineHeight: 1.8, fontSize: 11 }}>{data.specs}</div>
        </div>
      )}
      {data.items?.length > 0 && (
        <table>
          <thead><tr><th>#</th><th>البند / الخدمة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {data.items.map((it: any, i: number) => (
              <tr key={i}><td>{i + 1}</td><td>{it.description}</td><td>{it.quantity}</td><td>₪{fmt(it.unit_price)}</td><td>₪{fmt(it.quantity * it.unit_price)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {renderTotals()}
      {renderAmountBlock(data.total || data.subtotal || 0)}
      {data.payment_terms && <p style={{ marginTop: 8 }}><strong>شروط الدفع:</strong> {data.payment_terms}</p>}
      {data.validity_days && <p>هذا العرض ساري لمدة <strong>{data.validity_days} يوماً</strong> من تاريخ الإصدار.</p>}
    </>
  );

  const renderDouliaDemandBody = () => (
    <>
      <p style={{ fontSize: 14, lineHeight: 2.2 }}>تحية طيبة وبعد،</p>
      <p style={{ fontSize: 14, lineHeight: 2.2, textAlign: 'justify' }}>
        نتقدم إليكم من <strong>{companyName}</strong> بأطيب التحيات، ونود الإشارة إلى أن سجلاتنا المحاسبية تُظهر وجود رصيد مستحق على حسابكم الكريم لدينا. وانطلاقاً من حرصنا على استمرار العلاقة التجارية المتميزة التي تجمعنا بكم، والمبنية على أسس الثقة والاحترام المتبادل، فإننا نأمل التكرم بمراجعة تفاصيل الحساب أدناه وترتيب عملية التسوية في أقرب فرصة ممكنة. ونؤكد لكم استعدادنا التام للتعاون والتنسيق بما يحقق المصلحة المشتركة ويُعزز شراكتنا الناجحة.
      </p>
      {renderAmountBlock(data.amount || 0)}
      <p style={{ fontSize: 14, lineHeight: 2.2, textAlign: 'justify' }}>
        نرجو التكرم بتسوية المبلغ المذكور أعلاه خلال مدة أقصاها <strong>{data.response_days || 7} أيام</strong> من تاريخ هذه الرسالة. وفي حال وجود أي استفسار أو رغبة في ترتيب جدول سداد مناسب، يُسعدنا التواصل معكم لإيجاد الحل الأمثل الذي يُرضي الطرفين.
      </p>
      <div style={{ marginTop: 32, fontSize: 13, lineHeight: 2 }}>
        <p>مع فائق الاحترام والتقدير،</p>
        <p style={{ fontWeight: 700 }}>المدير العام</p>
        <p>{companyName}</p>
      </div>
    </>
  );

  const renderDouliaContractBody = () => (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: theme.primaryColor }}>أولاً: أطراف العقد</div>
        <p><strong>الطرف الأول (البائع):</strong> {companyName}</p>
        <p><strong>الطرف الثاني (المشتري):</strong> {doc.contact_name || "—"}</p>
      </div>
      {data.work_description && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: theme.primaryColor }}>ثانياً: وصف العمل والمواصفات</div>
          <p>{data.work_description}</p>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: theme.primaryColor }}>ثالثاً: القيمة الإجمالية</div>
        {renderAmountBlock(data.contract_value || 0)}
      </div>
      {data.execution_period && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: theme.primaryColor }}>رابعاً: مدة التنفيذ والتسليم</div>
          <p>{data.execution_period}</p>
        </div>
      )}
      {data.warranty_terms && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: theme.primaryColor }}>خامساً: شروط الضمان</div>
          <p>{data.warranty_terms}</p>
        </div>
      )}
    </>
  );

  // Shared components
  const renderTotals = () => (
    <div style={{ marginTop: 8, fontSize: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>المجموع الفرعي:</span><span>₪{fmt(data.subtotal || 0)}</span></div>
      {data.discount_percent > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>الخصم ({data.discount_percent}%):</span>
          <span>-₪{fmt((data.subtotal || 0) * data.discount_percent / 100)}</span>
        </div>
      )}
      {data.discount_percent < 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", color: "#B45309" }}>
          <span>زيادة ({Math.abs(data.discount_percent)}%):</span>
          <span>+₪{fmt((data.subtotal || 0) * Math.abs(data.discount_percent) / 100)}</span>
        </div>
      )}
      {data.vat_enabled && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>ضريبة القيمة المضافة (16%):</span>
          <span>₪{fmt(((data.subtotal || 0) - (data.subtotal || 0) * (data.discount_percent || 0) / 100) * 0.16)}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: `1px solid ${theme.primaryColor}`, paddingTop: 4, marginTop: 4 }}><span>الإجمالي النهائي:</span><span>₪{fmt(data.total || 0)}</span></div>
    </div>
  );

  const renderAmountBlock = (amount: number) => {
    if (!amount || !isCustom) return null;
    return (
      <div style={{ textAlign: "center", margin: "14px 0", padding: "10px 0" }}>
        <div style={{ borderTop: `2px solid ${theme.primaryColor}`, borderBottom: `2px solid ${theme.primaryColor}`, padding: "10px 0", margin: "0 auto", maxWidth: 500 }}>
          <div style={{ fontSize: 11, marginBottom: 4 }}>و عليه يكون السعر النهائي المطلوب كاملاً</div>
          <div style={{ fontSize: theme.amountFontSize, fontWeight: 800, color: theme.amountColor }}>
            ({fmtInt(amount)}) {currency}
          </div>
          {theme.showAmountInWords && (
            <div style={{ fontSize: 11, color: "#666", fontStyle: "italic", marginTop: 4 }}>
              {amountToArabicWords(amount, currency)}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBody = () => {
    // Use premium templates for Doulia
    if (isCustom) {
      switch (type) {
        case "QUO": return renderDouliQuotationBody();
        case "DEM": return renderDouliaDemandBody();
        case "CON": return renderDouliaContractBody();
        // Fall through to standard for other types with amount block enhancement
      }
    }

    switch (type) {
      case "QUO":
        return (
          <>
            <Edit
              k="quo_intro"
              as="p"
              fallback="السادة المحترمين، يسعدنا تقديم عرض الأسعار التالي لتنفيذ الأعمال المطلوبة:"
              style={{ marginBottom: 8 }}
            />
            {data.items?.length > 0 && (
              <table>
                <thead><tr><th>#</th><th>البند / الخدمة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                <tbody>
                  {data.items.map((it: any, i: number) => (
                    <tr key={i}><td>{i + 1}</td><td>{it.description}</td><td>{it.quantity}</td><td>₪{fmt(it.unit_price)}</td><td>₪{fmt(it.quantity * it.unit_price)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {renderTotals()}
            {data.payment_terms && (
              <p style={{ marginTop: 12 }}>
                <strong>شروط الدفع:</strong>{" "}
                <Edit k="quo_payment_terms" fallback={data.payment_terms} />
              </p>
            )}
            {data.validity_days && (
              <Edit
                k="quo_validity"
                as="p"
                fallback={`هذا العرض ساري لمدة ${data.validity_days} يوماً من تاريخ الإصدار.`}
              />
            )}
            <Edit
              k="quo_closing"
              as="p"
              fallback="نأمل أن ينال هذا العرض رضاكم، ونحن على استعداد تام للإجابة على أي استفسار."
              style={{ marginTop: 12 }}
            />
          </>
        );

      case "CON":
        return (
          <>
            <p>
              <strong>وصف العمل:</strong>{" "}
              <Edit k="con_work_description" fallback={data.work_description || ""} />
            </p>
            <p><strong>القيمة الإجمالية:</strong> ₪{fmt(data.contract_value || 0)}</p>
            <p>
              <strong>مدة التنفيذ:</strong>{" "}
              <Edit k="con_execution_period" fallback={data.execution_period || ""} />
            </p>
            {data.warranty_terms && (
              <p>
                <strong>شروط الضمان:</strong>{" "}
                <Edit k="con_warranty" fallback={data.warranty_terms} />
              </p>
            )}
          </>
        );

      case "DEM":
        return (
          <>
            <Edit
              k="dem_intro"
              as="p"
              fallback={`نتقدم إليكم بأطيب التحيات، ونود الإشارة إلى أن سجلاتنا المحاسبية تُظهر وجود رصيد مستحق على حسابكم الكريم لدينا بقيمة ₪${fmt(data.amount || 0)}. وانطلاقاً من حرصنا على استمرار العلاقة التجارية المتميزة التي تجمعنا بكم، فإننا نأمل التكرم بترتيب عملية التسوية في أقرب فرصة ممكنة، ونؤكد لكم استعدادنا التام للتعاون والتنسيق بما يحقق المصلحة المشتركة.`}
            />
            <Edit
              k="dem_followup"
              as="p"
              fallback={`نرجو التكرم بتسوية المبلغ المذكور خلال مدة أقصاها ${data.response_days || 7} أيام من تاريخ هذا الخطاب. وفي حال وجود أي استفسار، يُسعدنا التواصل معكم لإيجاد الحل الأمثل.`}
            />
            {isCustom && renderAmountBlock(data.amount || 0)}
          </>
        );

      case "DN":
        return (
          <>
            <Edit
              k="dn_intro"
              as="p"
              fallback={`بناءً على ذلك، تم إضافة مبلغ ₪${fmt(data.amount || 0)} على حسابكم.`}
            />
            {data.reason && <p><strong>السبب:</strong> {data.reason}</p>}
            {data.ref_invoice && <p><strong>رقم الفاتورة المرجعية:</strong> {data.ref_invoice}</p>}
            {isCustom && renderAmountBlock(data.amount || 0)}
          </>
        );

      case "CN":
        return (
          <>
            <Edit
              k="cn_intro"
              as="p"
              fallback={`بناءً على ذلك، تم خصم مبلغ ₪${fmt(data.amount || 0)} من حسابكم.`}
            />
            {data.reason && <p><strong>السبب:</strong> {data.reason}</p>}
            {data.ref_invoice && <p><strong>رقم الفاتورة المرجعية:</strong> {data.ref_invoice}</p>}
            {isCustom && renderAmountBlock(data.amount || 0)}
          </>
        );

      case "RCP":
        return (
          <>
            <p>أقر أنا الموقع أدناه باستلام: <strong>{data.receive_type}</strong></p>
            <p><strong>الكمية / المبلغ:</strong> {data.amount}</p>
            <p><strong>الحالة:</strong> {data.condition}</p>
            {data.receiver_name && <p><strong>اسم المستلِم:</strong> {data.receiver_name}</p>}
          </>
        );

      case "SUP":
        return (
          <>
            <p><strong>المورد:</strong> {data.supplier_name}</p>
            {data.items?.length > 0 && (
              <table>
                <thead><tr><th>#</th><th>المادة</th><th>الكمية</th><th>السعر</th></tr></thead>
                <tbody>
                  {data.items.map((it: any, i: number) => (
                    <tr key={i}><td>{i + 1}</td><td>{it.description}</td><td>{it.quantity}</td><td>₪{fmt(it.unit_price)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p><strong>مدة العقد:</strong> من {data.contract_from} إلى {data.contract_to}</p>
            {data.supply_terms && <p><strong>شروط التوريد:</strong> {data.supply_terms}</p>}
          </>
        );

      case "OD":
        return (
          <>
            <p>نود إبلاغكم بوجود مبلغ متأخر قدره <strong>₪{fmt(data.amount || 0)}</strong>.</p>
            <p>نرجو التسديد خلال <strong>{data.response_days || 7} أيام</strong>.</p>
            {data.urgency_level === "firm" && <p style={{ color: "#DC2626" }}>⚠️ هذا تحذير حازم — يرجى الالتزام بالسداد فوراً.</p>}
            {data.urgency_level === "final" && <p style={{ color: "#DC2626", fontWeight: 700 }}>🚨 إنذار نهائي — سيتم اتخاذ إجراءات قانونية في حال عدم السداد.</p>}
            {isCustom && renderAmountBlock(data.amount || 0)}
          </>
        );

      case "POA":
        return (
          <>
            <p>أنا الموقع أدناه أفوّض السيد/ة <strong>{data.delegate_name}</strong> (هوية رقم: {data.delegate_id})</p>
            <p>للتعامل مع <strong>{data.target_entity}</strong></p>
            <p><strong>مدة التفويض:</strong> من {data.poa_from} إلى {data.poa_to}</p>
          </>
        );

      case "CLR":
        return (
          <>
            <Edit
              k="clr_intro"
              as="p"
              fallback="نشهد بموجب هذا الخطاب أن الجهة المذكورة أدناه قد أوفت بجميع التزاماتها المالية والتعاقدية."
            />
            {data.subject && <p><strong>الموضوع:</strong> {data.subject}</p>}
            <Edit
              k="clr_closing"
              as="p"
              fallback="وبناءً عليه، فإنه لا توجد أي مطالبات أو التزامات مالية متبقية."
            />
          </>
        );

      default: return <p>—</p>;
    }
  };

  // Themed header
  const renderHeader = () => {
    if (isCustom && theme.headerStyle === "premium") {
      return (
        <>
          {/* Navy header bar */}
          <div style={{
            background: "#1B2B4B", color: "#FFFFFF", margin: "-32px -40px 0", padding: "14px 28px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Amiri', 'Cairo', serif", fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{companyName || "AMWALI"}</div>
              {theme.tagline && <div style={{ fontSize: 10, opacity: 0.8 }}>{theme.tagline}</div>}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{
                backgroundColor: '#FFFFFF', padding: '5px', borderRadius: '6px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '72px', height: '72px',
              }}>
                <img
                  src="/logos/doulia-kitchen-logo.png"
                  alt="Doulia Kitchen"
                  style={{ width: 62, height: 62, objectFit: "contain", display: "block" }}
                  onError={(e) => {
                    const t = e.currentTarget;
                    t.parentElement!.style.display = "none";
                    const fallback = t.parentElement!.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
              </div>
              <div style={{
                display: "none", width: 72, height: 72, background: "#1B2B4B", border: "2px solid rgba(255,255,255,0.3)",
                borderRadius: 6, color: "white", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700,
              }}>DK</div>
              {theme.showEnglishName && (
                <div style={{ fontSize: 9, fontWeight: 600, textAlign: "center", marginTop: 2, opacity: 0.8 }}>® {theme.englishName}</div>
              )}
            </div>
          </div>
          <hr style={{ border: "none", borderTop: `${theme.separatorWeight}px solid #1B2B4B`, margin: "0 -40px 10px" }} />
        </>
      );
    }

    // Standard header
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{companyName || "AMWALI"}</div>
            <div style={{ fontSize: 9, color: "#6B7280" }}>{[companyPhone, companyEmail].filter(Boolean).join(" | ")}</div>
            {companyAddress && <div style={{ fontSize: 9, color: "#6B7280" }}>{companyAddress}</div>}
            {taxNumber && <div style={{ fontSize: 9, color: "#6B7280" }}>الرقم الضريبي: {taxNumber}</div>}
          </div>
          {logoBase64 ? (
            <img src={logoBase64} alt="logo" style={{ height: 50, objectFit: "contain" }} />
          ) : (
            <div style={{ width: 50, height: 50, borderRadius: "50%", background: "#0D1B2E", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
              {(companyName || "A").charAt(0)}
            </div>
          )}
        </div>
        <hr style={{ border: "none", borderTop: "1.5px solid #111827", margin: "8px 0 16px" }} />
      </>
    );
  };

  // Themed recipient block
  const renderRecipient = () => {
    if (!doc.contact_name || doc.contact_name === "—") return null;
    
    if (isCustom) {
      return (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.primaryColor }}>
            حضرة السيد / {doc.contact_name} المحترم
          </div>
          {data.contact_address && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{data.contact_address}</div>}
        </div>
      );
    }

    return (
      <div style={{ marginBottom: 16, padding: "8px 12px", background: "#F9FAFB", borderRadius: 4 }}>
        <div style={{ fontSize: 10, color: "#6B7280" }}>مقدَّم إلى:</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.contact_name}</div>
        {data.contact_address && <div style={{ fontSize: 10, color: "#6B7280" }}>{data.contact_address}</div>}
      </div>
    );
  };

  // Themed footer
  const renderFooter = () => {
    if (isCustom && theme.footerStyle === "branded") {
      return (
        <div style={{ background: theme.primaryColor, color: "white", margin: "16px -40px -32px", padding: "8px 28px", display: "flex", justifyContent: "space-between", fontSize: 9 }}>
          <span>{companyName}</span>
          <span>{companyPhone || ""}</span>
          <span>تاريخ الطباعة: {new Date().toLocaleDateString("en-GB")}</span>
        </div>
      );
    }
    
    return (
      <>
        <hr style={{ border: "none", borderTop: "1px solid #E5E7EB", margin: "24px 0 8px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#9CA3AF" }}>
          <span>{companyName}</span>
          <span>تاريخ الطباعة: {new Date().toLocaleDateString("en-GB")}</span>
        </div>
      </>
    );
  };

  // Signature block
  const renderSignatures = () => {
    if (isCustom && theme.signatureStyle === "formal") {
      if (type === "CON") {
        return (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #9CA3AF", width: 160, paddingTop: 4, fontSize: 9, color: "#6B7280" }}>الطرف الأول / البائع</div>
              <div style={{ fontSize: 8, marginTop: 2 }}>{companyName}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #9CA3AF", width: 160, paddingTop: 4, fontSize: 9, color: "#6B7280" }}>الطرف الثاني / المشتري</div>
              <div style={{ fontSize: 8, marginTop: 2 }}>{doc.contact_name || "—"}</div>
            </div>
          </div>
        );
      }
      return (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #9CA3AF", width: 200, margin: "0 auto", paddingTop: 4, fontSize: 10, color: "#6B7280" }}>
            {theme.signatureText}
          </div>
          <div style={{ fontSize: 9, marginTop: 2, color: theme.primaryColor, fontWeight: 600 }}>{companyName}</div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30 }}>
        <div style={{ borderTop: "1px solid #9CA3AF", width: 140, paddingTop: 4, textAlign: "center", fontSize: 9, color: "#6B7280" }}>توقيع المستلم</div>
        <div style={{ borderTop: "1px solid #9CA3AF", width: 140, paddingTop: 4, textAlign: "center", fontSize: 9, color: "#6B7280" }}>ختم الشركة</div>
        <div style={{ borderTop: "1px solid #9CA3AF", width: 140, paddingTop: 4, textAlign: "center", fontSize: 9, color: "#6B7280" }}>المدير</div>
      </div>
    );
  };

  const innerContent = (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 no-print">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">معاينة {title}</span>
          {doc?.id && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> اضغط على أي فقرة للتعديل أو التحسين بالذكاء الاصطناعي
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {doc?.id && Object.keys(customText).length > 0 && (
            <Button size="sm" variant="ghost" onClick={handleResetEdits} title="استرجاع النص الافتراضي">
              <RotateCcw className="w-3.5 h-3.5 ml-1" /> استرجاع
            </Button>
          )}
          {doc?.id && dirty && (
            <Button size="sm" variant="default" onClick={handleSaveEdits} disabled={saving}>
              <Save className="w-3.5 h-3.5 ml-1" /> {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="w-3.5 h-3.5 ml-1" /> طباعة</Button>
          {!embedded && <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button>}
        </div>
      </div>

      {/* Preview */}
      <div className="overflow-y-auto p-6" style={{ background: "#E5E7EB", maxHeight: embedded ? "60vh" : "calc(95vh - 50px)" }}>
        <div
          ref={printRef}
          id="print-preview"
          style={{
            maxWidth: 780, margin: "0 auto", background: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)", borderRadius: 4,
            padding: "32px 40px", direction: "rtl", fontFamily: theme.fontFamily,
            fontSize: 11, color: theme.textColor, position: "relative", overflow: "hidden",
          }}
        >
          {/* Watermark — clipped to this container */}
          {isCustom && theme.showWatermark && (
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              opacity: 0.06, zIndex: 0, pointerEvents: "none",
              width: "60%", textAlign: "center",
            }}>
              <img src="/logos/doulia-kitchen-logo.png" alt="" style={{ width: "100%", maxWidth: 280, objectFit: "contain" }} />
            </div>
          )}

          <div style={{ position: "relative", zIndex: 1 }}>
            {renderHeader()}

            {/* Document info (for standard, show centered title) */}
            {(!isCustom || theme.headerStyle !== "premium") && (
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
                  رقم: {doc.document_number} &nbsp;|&nbsp; التاريخ: {doc.document_date}
                </div>
              </div>
            )}

            {/* For premium, show doc info separately */}
            {isCustom && theme.headerStyle === "premium" && (
              <div style={{ textAlign: "left", marginBottom: 16, fontSize: 11, color: "#6B7280" }}>
                رقم: {doc.document_number} &nbsp;|&nbsp; التاريخ: {doc.document_date}
              </div>
            )}

            {renderRecipient()}

            <div style={{ lineHeight: 1.8, fontSize: 11 }}>
              {renderBody()}
            </div>

            {data.notes && (
              <div style={{ marginTop: 16, padding: "8px 12px", background: theme.lightBg, borderRadius: 4, fontSize: 10 }}>
                <strong>ملاحظات:</strong>{" "}
                <Edit k="notes" fallback={data.notes} />
              </div>
            )}

            {renderSignatures()}
            {renderFooter()}
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="rounded-lg overflow-hidden border border-border">{innerContent}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] p-0 overflow-hidden">
        {innerContent}
      </DialogContent>
    </Dialog>
  );
};

// Helper to convert hex to RGB
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export default PrintTemplatePreview;

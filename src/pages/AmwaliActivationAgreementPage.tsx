import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { Printer, ArrowRight, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import amwaliLogo from "@/assets/amwali-logo-tall.png";

/**
 * اتفاقية تفعيل خدمة أموالي (ACT)
 * نموذج جاهز قابل للتعديل والطباعة بشكل سلس.
 * متاح فقط لـ: info.sayma20@gmail.com و super_admin
 * يتم حفظ المسودة تلقائياً في localStorage.
 */

const STORAGE_KEY = "amwali_activation_agreement_v1";
const COUNTER_KEY = "amwali_act_next_number";
const COUNTER_START = 13;
const ALLOWED_EMAIL = "info.sayma20@gmail.com";

const getNextContractNumber = (): { number: string; next: number } => {
  let next = COUNTER_START;
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!isNaN(parsed) && parsed >= COUNTER_START) next = parsed;
  } catch {}
  const year = new Date().getFullYear();
  return { number: `ACT-${year}-${String(next).padStart(3, "0")}`, next };
};

interface AgreementData {
  // الطرف الثاني (الزبون)
  customer_name: string;
  customer_id: string;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  users_count: string;
  branches_count: string;

  // مدة الاشتراك
  start_date: string;
  duration_months: string;

  // التطبيقات والخدمات
  apps: string;

  // المبالغ (شيكل إسرائيلي)
  annual_subscription: string;
  onetime_fee: string;
  onetime_description: string;

  // ملاحظات
  notes: string;
  contract_number: string;
  contract_date: string;
}

const DEFAULTS: AgreementData = {
  customer_name: "",
  customer_id: "",
  company_name: "",
  address: "",
  phone: "",
  email: "",
  users_count: "",
  branches_count: "",
  start_date: new Date().toISOString().split("T")[0],
  duration_months: "12",
  apps: "",
  annual_subscription: "",
  onetime_fee: "",
  onetime_description: "",
  notes: "",
  contract_number: "",
  contract_date: new Date().toISOString().split("T")[0],
};

const Field = ({
  value,
  onChange,
  placeholder,
  width = "200px",
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: string;
  type?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ width }}
    className="inline-block border-b border-dashed border-slate-400 bg-transparent px-1 text-slate-900 outline-none focus:border-solid focus:border-primary print:border-transparent print:bg-transparent"
  />
);

const AmwaliActivationAgreementPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, loading: permLoading } = usePermission("any");
  const [data, setData] = useState<AgreementData>(DEFAULTS);
  const printRef = useRef<HTMLDivElement>(null);

  // Restore from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = { ...DEFAULTS, ...JSON.parse(saved) };
        if (!parsed.contract_number || /-$/.test(parsed.contract_number)) {
          parsed.contract_number = getNextContractNumber().number;
        }
        setData(parsed);
      } else {
        setData({ ...DEFAULTS, contract_number: getNextContractNumber().number });
      }
    } catch {}
  }, []);

  // Auto-save (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  const update = <K extends keyof AgreementData>(k: K, v: AgreementData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const handleReset = () => {
    if (!confirm("هل تريد مسح كافة الحقول والبدء من جديد؟")) return;
    setData({ ...DEFAULTS, contract_number: getNextContractNumber().number });
    toast.success("تم مسح النموذج");
  };

  const handlePrint = () => {
    // Reserve the current number and advance counter for next agreement
    try {
      const { next } = getNextContractNumber();
      localStorage.setItem(COUNTER_KEY, String(next + 1));
    } catch {}
    window.print();
  };

  // Access guard
  const allowed = isSuperAdmin || user?.email?.toLowerCase() === ALLOWED_EMAIL;
  if (permLoading) {
    return <div className="p-8 text-center text-muted-foreground">جاري التحقق...</div>;
  }
  if (!allowed) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-lg text-destructive">هذه الصفحة متاحة فقط للمدير المخوّل.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/print-templates")}>
          عودة لنماذج الطباعة
        </Button>
      </div>
    );
  }

  const fmtMoney = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2 });
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 print:bg-white">
      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .print-page, .print-page * { visibility: visible !important; }
          .print-page {
            position: absolute !important;
            inset: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            padding: 0 !important;
          }
          .no-print { display: none !important; }
          input { border: none !important; background: transparent !important; padding: 0 !important; }
          textarea { border: none !important; background: transparent !important; padding: 0 !important; resize: none !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-[210mm] items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="ml-1 h-4 w-4" /> رجوع
          </Button>
          <div className="flex-1 text-sm font-semibold text-slate-700">
            اتفاقية تفعيل خدمة أموالي
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="ml-1 h-4 w-4" /> مسح
          </Button>
          <Button
            size="sm"
            onClick={() => {
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); toast.success("تم حفظ المسودة"); } catch {}
            }}
          >
            <Save className="ml-1 h-4 w-4" /> حفظ
          </Button>
          <Button size="sm" className="bg-primary" onClick={handlePrint}>
            <Printer className="ml-1 h-4 w-4" /> طباعة
          </Button>
        </div>
      </div>

      {/* Page */}
      <div
        ref={printRef}
        className="print-page mx-auto my-6 max-w-[210mm] bg-white px-12 py-10 text-[13px] leading-7 text-slate-900 shadow-lg"
        style={{ fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif" }}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b-2 border-[#0D1B2E] pb-4">
          <div className="text-right">
            <div className="text-xs text-slate-500">رقم الاتفاقية</div>
            <Field
              value={data.contract_number}
              onChange={(v) => update("contract_number", v)}
              width="180px"
            />
            <div className="mt-1 text-xs text-slate-500">التاريخ</div>
            <Field
              type="date"
              value={data.contract_date}
              onChange={(v) => update("contract_date", v)}
              width="150px"
            />
          </div>
          <img src={amwaliLogo} alt="أموالي" className="h-20 object-contain" />
        </div>

        {/* Title */}
        <h1 className="mb-6 text-center text-2xl font-bold text-[#0D1B2E]">
          اتفاقيـــة تفعيـــل خدمـــة أموالـــي
        </h1>

        {/* Parties */}
        <div className="mb-5 space-y-2">
          <div>
            <span className="font-bold text-[#0D1B2E]">• الفريق الأول: </span>
            شركة أموالي للحلول المحاسبية والإدارية، ممثلة بموظف المبيعات المخوّل.
          </div>
          <div>
            <span className="font-bold text-[#0D1B2E]">• الفريق الثاني: </span>
            السيد/ة{" "}
            <Field
              value={data.customer_name}
              onChange={(v) => update("customer_name", v)}
              placeholder="اسم الزبون كامل"
              width="220px"
            />{" "}
            بصفته الشخصية وممثلاً عن{" "}
            <Field
              value={data.company_name}
              onChange={(v) => update("company_name", v)}
              placeholder="اسم الشركة / المنشأة"
              width="220px"
            />{" "}
            هوية رقم{" "}
            <Field
              value={data.customer_id}
              onChange={(v) => update("customer_id", v)}
              placeholder="رقم الهوية"
              width="130px"
            />
            .
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
            <div>
              <span className="font-semibold">العنوان: </span>
              <Field value={data.address} onChange={(v) => update("address", v)} width="250px" />
            </div>
            <div>
              <span className="font-semibold">الهاتف: </span>
              <Field value={data.phone} onChange={(v) => update("phone", v)} width="180px" />
            </div>
            <div>
              <span className="font-semibold">البريد الإلكتروني: </span>
              <Field value={data.email} onChange={(v) => update("email", v)} width="240px" />
            </div>
            <div>
              <span className="font-semibold">عدد المستخدمين: </span>
              <Field value={data.users_count} onChange={(v) => update("users_count", v)} width="60px" />
              <span className="font-semibold mr-3">عدد الفروع: </span>
              <Field value={data.branches_count} onChange={(v) => update("branches_count", v)} width="60px" />
            </div>
          </div>
        </div>

        {/* Intro */}
        <div className="mb-5">
          <div className="font-bold text-[#0D1B2E]">مقدمة:</div>
          <p className="mt-1 text-justify">
            يرغب الفريق الثاني بالاشتراك في خدمات نظام أموالي المحاسبي والإداري المقدّم من
            الفريق الأول، وقد اتفق الطرفان وهما بكامل الأهلية القانونية على ما يلي وبما لا يتعارض
            مع <strong>اتفاقية ترخيص استخدام نظام أموالي</strong> الموقّعة بينهما.
          </p>
        </div>

        {/* Terms table */}
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            <Row n="أولاً">
              تعتبر هذه الاتفاقية مكمّلة لاتفاقية الترخيص ولا يتجزّأ منها، ويُقرأ معها نصاً وروحاً.
            </Row>

            <Row n="ثانياً">
              <div>
                <strong>التطبيقات والخدمات المتفق عليها</strong> (والتي يحق للفريق الثاني استخدامها ضمن
                هذه الاتفاقية):
              </div>
              <textarea
                value={data.apps}
                onChange={(e) => update("apps", e.target.value)}
                placeholder="مثال: المحاسبة العامة، نقاط البيع (POS)، إدارة المخزون، الموارد البشرية والرواتب، CRM ..."
                rows={4}
                className="mt-1 w-full rounded border border-dashed border-slate-400 bg-transparent p-2 text-[12.5px] outline-none focus:border-solid focus:border-primary print:border-transparent"
              />
            </Row>

            <Row n="ثالثاً">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <strong>قيمة الاشتراك السنوي:</strong>
                <Field
                  value={data.annual_subscription}
                  onChange={(v) => update("annual_subscription", v)}
                  placeholder="0.00"
                  width="120px"
                />
                <span>شيكل إسرائيلي (₪) — </span>
                <span className="text-slate-600">
                  {fmtMoney(data.annual_subscription)} ₪
                </span>
                <span>سنوياً، تُسدّد مقدّماً عند بداية كل سنة اشتراك.</span>
              </div>
            </Row>

            <Row n="رابعاً">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <strong>مبلغ يُدفع لمرة واحدة:</strong>
                <Field
                  value={data.onetime_fee}
                  onChange={(v) => update("onetime_fee", v)}
                  placeholder="0.00"
                  width="120px"
                />
                <span>شيكل إسرائيلي (₪) مقابل: </span>
                <Field
                  value={data.onetime_description}
                  onChange={(v) => update("onetime_description", v)}
                  placeholder="التركيب، التدريب الأولي، استيراد البيانات..."
                  width="280px"
                />
              </div>
            </Row>

            <Row n="خامساً">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <strong>مدة العقد:</strong>
                تبدأ هذه الاتفاقية بتاريخ{" "}
                <Field
                  type="date"
                  value={data.start_date}
                  onChange={(v) => update("start_date", v)}
                  width="150px"
                />{" "}
                وتستمر لمدة{" "}
                <Field
                  value={data.duration_months}
                  onChange={(v) => update("duration_months", v)}
                  width="50px"
                />{" "}
                شهراً من نفس التاريخ، وتُجدَّد تلقائياً ما لم يخطر أحد الفريقين الآخر خطياً قبل
                شهر واحد على الأقل من تاريخ الانتهاء.
              </div>
            </Row>

            <Row n="سادساً">
              يلتزم الفريق الأول بتقديم الدعم الفني للتطبيقات المتفق عليها أعلاه عبر الهاتف
              والبريد الإلكتروني وبرامج الاتصال عن بُعد، وضمن ساعات العمل المعتمدة، طوال
              فترة سريان هذه الاتفاقية.
            </Row>

            <Row n="سابعاً">
              تشمل قيمة الاشتراك السنوي التحديثات الدورية للنظام لذات الإصدارات المتفق
              عليها، ولا تشمل التعديلات أو التطويرات الخاصة التي يطلبها الفريق الثاني، والتي
              تخضع لتسعير مستقل وفق سياسة الفريق الأول.
            </Row>

            <Row n="ثامناً">
              <strong>الزيارات الميدانية:</strong> يحق للفريق الأول تقديم خدمة ميدانية بناءً
              على طلب الفريق الثاني وفق التعرفة المعتمدة لساعة العمل الإضافية، وذلك خارج
              نطاق الدعم عن بُعد الذي يشمله هذا الاشتراك.
            </Row>

            <Row n="تاسعاً">
              <strong>إضافة مستخدمين أو فروع:</strong> أي زيادة في عدد المستخدمين أو الفروع
              المتفق عليها أعلاه تُسعَّر بشكل منفصل ويُضاف إلى قيمة الاشتراك السنوي ابتداءً
              من دورة الاشتراك التالية.
            </Row>

            <Row n="عاشراً">
              يلتزم الفريق الثاني بحفظ نسخ احتياطية دورية لبياناته، ولا يتحمل الفريق الأول
              أي مسؤولية عن فقدان البيانات الناتج عن عوامل خارجة عن نطاق خدمته (الانقطاع
              الكهربائي، الفيروسات، الاختراق، أو سوء الاستخدام).
            </Row>

            <Row n="حادي عشر">
              في حال حدوث خلاف أو نزاع حول أي بند من بنود هذه الاتفاقية، يكون العنوان
              المذكور أعلاه هو عنوان التبليغ لكلا الفريقين، وتكون محاكم فلسطين هي
              المختصة بالنظر في هذا الخلاف.
            </Row>

            <Row n="ملاحظات">
              <textarea
                value={data.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="بنود إضافية أو ملاحظات خاصة بالاتفاقية..."
                rows={3}
                className="w-full rounded border border-dashed border-slate-400 bg-transparent p-2 text-[12.5px] outline-none focus:border-solid focus:border-primary print:border-transparent"
              />
            </Row>
          </tbody>
        </table>

        {/* Closing */}
        <p className="mt-4 text-justify">
          إن بنود هذه الاتفاقية قرئت وأُفهمت لفريقيها وتم التوقيع عليها بعون الله تعالى في
          نسختين، بيد كل فريق نسخة.
        </p>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-12">
          <div className="text-center">
            <div className="font-bold text-[#0D1B2E]">عن الفريق الأول</div>
            <div className="mt-1 text-xs text-slate-500">(شركة أموالي)</div>
            <div className="mt-16 border-t border-slate-400 pt-1 text-xs">الاسم والتوقيع</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-[#0D1B2E]">عن الفريق الثاني</div>
            <div className="mt-1 text-xs text-slate-500">
              ({data.customer_name || "اسم الزبون"})
            </div>
            <div className="mt-16 border-t border-slate-400 pt-1 text-xs">الاسم والتوقيع</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-2 text-center text-[10px] text-slate-500">
          أموالي — حلول محاسبية وإدارية ذكية · www.amwali.app
        </div>
      </div>
    </div>
  );
};

const Row = ({ n, children }: { n: string; children: React.ReactNode }) => (
  <tr className="align-top">
    <td className="w-24 border border-slate-300 bg-slate-50 px-2 py-2 text-center font-bold text-[#0D1B2E]">
      {n}
    </td>
    <td className="border border-slate-300 px-3 py-2">{children}</td>
  </tr>
);

export default AmwaliActivationAgreementPage;
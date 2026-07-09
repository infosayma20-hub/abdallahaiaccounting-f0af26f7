import { forwardRef } from "react";
import amwaliLogo from "@/assets/amwali-logo-tall.png";
import { CalcTotals, currencySymbol, fmtMoney } from "@/lib/amwali-quotations/calc";

export interface PrintViewProps {
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  currency: string;
  customer: { name?: string; company?: string; phone?: string; email?: string; address?: string };
  intro: string;
  terms: string;
  supportPolicy?: string;
  footer: string;
  colors: { primary: string; accent: string };
  totals: CalcTotals;
  taxRate: number;
  hasSupport: boolean;
}

const PrintView = forwardRef<HTMLDivElement, PrintViewProps>((props, ref) => {
  const { quoteNumber, quoteDate, validUntil, currency, customer, intro, terms, supportPolicy, footer, colors, totals, taxRate, hasSupport } = props;
  const sym = currencySymbol(currency);
  const firstYear = totals.grandTotal;

  return (
    <div
      ref={ref}
      dir="rtl"
      className="print-page mx-auto bg-white px-10 py-8 text-[12.5px] leading-6 text-slate-900"
      style={{ fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif", maxWidth: "210mm" }}
    >
      {/* Header */}
      <div className="mb-5 grid grid-cols-3 items-center border-b-2 pb-3" style={{ borderColor: colors.primary }}>
        <div className="text-left text-[11px]">
          <div className="text-slate-500">التاريخ</div>
          <div className="font-semibold">{quoteDate || "-"}</div>
          <div className="mt-1 text-slate-500">صالح حتى</div>
          <div className="font-semibold">{validUntil || "-"}</div>
        </div>
        <div className="flex justify-center">
          <img src={amwaliLogo} alt="أموالي" className="h-16 object-contain" />
        </div>
        <div className="text-right text-[11px]">
          <div className="text-slate-500">رقم عرض السعر</div>
          <div className="font-bold" style={{ color: colors.primary }}>{quoteNumber}</div>
          <div className="mt-1 text-slate-500">العملة</div>
          <div className="font-semibold">{currency}</div>
        </div>
      </div>

      <h1 className="mb-4 text-center text-[22px] font-bold" style={{ color: colors.primary }}>
        عــرض ســـعر خدمـــات أموالـــي
      </h1>

      {/* Customer */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 font-bold" style={{ color: colors.primary }}>مقدم إلى:</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[12px]">
          <div><span className="font-semibold">الاسم: </span>{customer.name || "-"}</div>
          <div><span className="font-semibold">الشركة / المنشأة: </span>{customer.company || "-"}</div>
          <div><span className="font-semibold">الهاتف: </span>{customer.phone || "-"}</div>
          <div><span className="font-semibold">البريد الإلكتروني: </span>{customer.email || "-"}</div>
          <div className="col-span-2"><span className="font-semibold">العنوان: </span>{customer.address || "-"}</div>
        </div>
      </div>

      {intro && <p className="mb-3 text-justify text-[12px]">{intro}</p>}

      {/* Items table */}
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr style={{ background: colors.primary, color: "white" }}>
            <th className="border px-1 py-1.5 text-center" style={{ borderColor: colors.primary, width: 24 }}>#</th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: colors.primary }}>البند / الخدمة</th>
            <th className="border px-1 py-1.5 text-center" style={{ borderColor: colors.primary, width: 44 }}>الكمية</th>
            <th className="border px-1 py-1.5 text-center" style={{ borderColor: colors.primary, width: 70 }}>سعر مرة واحدة</th>
            <th className="border px-1 py-1.5 text-center" style={{ borderColor: colors.primary, width: 70 }}>السعر السنوي</th>
            <th className="border px-1 py-1.5 text-center" style={{ borderColor: colors.primary, width: 80 }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {totals.lines.map((r, i) => (
            <tr key={r.id} className="align-top">
              <td className="border border-slate-300 px-1 py-1 text-center text-slate-500">{i + 1}</td>
              <td className="border border-slate-300 px-2 py-1">
                <div className="font-semibold">{r.name}</div>
                {r.description && <div className="text-[10.5px] text-slate-500">{r.description}</div>}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center">{r.qty}</td>
              <td className="border border-slate-300 px-1 py-1 text-center">{fmtMoney(r.onetime_price)} {sym}</td>
              <td className="border border-slate-300 px-1 py-1 text-center">{fmtMoney(r.annual_price)} {sym}</td>
              <td className="border border-slate-300 px-1 py-1 text-center font-semibold" style={{ color: colors.primary }}>
                {fmtMoney(r.lineTotal)} {sym}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="border border-slate-300 px-2 py-1 text-left font-semibold">إجمالي «لمرة واحدة»</td>
            <td className="border border-slate-300 px-1 py-1 text-center font-semibold">{fmtMoney(totals.subtotalOnetime)} {sym}</td>
          </tr>
          <tr>
            <td colSpan={5} className="border border-slate-300 px-2 py-1 text-left font-semibold">إجمالي الاشتراك السنوي</td>
            <td className="border border-slate-300 px-1 py-1 text-center font-semibold">{fmtMoney(totals.subtotalAnnual)} {sym}</td>
          </tr>
          {totals.discount > 0 && (
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-1 text-left">الخصم</td>
              <td className="border border-slate-300 px-1 py-1 text-center">- {fmtMoney(totals.discount)} {sym}</td>
            </tr>
          )}
          {taxRate > 0 && (
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-1 text-left">الضريبة ({taxRate}%)</td>
              <td className="border border-slate-300 px-1 py-1 text-center">{fmtMoney(totals.taxAmount)} {sym}</td>
            </tr>
          )}
          <tr style={{ background: colors.primary, color: "white" }}>
            <td colSpan={5} className="border px-2 py-2 text-left text-[13px] font-bold" style={{ borderColor: colors.primary }}>
              الإجمالي المستحق للسنة الأولى (تفعيل لمرة واحدة + الاشتراك السنوي الأول)
            </td>
            <td className="border px-1 py-2 text-center text-[14px] font-bold" style={{ borderColor: colors.primary }}>
              {fmtMoney(firstYear)} {sym}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Terms */}
      {terms && (
        <div className="mt-4 avoid-break">
          <div className="mb-1 font-bold" style={{ color: colors.primary }}>الشروط والملاحظات:</div>
          <div className="whitespace-pre-line text-[11.5px] leading-6">{terms}</div>
        </div>
      )}

      {hasSupport && supportPolicy && (
        <div className="mt-4 avoid-break">
          <div className="whitespace-pre-line text-[11.5px] leading-6">{supportPolicy}</div>
        </div>
      )}

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-2 gap-10 avoid-break">
        <div className="text-center">
          <div className="font-bold" style={{ color: colors.primary }}>عن شركة أموالي</div>
          <div className="text-[10.5px] text-slate-500">(ممثل المبيعات)</div>
          <div className="mt-12 border-t border-slate-400 pt-1 text-[10.5px]">الاسم والتوقيع</div>
        </div>
        <div className="text-center">
          <div className="font-bold" style={{ color: colors.primary }}>القبول من الزبون</div>
          <div className="text-[10.5px] text-slate-500">({customer.name || "اسم الزبون"})</div>
          <div className="mt-12 border-t border-slate-400 pt-1 text-[10.5px]">الاسم والتوقيع</div>
        </div>
      </div>

      <div className="mt-6 border-t pt-2 text-center text-[10px] text-slate-500">{footer}</div>
    </div>
  );
});

PrintView.displayName = "PrintView";
export default PrintView;
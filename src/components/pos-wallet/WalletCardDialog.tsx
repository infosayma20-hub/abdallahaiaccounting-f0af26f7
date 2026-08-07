/** WalletCardDialog — بطاقة محفظة الزبون مع QR قابلة للطباعة. */
import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DynamicsDialog, DynamicsSection } from "@/components/ui/dynamics-dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactName?: string;
  phone?: string | null;
  cardCode?: string | null;
  balance?: number;
  companyName?: string;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletCardDialog({
  open, onOpenChange, contactName, phone, cardCode, balance = 0, companyName = "",
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const print = () => {
    const html = cardRef.current?.outerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><title>بطاقة محفظة</title>
      <style>
        body{font-family:system-ui,'Segoe UI',Tahoma,sans-serif;margin:0;padding:16px;display:flex;justify-content:center}
        .wcard{width:320px;border:1px solid #d5dbe3;border-radius:12px;overflow:hidden}
        .wcard .hd{background:#0D1B2E;color:#fff;padding:10px 14px;font-weight:700;font-size:13px}
        .wcard .bd{padding:14px;text-align:center}
        .wcard .nm{font-weight:700;font-size:14px;margin-bottom:2px}
        .wcard .ph{font-size:11px;color:#64748b}
        .wcard .cd{font-family:ui-monospace,monospace;letter-spacing:2px;font-size:13px;margin-top:8px}
        .wcard .bl{font-size:12px;color:#0f766e;margin-top:4px}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 350);
  };

  return (
    <DynamicsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`بطاقة المحفظة — ${contactName || "زبون"}`}
      description="امسح الرمز من نقطة البيع لفتح محفظة الزبون مباشرة."
      className="max-w-lg"
      facts={[
        { label: "رقم البطاقة", value: cardCode || "—" },
        { label: "الرصيد", value: fmt(balance), tone: "positive" },
      ]}
      maxBodyHeight="60vh"
    >
      <DynamicsSection title="البطاقة">
        <div className="flex justify-center p-4">
          <div ref={cardRef} className="wcard w-[320px] overflow-hidden rounded-xl border border-border">
            <div className="hd bg-[#0D1B2E] px-3.5 py-2.5 text-[13px] font-bold text-white">
              {companyName || "بطاقة محفظة"}
            </div>
            <div className="bd bg-card p-4 text-center">
              <div className="nm text-sm font-bold">{contactName || "—"}</div>
              <div className="ph text-[11px] text-muted-foreground">{phone || ""}</div>
              <div className="my-3 flex justify-center">
                {cardCode ? <QRCodeSVG value={cardCode} size={140} level="M" /> : null}
              </div>
              <div className="cd font-mono text-[13px] tracking-[2px]">{cardCode || "—"}</div>
              <div className="bl text-[12px] text-emerald-700">الرصيد: {fmt(balance)} ₪</div>
            </div>
          </div>
        </div>
      </DynamicsSection>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>إغلاق</Button>
        <Button size="sm" onClick={print} disabled={!cardCode}>
          <Printer className="ml-1.5 h-3.5 w-3.5" /> طباعة البطاقة
        </Button>
      </div>
    </DynamicsDialog>
  );
}

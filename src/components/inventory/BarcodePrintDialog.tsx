import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sell_price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: Product | null;
}

/**
 * طباعة ملصقات باركود للمنتج (CODE128).
 * - يعرض معاينة حية
 * - يدعم تحديد عدد الملصقات
 * - يفتح نافذة طباعة منفصلة
 */
export default function BarcodePrintDialog({ open, onOpenChange, product }: Props) {
  const [count, setCount] = useState(12);
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);
  const previewRef = useRef<SVGSVGElement>(null);

  const code = product?.barcode || product?.sku || product?.id || "";

  // Render preview
  useEffect(() => {
    if (!open || !code || !previewRef.current) return;
    try {
      JsBarcode(previewRef.current, code, {
        format: "CODE128",
        width: 1.8,
        height: 50,
        displayValue: true,
        fontSize: 12,
        margin: 4,
      });
    } catch (e) {
      console.warn("Barcode render failed:", e);
    }
  }, [open, code]);

  const handlePrint = () => {
    if (!product || !code) return;

    // ولّد SVG لكل ملصق باستخدام JsBarcode في DOM مؤقت
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      try {
        JsBarcode(tempSvg, code, {
          format: "CODE128",
          width: 1.6,
          height: 40,
          displayValue: true,
          fontSize: 11,
          margin: 2,
        });
      } catch {
        continue;
      }
      const svgStr = new XMLSerializer().serializeToString(tempSvg);
      labels.push(`
        <div class="label">
          ${showName ? `<div class="name">${escapeHtml(product.name)}</div>` : ""}
          ${svgStr}
          ${showPrice ? `<div class="price">₪ ${product.sell_price.toFixed(2)}</div>` : ""}
        </div>
      `);
    }

    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>طباعة باركود — ${escapeHtml(product.name)}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif;
      margin: 0; padding: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4mm;
    }
    .label {
      border: 1px dashed #ccc;
      padding: 3mm;
      text-align: center;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 28mm;
    }
    .name {
      font-size: 10px;
      font-weight: 600;
      margin-bottom: 2px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price {
      font-size: 11px;
      font-weight: 700;
      margin-top: 2px;
      color: #0d1b2e;
    }
    svg { max-width: 100%; height: auto; }
    @media print { .label { border: none; } }
  </style>
</head>
<body>
  <div class="grid">
    ${labels.join("")}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 200);
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            طباعة باركود — {product?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Preview */}
          <div className="bg-muted/30 rounded-xl p-4 flex items-center justify-center border border-border">
            {code ? (
              <svg ref={previewRef} />
            ) : (
              <p className="text-xs text-muted-foreground">لا يوجد باركود/SKU لهذا المنتج</p>
            )}
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">عدد الملصقات</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="rounded-lg h-9"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الكود المُستخدم</Label>
              <div className="h-9 px-3 rounded-lg bg-muted/50 border border-border flex items-center text-xs font-mono" dir="ltr">
                {code || "—"}
              </div>
            </div>
          </div>

          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
              اسم المنتج
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
              السعر
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 ml-1" /> إلغاء
            </Button>
            <Button className="flex-1 rounded-lg" onClick={handlePrint} disabled={!code}>
              <Printer className="h-4 w-4 ml-1" /> طباعة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

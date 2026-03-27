import { useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { COST_CATEGORIES, PHASES, CATEGORY_GL_MAP } from "./WorkshopCostModal";

interface CostItem {
  id: string; category?: string; cost_type: string; amount: number; phase?: string;
  quantity?: number; unit?: string; unit_price?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workshopName: string;
  customerName: string;
  budget: number;
  costs: CostItem[];
  totalPaid: number;
}

export default function WorkshopCostReport({ open, onOpenChange, workshopName, customerName, budget, costs, totalPaid }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const totalCosts = useMemo(() => costs.reduce((s, c) => s + c.amount, 0), [costs]);
  const profit = budget - totalCosts;
  const profitPct = budget > 0 ? (profit / budget * 100) : 0;

  // By category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    costs.forEach(c => {
      const cat = c.category || c.cost_type || "other";
      map[cat] = (map[cat] || 0) + c.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
      const info = COST_CATEGORIES.find(cc => cc.value === cat) || { icon: "📦", label: cat };
      return { cat, label: info.label, icon: info.icon, amount };
    });
  }, [costs]);

  // Group into material/labor/transport/other
  const materialCats = ["wood_natural", "mdf", "glass", "paint", "varnish", "marble", "hardware", "countertop", "adhesive", "veneer", "fittings", "wood", "crystal"];
  const laborCats = ["labor"];
  const transportCats = ["transport"];

  const grouped = useMemo(() => {
    let materials = 0, labor = 0, transport = 0, other = 0;
    costs.forEach(c => {
      const cat = c.category || c.cost_type || "other";
      if (materialCats.includes(cat)) materials += c.amount;
      else if (laborCats.includes(cat)) labor += c.amount;
      else if (transportCats.includes(cat)) transport += c.amount;
      else other += c.amount;
    });
    return [
      { label: "المواد الخام", amount: materials },
      { label: "العمالة", amount: labor },
      { label: "النقل", amount: transport },
      { label: "أخرى", amount: other },
    ].filter(g => g.amount > 0);
  }, [costs]);

  // By phase
  const byPhase = useMemo(() => {
    const map: Record<string, number> = {};
    costs.forEach(c => {
      const ph = c.phase || "preparation";
      map[ph] = (map[ph] || 0) + c.amount;
    });
    return PHASES.map(p => ({ label: p.label, amount: map[p.value] || 0 })).filter(p => p.amount > 0);
  }, [costs]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>تقرير تكلفة - ${workshopName}</title>
      <style>body{font-family:Tajawal,Arial,sans-serif;padding:40px;color:#1B3A5C}
      table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px 12px;border:1px solid #ddd;text-align:right}
      th{background:#1B3A5C;color:#fff}.total-row{font-weight:bold;background:#f9f9f9}
      h1{color:#1B3A5C;border-bottom:3px solid #4A9EE8;padding-bottom:8px}
      .profit{color:${profit >= 0 ? '#16a34a' : '#dc2626'};font-size:24px;font-weight:bold}</style></head>
      <body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>📄 تقرير تكلفة الورشة</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="space-y-4 py-2">
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">{workshopName}</h2>
            <p className="text-sm text-muted-foreground">الزبون: {customerName}</p>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">إجمالي عقد البيع</span>
              <span className="font-bold text-foreground">{budget.toLocaleString()} ₪</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">إجمالي التكاليف</span>
              <span className="font-bold text-destructive">{totalCosts.toLocaleString()} ₪</span>
            </div>
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-sm">
              <span className="font-bold text-foreground">هامش الربح الإجمالي</span>
              <span className={`text-xl font-bold ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {profit.toLocaleString()} ₪
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">نسبة الربح</span>
              <span className={`font-bold ${profitPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>{profitPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* Grouped breakdown */}
          {grouped.length > 0 && (
            <div className="rounded-xl border border-border p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground">تفصيل التكاليف</h3>
              {grouped.map(g => (
                <div key={g.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{g.label}</span>
                  <span className="font-medium text-foreground tabular-nums">{g.amount.toLocaleString()} ₪</span>
                </div>
              ))}
            </div>
          )}

          {/* By category */}
          {byCategory.length > 0 && (
            <div className="rounded-xl border border-border p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground">📊 توزيع حسب النوع</h3>
              {byCategory.map(c => {
                const pct = totalCosts > 0 ? (c.amount / totalCosts * 100) : 0;
                return (
                  <div key={c.cat} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span>{c.icon} {c.label}</span>
                      <span className="tabular-nums font-medium">{c.amount.toLocaleString()} ₪ ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* By phase */}
          {byPhase.length > 0 && (
            <div className="rounded-xl border border-border p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground">🏗️ التكاليف حسب المرحلة</h3>
              <div className="flex flex-wrap gap-2">
                {byPhase.map(p => (
                  <div key={p.label} className="rounded-lg bg-accent/5 border border-border px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground">{p.label}</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{p.amount.toLocaleString()} ₪</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> طباعة
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
            <Download className="h-4 w-4" /> تصدير PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

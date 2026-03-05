import { AlertTriangle } from "lucide-react";

interface InventoryItem {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  productId: string | null;
  currentStock: number;
  minQuantity: number;
  buyPrice: number;
  profit: number;
  lowStock: boolean;
}

interface Props {
  inventoryReport: InventoryItem[];
}

const POSInventoryReport = ({ inventoryReport }: Props) => {
  const alerts = inventoryReport.filter(p => p.lowStock);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1A2332]">المخزون والمبيعات</h3>
          <span className="text-xs text-[#637381]">{inventoryReport.length} منتج</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المنتج</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">مبيعات</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المخزون</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">التكلفة</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الربح</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الهامش</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {inventoryReport.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#637381] py-12 text-sm">لا توجد بيانات</td></tr>
            )}
            {inventoryReport.map(p => (
              <tr key={p.name} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-4 py-3 text-right text-sm text-[#1A2332] font-medium">{p.name}</td>
                <td className="px-4 py-3 text-center text-sm text-[#637381] font-mono">{p.qty}</td>
                <td className="px-4 py-3 text-center text-sm font-mono">
                  <span className={p.lowStock ? "text-[#C53030] font-bold" : "text-[#637381]"}>
                    {p.currentStock}
                  </span>
                  {p.lowStock && <span className="inline-block w-2 h-2 rounded-full bg-[#C53030] mr-1.5 align-middle" />}
                </td>
                <td className="px-4 py-3 text-left text-sm font-mono text-[#637381]">₪{p.cost.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold"
                  style={{ color: p.profit >= 0 ? "#188038" : "#C53030" }}>
                  ₪{p.profit.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-left text-sm font-mono text-[#637381]">
                  {p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : "0"}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {alerts.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#C53030]" />
            <h3 className="text-sm font-semibold text-[#C53030]">تنبيهات المخزون</h3>
          </div>
          <div className="p-4 space-y-2">
            {alerts.map(p => (
              <div key={p.name} className="flex items-center justify-between p-3 bg-[#FEF2F2] rounded-md border border-[#FECACA]">
                <span className="text-sm text-[#1A2332] font-medium">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-white bg-[#C53030] px-2 py-0.5 rounded">
                    باقي {p.currentStock} {p.currentStock <= 5 ? "قطع فقط" : "قطعة"}
                  </span>
                  <span className="text-xs text-[#637381]">الحد الأدنى: {p.minQuantity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default POSInventoryReport;

export interface KPICard {
  label: string;
  value: string;
}

export function getPOSKPIs(reportKey: string, data: any[]): KPICard[] {
  if (!data.length) return [];
  switch (reportKey) {
    case "pos-daily-sales":
    case "pos-invoice-register": {
      const total = data.reduce((s, r) => s + (r.total || 0), 0);
      const disc = data.reduce((s, r) => s + (r.discount || 0), 0);
      return [
        { label: "عدد الفواتير", value: String(data.length) },
        { label: "إجمالي المبيعات", value: `₪${total.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "إجمالي الخصومات", value: `₪${disc.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "متوسط الفاتورة", value: `₪${(total / data.length).toLocaleString("en", { minimumFractionDigits: 2 })}` },
      ];
    }
    case "pos-cashier-performance": {
      const totalSales = data.reduce((s, r) => s + (r.total || 0), 0);
      const totalOrders = data.reduce((s, r) => s + (r.count || 0), 0);
      return [
        { label: "عدد الكاشيرين", value: String(data.length) },
        { label: "إجمالي المبيعات", value: `₪${totalSales.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "إجمالي الطلبات", value: String(totalOrders) },
        { label: "المتوسط لكل كاشير", value: `₪${(totalSales / data.length).toLocaleString("en", { minimumFractionDigits: 2 })}` },
      ];
    }
    case "pos-sales-by-category": {
      const totalRev = data.reduce((s, r) => s + (r.revenue || 0), 0);
      const totalProfit = data.reduce((s, r) => s + (r.profit || 0), 0);
      const totalQty = data.reduce((s, r) => s + (r.qty || 0), 0);
      return [
        { label: "عدد الأصناف", value: String(data.length) },
        { label: "إجمالي المبيعات", value: `₪${totalRev.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "إجمالي الربح", value: `₪${totalProfit.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "إجمالي الكميات", value: String(totalQty) },
      ];
    }
    case "pos-payment-methods": {
      const totalAmt = data.reduce((s, r) => s + (r.total || 0), 0);
      const totalTx = data.reduce((s, r) => s + (r.count || 0), 0);
      return [
        { label: "طرق الدفع", value: String(data.length) },
        { label: "إجمالي المبلغ", value: `₪${totalAmt.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "عدد المعاملات", value: String(totalTx) },
        { label: "المتوسط", value: `₪${(totalTx > 0 ? totalAmt / totalTx : 0).toLocaleString("en", { minimumFractionDigits: 2 })}` },
      ];
    }
    case "pos-product-movement": {
      const soldQty = data.reduce((s, r) => s + (r.sold_qty || 0), 0);
      const retQty = data.reduce((s, r) => s + (r.return_qty || 0), 0);
      const rev = data.reduce((s, r) => s + (r.revenue || 0), 0);
      return [
        { label: "عدد الأصناف", value: String(data.length) },
        { label: "إجمالي المبيعات", value: `₪${rev.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "الكميات المباعة", value: String(soldQty) },
        { label: "الكميات المرتجعة", value: String(retQty) },
      ];
    }
    case "pos-invoice-timing": {
      const avgDur = data.reduce((s, r) => s + (r.duration_min || 0), 0) / data.length;
      const maxDur = Math.max(...data.map(r => r.duration_min || 0));
      return [
        { label: "عدد الفواتير", value: String(data.length) },
        { label: "متوسط مدة الخدمة", value: `${avgDur.toFixed(1)} دقيقة` },
        { label: "أطول خدمة", value: `${maxDur} دقيقة` },
        { label: "إجمالي المبيعات", value: `₪${data.reduce((s, r) => s + (r.total || 0), 0).toLocaleString("en", { minimumFractionDigits: 2 })}` },
      ];
    }
    case "pos-credit-sales": {
      const totalCredit = data.reduce((s, r) => s + (r.credit_total || 0), 0);
      const totalOrd = data.reduce((s, r) => s + (r.orders || 0), 0);
      return [
        { label: "عدد العملاء", value: String(data.length) },
        { label: "إجمالي المديونيات", value: `₪${totalCredit.toLocaleString("en", { minimumFractionDigits: 2 })}` },
        { label: "عدد الفواتير", value: String(totalOrd) },
      ];
    }
    default:
      return [];
  }
}

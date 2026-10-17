/** وحدة تعبئة للصنف (كرتونة، علبة...) = عدد من الوحدة الأساسية بسعر وباركود خاص. */
export type PackUnit = { id: string; product_id?: string; name: string; factor: number; price: number | null; barcode: string | null };

/** تحويل كمية معدودة بالوحدة المختارة إلى الوحدة الأساسية (3 كراتين × 12 = 36). */
export function toBaseQty(qty: number, factor: number | null | undefined): number {
  const f = Number(factor) > 0 ? Number(factor) : 1;
  return Math.round(qty * f * 1000) / 1000;
}

/** اسم سطر البيع للوحدة — يُستخدم أيضًا لربط المرتجع بالسطر الأصلي. */
export const packLineName = (productName: string, unitName: string) => `${productName} — ${unitName}`;

/** سطر سلة لوحدة تعبئة: السعر الخاص، والتكلفة = تكلفة القطعة × عدد القطع. */
export function packAsProduct<T extends { name: string; sell_price: number; buy_price: number; unit: string }>(product: T, pack: PackUnit): T {
  const price = pack.price ?? product.sell_price * pack.factor;
  return {
    ...product,
    name: packLineName(product.name, pack.name),
    sell_price: Number(price) || 0,
    buy_price: (Number(product.buy_price) || 0) * pack.factor,
    unit: pack.name,
  };
}

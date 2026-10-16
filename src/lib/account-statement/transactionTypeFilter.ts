export function txTypeMatchesFilter(transactionType: string, filter: string): boolean {
  if (filter === "all") return true;
  const type = (transactionType || "").toLowerCase();
  const isReturn = type.includes("return") || type.includes("مردود") || type.includes("مرتجع");
  if (filter === "return") return isReturn;
  if (filter === "journal") return type.includes("journal") || type.includes("قيد") || type.includes("salary") || type === "manual";
  if (filter === "sale") return !isReturn && (type.includes("sale") || type.includes("فاتورة"));
  if (filter === "receipt") return type.includes("receipt") || type.includes("قبض");
  if (filter === "payment") return type.includes("payment") || type.includes("صرف");
  if (filter === "purchase") return !isReturn && (type.includes("purchase") || type.includes("مشتريات"));
  return type.includes(filter);
}
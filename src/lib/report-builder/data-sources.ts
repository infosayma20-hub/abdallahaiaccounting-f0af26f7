// تعريف مصادر البيانات والأعمدة المتاحة لـ Report Builder
import { LucideIcon, ShoppingCart, ShoppingBag, Package } from "lucide-react";

export type FieldType = "text" | "number" | "currency" | "date" | "percent" | "badge";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  filterType?: "text" | "select" | "date-range" | "number-range";
  groupable?: boolean;
  aggregatable?: boolean;
  defaultVisible?: boolean;
}

export interface DataSourceDef {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  table: string;
  selectQuery: string;
  dateColumn: string;
  /** Optional fixed where-clause baked into the source (e.g. invoice_type='sale'). */
  fixedFilter?: { column: string; value: string };
  statusValues?: string[];
  fields: FieldDef[];
  contactFilter?: { key: string; column: string; type: "customer" | "supplier" };
}

export const DATA_SOURCES: DataSourceDef[] = [
  {
    key: "sales",
    label: "المبيعات",
    description: "فواتير المبيعات",
    icon: ShoppingCart,
    color: "#10b981",
    table: "invoices",
    selectQuery:
      "id, invoice_number, invoice_date, contact_name, total_amount, paid_amount, status, payment_status, payment_method, notes, contact_id, invoice_type",
    dateColumn: "invoice_date",
    fixedFilter: { column: "invoice_type", value: "sale" },
    statusValues: ["paid", "partial", "unpaid", "overdue"],
    contactFilter: { key: "contact_id", column: "contact_id", type: "customer" },
    fields: [
      { key: "invoice_number", label: "رقم الفاتورة", type: "text", filterType: "text", defaultVisible: true },
      { key: "invoice_date", label: "التاريخ", type: "date", filterType: "date-range", groupable: true, defaultVisible: true },
      { key: "contact_name", label: "العميل", type: "text", filterType: "text", groupable: true, defaultVisible: true },
      { key: "total_amount", label: "الإجمالي", type: "currency", aggregatable: true, defaultVisible: true },
      { key: "paid_amount", label: "المدفوع", type: "currency", aggregatable: true, defaultVisible: false },
      { key: "payment_status", label: "حالة الدفع", type: "badge", filterType: "select", defaultVisible: true },
      { key: "payment_method", label: "طريقة الدفع", type: "badge", filterType: "select", defaultVisible: false },
      { key: "notes", label: "ملاحظات", type: "text", defaultVisible: false },
    ],
  },
  {
    key: "purchases",
    label: "المشتريات",
    description: "فواتير المشتريات",
    icon: ShoppingBag,
    color: "#f59e0b",
    table: "invoices",
    selectQuery:
      "id, invoice_number, invoice_date, contact_name, total_amount, paid_amount, status, payment_status, payment_method, notes, contact_id, invoice_type",
    dateColumn: "invoice_date",
    fixedFilter: { column: "invoice_type", value: "purchase" },
    statusValues: ["paid", "partial", "unpaid"],
    contactFilter: { key: "contact_id", column: "contact_id", type: "supplier" },
    fields: [
      { key: "invoice_number", label: "رقم الفاتورة", type: "text", filterType: "text", defaultVisible: true },
      { key: "invoice_date", label: "التاريخ", type: "date", filterType: "date-range", groupable: true, defaultVisible: true },
      { key: "contact_name", label: "المورد", type: "text", filterType: "text", groupable: true, defaultVisible: true },
      { key: "total_amount", label: "الإجمالي", type: "currency", aggregatable: true, defaultVisible: true },
      { key: "paid_amount", label: "المدفوع", type: "currency", aggregatable: true, defaultVisible: false },
      { key: "payment_status", label: "حالة الدفع", type: "badge", filterType: "select", defaultVisible: true },
      { key: "payment_method", label: "طريقة الدفع", type: "badge", filterType: "select", defaultVisible: false },
      { key: "notes", label: "ملاحظات", type: "text", defaultVisible: false },
    ],
  },
  {
    key: "inventory",
    label: "المخزون",
    description: "أصناف وكميات المخزون",
    icon: Package,
    color: "#8b5cf6",
    table: "products",
    selectQuery: "id, name, category, sku, buy_price, sell_price, quantity, min_quantity, unit",
    dateColumn: "created_at",
    fields: [
      { key: "name", label: "اسم الصنف", type: "text", filterType: "text", defaultVisible: true },
      { key: "sku", label: "الكود", type: "text", filterType: "text", defaultVisible: false },
      { key: "category", label: "الفئة", type: "badge", filterType: "select", groupable: true, defaultVisible: true },
      { key: "quantity", label: "الكمية", type: "number", aggregatable: true, defaultVisible: true },
      { key: "min_quantity", label: "الحد الأدنى", type: "number", defaultVisible: false },
      { key: "buy_price", label: "سعر التكلفة", type: "currency", defaultVisible: true },
      { key: "sell_price", label: "سعر البيع", type: "currency", defaultVisible: false },
      { key: "unit", label: "الوحدة", type: "text", defaultVisible: false },
    ],
  },
];

export const getDataSource = (key: string) => DATA_SOURCES.find(s => s.key === key);

export const GROUP_BY_OPTIONS = [
  { key: "none", label: "بدون تجميع" },
  { key: "day", label: "يومي" },
  { key: "week", label: "أسبوعي" },
  { key: "month", label: "شهري" },
  { key: "year", label: "سنوي" },
];

export const STATUS_LABELS: Record<string, string> = {
  paid: "مدفوع",
  partial: "جزئي",
  unpaid: "غير مدفوع",
  overdue: "متأخر",
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل",
  cheque: "شيك",
};

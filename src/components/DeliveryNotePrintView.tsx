/**
 * Delivery Note Print View
 * Wraps InvoicePrintView in "delivery" mode so the visual identity matches
 * sales invoices exactly, while hiding prices/tax/payment info.
 */
import type { CompanySettings } from "@/hooks/useCompanySettings";
import InvoicePrintView from "./InvoicePrintView";

export interface DeliveryNoteData {
  deliveryNumber: string;
  date: string;
  contactName: string;
  contactPhone?: string;
  contactAddress?: string;
  items: { description: string; quantity: number; unit?: string; productCode?: string }[];
  notes?: string;
  driverName?: string;
  vehicleNumber?: string;
  deliveryAddress?: string;
  status?: string;
  deliveryType?: "external" | "internal";
  fromWarehouseName?: string;
  toWarehouseName?: string;
  toBranchName?: string;
  currency?: string;
}

interface Props {
  note: DeliveryNoteData;
  settings: CompanySettings;
  copyLabel?: string;
}

const DeliveryNotePrintView = ({ note, settings, copyLabel }: Props) => {
  const items = (note.items || []).map((it) => ({
    description: it.description,
    productCode: it.productCode,
    quantity: Number(it.quantity) || 0,
    bonusQuantity: 0,
    unitPrice: 0,
    discount: 0,
    discountType: "amount" as const,
    taxRate: 0,
    taxCategory: "exempt" as const,
    subtotal: 0,
    // carried through so the delivery-mode table can render unit
    unit: it.unit,
  })) as any;

  return (
    <InvoicePrintView
      printMode="delivery"
      copyLabel={copyLabel}
      settings={settings}
      deliveryMeta={{
        deliveryType: note.deliveryType,
        fromWarehouseName: note.fromWarehouseName,
        toWarehouseName: note.toWarehouseName,
        toBranchName: note.toBranchName,
        driverName: note.driverName,
        vehicleNumber: note.vehicleNumber,
        deliveryAddress: note.deliveryAddress,
      }}
      invoice={{
        type: "sales",
        invoiceNumber: note.deliveryNumber,
        date: note.date,
        contactName: note.contactName || "",
        contactPhone: note.contactPhone,
        contactAddress: note.contactAddress,
        items,
        notes: note.notes || "",
        status: note.status || "draft",
        paymentMethod: "credit",
        subtotal: 0,
        totalDiscount: 0,
        totalTax: 0,
        total: 0,
        paidAmount: 0,
        remainingAmount: 0,
        currency: note.currency || "شيكل",
      }}
    />
  );
};

export default DeliveryNotePrintView;
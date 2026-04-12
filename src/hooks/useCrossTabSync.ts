import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onCrossTabChange, SyncEvent } from "@/lib/crossTabSync";
import { toast } from "sonner";

/**
 * Hook that listens for data changes from other tabs
 * and automatically invalidates relevant React Query caches.
 * Mount once at app root level.
 */
export function useCrossTabSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const cleanup = onCrossTabChange((event: SyncEvent) => {
      const { entity, action } = event;

      // Invalidate broad query keys that might be affected
      const keysToInvalidate: string[] = [];

      switch (entity) {
        case "receipt_voucher":
        case "payment_voucher":
          keysToInvalidate.push(
            "account-statement", "account-statement-v2",
            "transactions", "vouchers", "receipts",
            "journal-entries", "trial-balance",
            "contacts", "balances"
          );
          break;
        case "invoice":
          keysToInvalidate.push(
            "invoices", "account-statement", "account-statement-v2",
            "transactions", "contacts", "balances",
            "inventory", "products"
          );
          break;
        case "journal_entry":
          keysToInvalidate.push(
            "journal-entries", "account-statement", "account-statement-v2",
            "transactions", "trial-balance", "balances"
          );
          break;
        case "contact":
          keysToInvalidate.push("contacts", "customers", "suppliers");
          break;
        case "transaction":
          keysToInvalidate.push(
            "transactions", "account-statement", "account-statement-v2",
            "trial-balance", "balances"
          );
          break;
        default:
          // Generic invalidation
          keysToInvalidate.push(entity);
          break;
      }

      for (const key of keysToInvalidate) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }

      // Show subtle notification
      const actionLabel = action === "created" ? "تم إنشاء" : action === "updated" ? "تم تحديث" : "تم حذف";
      const entityLabel: Record<string, string> = {
        receipt_voucher: "سند قبض",
        payment_voucher: "سند صرف",
        invoice: "فاتورة",
        journal_entry: "قيد يومية",
        contact: "جهة اتصال",
        transaction: "معاملة",
      };
      const label = entityLabel[entity] || entity;
      toast.info(`🔄 ${actionLabel} ${label} في تبويب آخر`, { duration: 3000 });
    });

    return cleanup;
  }, [queryClient]);
}

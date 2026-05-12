import { useEffect } from "react";

interface UseInvoiceKeyboardOpts {
  enabled?: boolean;
  onSave: () => void;
  onAddRow: () => void;
}

/**
 * Power-user keyboard shortcuts for the invoice screen.
 * - Ctrl/Cmd + Enter → save invoice
 * - Alt + N           → add new item row
 * Works globally while the user is on the invoice page.
 */
export default function useInvoiceKeyboard({ enabled = true, onSave, onAddRow }: UseInvoiceKeyboardOpts) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts while user is typing inside contenteditable
      const target = e.target as HTMLElement | null;
      const isEditable = target?.isContentEditable;
      if (isEditable) return;

      // Ctrl/Cmd + Enter → save
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSave();
        return;
      }
      // Alt + N → add row (use code so layout-independent)
      if (e.altKey && (e.key === "n" || e.key === "N" || e.code === "KeyN")) {
        e.preventDefault();
        onAddRow();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onSave, onAddRow]);
}

/**
 * Move focus to the next invoice cell on Enter inside a row.
 * Order: qty → price → discount → tax → next row's qty.
 * If on the last row's tax, callback `onOverflow` is invoked
 * (typically to add a new row, then the caller focuses its qty input).
 */
export function focusNextInvoiceCell(
  currentField: "qty" | "price" | "discount" | "tax",
  currentItemId: string,
  itemIds: string[],
  onOverflow: () => void,
) {
  const idx = itemIds.indexOf(currentItemId);
  const nextOrder: Record<typeof currentField, "qty" | "price" | "discount" | "tax" | "next-qty"> = {
    qty: "price",
    price: "discount",
    discount: "tax",
    tax: "next-qty",
  };
  const target = nextOrder[currentField];
  if (target === "next-qty") {
    const nextId = itemIds[idx + 1];
    if (!nextId) {
      onOverflow();
      return;
    }
    focusCell("qty", nextId);
    return;
  }
  focusCell(target, currentItemId);
}

function focusCell(field: "qty" | "price" | "discount" | "tax", itemId: string) {
  const selector =
    field === "qty"
      ? `[data-invoice-qty="${itemId}"]`
      : field === "price"
      ? `[data-invoice-price="${itemId}"]`
      : field === "discount"
      ? `[data-invoice-discount="${itemId}"]`
      : `[data-invoice-tax="${itemId}"]`;
  // small timeout so React commits any new row first
  setTimeout(() => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) {
      el.focus();
      el.select();
    }
  }, 0);
}
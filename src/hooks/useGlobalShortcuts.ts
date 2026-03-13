import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface UseGlobalShortcutsOptions {
  onShowShortcuts: () => void;
  onShowNewModal?: () => void;
}

export function useGlobalShortcuts({ onShowShortcuts, onShowNewModal }: UseGlobalShortcutsOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
      if (inInput) return;

      // F-keys
      if (e.key === "F1") { e.preventDefault(); navigate("/invoices/new"); return; }
      if (e.key === "F2") { e.preventDefault(); navigate("/finance/receipt/new"); return; }
      if (e.key === "F3") { e.preventDefault(); navigate("/finance/payment/new"); return; }
      if (e.key === "F4") { e.preventDefault(); navigate("/finance/journal/new"); return; }

      // Alt combos for navigation (avoid browser conflicts like Ctrl+C/S/T)
      if (e.altKey) {
        if (e.key === "c" || e.key === "C") { e.preventDefault(); navigate("/contacts?type=customer"); return; }
        if (e.key === "m" || e.key === "M") { e.preventDefault(); navigate("/contacts?type=supplier"); return; }
        if (e.key === "k" || e.key === "K") { e.preventDefault(); navigate("/account-statement"); return; }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); navigate("/finance/cash-boxes"); return; }
        if (e.key === "i" || e.key === "I") { e.preventDefault(); navigate("/inventory"); return; }
        if (e.key === "l" || e.key === "L") { e.preventDefault(); navigate("/general-ledger"); return; }
        if (e.key === "q" || e.key === "Q") { e.preventDefault(); navigate("/finance/cheques"); return; }
        if (e.key === "t" || e.key === "T") { e.preventDefault(); navigate("/trial-balance"); return; }
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="ابحث"]');
          searchInput?.focus();
          return;
        }
        if (e.key === "n" || e.key === "N") { e.preventDefault(); onShowNewModal?.(); return; }
      }

      // Ctrl + / for shortcuts modal
      if ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.key === "÷")) { e.preventDefault(); onShowShortcuts(); return; }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onShowShortcuts, onShowNewModal]);
}

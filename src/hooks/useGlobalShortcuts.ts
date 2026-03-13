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
      if (e.key === "F3") { e.preventDefault(); navigate("/finance/payments"); return; }
      if (e.key === "F4") { e.preventDefault(); navigate("/finance/journals"); return; }

      // Ctrl combos
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") { e.preventDefault(); navigate("/contacts?type=customer"); return; }
        if (e.key === "m" || e.key === "M") { e.preventDefault(); navigate("/contacts?type=supplier"); return; }
        if (e.key === "k" || e.key === "K") { e.preventDefault(); navigate("/account-statement"); return; }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); navigate("/finance/cash-boxes"); return; }
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="ابحث"]');
          searchInput?.focus();
          return;
        }
        if (e.key === "/" || e.key === "÷") { e.preventDefault(); onShowShortcuts(); return; }
        if (e.key === "n" || e.key === "N") { e.preventDefault(); onShowNewModal?.(); return; }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onShowShortcuts, onShowNewModal]);
}

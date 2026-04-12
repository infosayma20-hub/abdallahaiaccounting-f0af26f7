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
      if (e.key === "F1") { e.preventDefault(); window.open("/invoices/new", "_blank", "noopener,noreferrer"); return; }
      if (e.key === "F2") { e.preventDefault(); window.open("/finance/receipt/new", "_blank", "noopener,noreferrer"); return; }
      if (e.key === "F3") { e.preventDefault(); window.open("/finance/payment/new", "_blank", "noopener,noreferrer"); return; }
      if (e.key === "F4") { e.preventDefault(); window.open("/finance/journal/new", "_blank", "noopener,noreferrer"); return; }

      // Alt combos — use e.code for keyboard-layout independence (works with Arabic keyboards)
      if (e.altKey) {
        const code = e.code;
        if (code === "KeyC") { e.preventDefault(); navigate("/contacts?type=customer"); return; }
        if (code === "KeyM") { e.preventDefault(); navigate("/contacts?type=supplier"); return; }
        if (code === "KeyK") { e.preventDefault(); navigate("/account-statement"); return; }
        if (code === "KeyS") { e.preventDefault(); navigate("/finance/cash-boxes"); return; }
        if (code === "KeyI") { e.preventDefault(); navigate("/inventory"); return; }
        if (code === "KeyL") { e.preventDefault(); navigate("/journal-entries"); return; }
        if (code === "KeyQ") { e.preventDefault(); navigate("/finance/cheques"); return; }
        if (code === "KeyT") { e.preventDefault(); navigate("/trial-balance"); return; }
        if (code === "KeyF") {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="ابحث"]');
          searchInput?.focus();
          return;
        }
        if (code === "KeyN") { e.preventDefault(); onShowNewModal?.(); return; }
        if (code === "KeyA") { e.preventDefault(); navigate("/super-admin/dashboard"); return; }
      }

      // Ctrl + / for shortcuts modal
      if ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.key === "÷" || e.code === "Slash")) { e.preventDefault(); onShowShortcuts(); return; }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onShowShortcuts, onShowNewModal]);
}

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppTabs } from "@/contexts/TabsContext";

interface UseGlobalShortcutsOptions {
  onShowShortcuts: () => void;
  onShowNewModal?: () => void;
}

export function useGlobalShortcuts({ onShowShortcuts, onShowNewModal }: UseGlobalShortcutsOptions) {
  const navigate = useNavigate();
  const { tabs, activeTabId, closeTab, switchTab } = useAppTabs();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

      // Ctrl+S — Save (dispatch custom event, works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("app:save"));
        return;
      }

      // Ctrl + / for shortcuts modal (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.key === "÷" || e.code === "Slash")) {
        e.preventDefault();
        onShowShortcuts();
        return;
      }

      // Escape — close dialogs (handled natively by Radix, but also useful)
      // Don't block if in input
      if (inInput && !e.altKey && !e.ctrlKey && !e.metaKey) return;

      // F-keys
      if (e.key === "F1") { e.preventDefault(); window.open("/invoices/new", "_blank", "noopener,noreferrer"); return; }
      if (e.key === "F2") { e.preventDefault(); window.open("/finance/receipt/new", "_blank", "noopener,noreferrer"); return; }
      if (e.key === "F3") { e.preventDefault(); window.open("/finance/payment/new", "_blank", "noopener,noreferrer"); return; }
      if (e.key === "F4") { e.preventDefault(); window.open("/finance/journal/new", "_blank", "noopener,noreferrer"); return; }

      // Alt combos — use e.code for keyboard-layout independence (works with Arabic keyboards)
      if (e.altKey) {
        const code = e.code;

        // Tab management (Chrome-like with Alt)
        // Alt+W — Close current tab
        if (code === "KeyW") {
          e.preventDefault();
          if (activeTabId) closeTab(activeTabId);
          return;
        }

        // Alt+ArrowRight — Next tab
        if (e.key === "ArrowRight") {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            const idx = tabs.findIndex(t => t.id === activeTabId);
            const nextIdx = (idx + 1) % tabs.length;
            switchTab(tabs[nextIdx].id);
          }
          return;
        }

        // Alt+ArrowLeft — Previous tab
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            const idx = tabs.findIndex(t => t.id === activeTabId);
            const prevIdx = (idx - 1 + tabs.length) % tabs.length;
            switchTab(tabs[prevIdx].id);
          }
          return;
        }

        // Alt+1..9 — Switch to tab by index
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= 9) {
          e.preventDefault();
          const targetIdx = numKey - 1;
          if (targetIdx < tabs.length) {
            switchTab(tabs[targetIdx].id);
          }
          return;
        }

        // Alt+P — Print
        if (code === "KeyP") {
          e.preventDefault();
          window.print();
          return;
        }

        // Navigation shortcuts
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
        
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onShowShortcuts, onShowNewModal, tabs, activeTabId, closeTab, switchTab]);
}

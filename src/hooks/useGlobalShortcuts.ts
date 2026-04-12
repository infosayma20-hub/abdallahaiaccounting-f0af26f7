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

      // Don't block if in input (unless Alt/Ctrl combo)
      if (inInput && !e.altKey && !e.ctrlKey && !e.metaKey) return;

      // Alt combos — use e.code for keyboard-layout independence (works with Arabic keyboards)
      if (e.altKey) {
        const code = e.code;

        // Tab management
        if (code === "KeyW") { e.preventDefault(); if (activeTabId) closeTab(activeTabId); return; }

        if (e.key === "ArrowRight") {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            const idx = tabs.findIndex(t => t.id === activeTabId);
            switchTab(tabs[(idx + 1) % tabs.length].id);
          }
          return;
        }

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            const idx = tabs.findIndex(t => t.id === activeTabId);
            switchTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
          }
          return;
        }

        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= 9) {
          e.preventDefault();
          if (numKey - 1 < tabs.length) switchTab(tabs[numKey - 1].id);
          return;
        }

        // Quick create (Alt + letter)
        if (code === "KeyI") { e.preventDefault(); navigate("/invoices/new"); return; }
        if (code === "KeyR") { e.preventDefault(); navigate("/finance/receipt/new"); return; }
        if (code === "KeyE") { e.preventDefault(); navigate("/finance/payment/new"); return; }
        if (code === "KeyJ") { e.preventDefault(); navigate("/finance/journal/new"); return; }

        // Alt+P — Print
        if (code === "KeyP") { e.preventDefault(); window.print(); return; }

        // Navigation shortcuts
        if (code === "KeyC") { e.preventDefault(); navigate("/contacts?type=customer"); return; }
        if (code === "KeyM") { e.preventDefault(); navigate("/contacts?type=supplier"); return; }
        if (code === "KeyK") { e.preventDefault(); navigate("/account-statement"); return; }
        if (code === "KeyS") { e.preventDefault(); navigate("/finance/cash-boxes"); return; }
        if (code === "KeyX") { e.preventDefault(); navigate("/inventory"); return; }
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

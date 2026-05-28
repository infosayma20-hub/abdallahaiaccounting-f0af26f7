import { useEffect } from "react";

interface UseJournalKeyboardOpts {
  enabled?: boolean;
  onSave: () => void;
  onAddRow: () => void;
  onDuplicateRow?: (currentLineId: string) => void;
  onDeleteRow?: (currentLineId: string) => void;
}

/**
 * Power-user keyboard shortcuts for the Journal Entry screen.
 * - Ctrl/Cmd + Enter   → save (post) entry
 * - Alt + N            → add a new line
 * - Ctrl/Cmd + D       → duplicate the focused line
 * - Ctrl/Cmd + Backspace → delete the focused line
 *
 * Works globally while the journal page/popup is open.
 */
export default function useJournalKeyboard({
  enabled = true,
  onSave,
  onAddRow,
  onDuplicateRow,
  onDeleteRow,
}: UseJournalKeyboardOpts) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextarea = target?.tagName === "TEXTAREA" || target?.isContentEditable;

      // Ctrl/Cmd + Enter → save (works everywhere, including textareas)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSave();
        return;
      }

      // Skip other shortcuts when typing in a textarea to avoid stealing real text input
      if (inTextarea) return;

      // Alt + N → new row
      if (e.altKey && (e.key === "n" || e.key === "N" || e.code === "KeyN")) {
        e.preventDefault();
        onAddRow();
        return;
      }

      // Ctrl/Cmd + D → duplicate current line
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
        const lineId = findFocusedLineId(target);
        if (lineId && onDuplicateRow) {
          e.preventDefault();
          onDuplicateRow(lineId);
        }
        return;
      }

      // Ctrl/Cmd + Backspace → delete current line
      if ((e.ctrlKey || e.metaKey) && e.key === "Backspace") {
        const lineId = findFocusedLineId(target);
        if (lineId && onDeleteRow) {
          e.preventDefault();
          onDeleteRow(lineId);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onSave, onAddRow, onDuplicateRow, onDeleteRow]);
}

function findFocusedLineId(el: HTMLElement | null): string | null {
  if (!el) return null;
  const row = el.closest<HTMLElement>("[data-journal-line-id]");
  return row?.dataset.journalLineId || null;
}

/**
 * Move focus to the next journal cell on Enter.
 * Order within row: debit → credit → memo → next row's debit (or trigger overflow).
 */
export function focusNextJournalCell(
  currentField: "debit" | "credit" | "memo",
  currentLineId: string,
  lineIds: string[],
  onOverflow: () => void,
) {
  const next: Record<typeof currentField, "debit" | "credit" | "memo" | "next-debit"> = {
    debit: "credit",
    credit: "memo",
    memo: "next-debit",
  };
  const target = next[currentField];

  if (target === "next-debit") {
    const idx = lineIds.indexOf(currentLineId);
    const nextId = lineIds[idx + 1];
    if (!nextId) {
      onOverflow();
      return;
    }
    focusCell("debit", nextId);
    return;
  }
  focusCell(target, currentLineId);
}

function focusCell(field: "debit" | "credit" | "memo", lineId: string) {
  const selector = `[data-journal-${field}="${lineId}"]`;
  setTimeout(() => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) {
      el.focus();
      el.select?.();
    }
  }, 0);
}
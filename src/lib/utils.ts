import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string or Date object for display as dd/MM/yyyy
 * Use this for ALL user-facing date displays.
 * Do NOT use for <input type="date"> values (those must remain yyyy-MM-dd).
 */
export function fmtDateDisplay(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Format a date string or Date for display as dd/MM/yyyy HH:mm
 */
export function fmtDateTimeDisplay(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Multi-word search: returns true if ALL words in the query exist
 * somewhere in the target string (order doesn't matter).
 */
export function multiWordMatch(target: string | null | undefined, query: string): boolean {
  if (!target || !query) return false;
  const t = normalizeArabicSearch(target);
  const tc = t.replace(/\s+/g, "");
  const words = normalizeArabicSearch(query).split(/\s+/).filter(Boolean);
  return words.every(w => t.includes(w) || tc.includes(w.replace(/\s+/g, "")));
}

export function normalizeArabicSearch(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if any of the given fields match the multi-word query.
 * Each word must appear in at least one of the fields.
 */
export function multiWordMatchAny(query: string, ...fields: (string | null | undefined)[]): boolean {
  if (!query || !query.trim()) return true;
  const words = normalizeArabicSearch(query).split(/\s+/).filter(Boolean);
  const normalizedFields = fields.map(normalizeArabicSearch);
  // Space-insensitive fallback: "عبدالله" should match "عبد الله" and vice-versa.
  const compactFields = normalizedFields.map(f => f.replace(/\s+/g, ""));
  return words.every(w => {
    if (normalizedFields.some(f => f.includes(w))) return true;
    const cw = w.replace(/\s+/g, "");
    return cw.length > 0 && compactFields.some(f => f.includes(cw));
  });
}

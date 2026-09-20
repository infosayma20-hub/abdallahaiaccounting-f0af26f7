/**
 * Shared fuzzy-ish product search helpers.
 *
 * Goal: users should not have to type an item name exactly (or in the exact
 * word order) to find it. Typing any word — or even 2-3 letters of it — must
 * surface every item containing it.
 *
 * Rules implemented here:
 * - Arabic normalisation (أ/إ/آ → ا, ة → ه, ى → ي, ؤ/ئ → و/ي, strip tashkeel
 *   and tatweel), Arabic-Indic digits → latin digits, lowercase latin.
 * - The query is split into tokens; an item matches when EVERY token appears
 *   somewhere in its searchable text (name, code, barcode, unit, colour).
 *   Order does not matter: "كولا كوكا" finds "كوكا كولا".
 * - Results are ranked: exact name > name starts with query > a word inside the
 *   name starts with the query > plain substring. Original order breaks ties.
 *
 * Nothing is ever hidden that used to be visible: plain substring matching is
 * still a match, the token rule only adds out-of-order support.
 */

const TASHKEEL = /[\u064B-\u0652\u0670\u0640]/g;
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** Normalise Arabic/Latin text for tolerant comparison. */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .replace(TASHKEEL, "")
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .replace(/[\u200f\u200e]/g, "")
    .replace(/[-_/\\.,()[\]{}"'«»]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Split a query into normalised tokens (empty array when the query is blank). */
export function toSearchTokens(query: string | null | undefined): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

/**
 * Score a candidate against the query tokens.
 * Returns -1 when it does not match at all; higher score = better match.
 */
export function scoreSearchMatch(
  primaryText: string,
  extraTexts: Array<string | null | undefined>,
  tokens: string[],
  rawQuery: string,
): number {
  if (tokens.length === 0) return 0;

  const name = normalizeSearchText(primaryText);
  const haystack = [name, ...extraTexts.map(normalizeSearchText)].filter(Boolean).join(" ");
  if (!haystack) return -1;

  // Every token must be present somewhere (order-independent AND search).
  for (const token of tokens) {
    if (!haystack.includes(token)) return -1;
  }

  const q = normalizeSearchText(rawQuery);
  let score = 1;
  if (name === q) score = 100;
  else if (name.startsWith(q)) score = 80;
  else if (name.includes(q)) score = 60;
  else {
    // All tokens matched, reward word-boundary hits inside the name.
    const words = name.split(" ");
    const wordStarts = tokens.filter((t) => words.some((w) => w.startsWith(t))).length;
    const inName = tokens.filter((t) => name.includes(t)).length;
    score = 10 + wordStarts * 4 + inName * 2;
  }
  return score;
}

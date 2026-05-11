/**
 * HR date utilities — keep storage/API in ISO (yyyy-mm-dd),
 * present everything to the user as dd/mm/yyyy.
 */

/** Format any ISO/Date-like input as dd/mm/yyyy. Returns "—" for empty/invalid. */
export function formatHRDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else {
    const s = String(input).trim();
    if (!s) return "—";
    // ISO yyyy-mm-dd or yyyy-mm-ddTHH:mm
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Parse user-typed dd/mm/yyyy (or dd-mm-yyyy) → ISO yyyy-mm-dd. Empty if invalid. */
export function parseHRDate(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (!m) return "";
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  if (Number.isNaN(d.getTime())) return "";
  return `${yyyy}-${mm}-${dd}`;
}

/** True if `from` and `to` are both valid ISO and from > to. */
export function isInvalidRange(fromIso: string, toIso: string): boolean {
  if (!fromIso || !toIso) return false;
  return fromIso > toIso;
}

/** ISO yyyy-mm-dd for today (local). */
export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Standard default date range for list/report filters across the app.
 * From = Jan 1 of current year, To = today.
 */
export function getDefaultDateRangeThisYear(): { fromISO: string; toISO: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  return { fromISO: `${yyyy}-01-01`, toISO: todayISO() };
}

/** Alias: dd/mm/yyyy formatter (matches public spec name). */
export const formatDateDMY = formatHRDate;

/** Alias: dd/mm/yyyy → ISO parser (matches public spec name). */
export const parseDMYToISO = parseHRDate;
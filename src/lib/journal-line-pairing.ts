/**
 * Pair free-form journal lines (debit column / credit column) into the
 * debit↔credit pairs required by `create_journal_entry_multi_party_atomic`.
 *
 * The server function stores one transaction row per pair, so a balanced
 * multi-line entry has to be split greedily: each debit is consumed against
 * the next credit until both sides are exhausted. This is the same allocation
 * shape the online path produces, so an offline entry posts identically once
 * the connection is back.
 *
 * Returns `null` when the entry cannot be represented safely (unbalanced, or a
 * line missing an account) — the caller must then refuse to capture offline
 * rather than store something that would post wrong.
 */

export interface PairableLine {
  account_code: string;
  debit: number;
  credit: number;
  contact_id?: string | null;
  line_comment?: string | null;
  cost_center_id?: string | null;
}

export interface JournalPair {
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  contact_id?: string | null;
  description?: string | null;
  cost_center_id?: string | null;
}

const EPSILON = 0.005;

export function pairJournalLines(lines: PairableLine[]): JournalPair[] | null {
  const debits = lines
    .filter((l) => Number(l.debit) > 0)
    .map((l) => ({ ...l, remaining: Number(l.debit) }));
  const credits = lines
    .filter((l) => Number(l.credit) > 0)
    .map((l) => ({ ...l, remaining: Number(l.credit) }));

  if (debits.length === 0 || credits.length === 0) return null;
  if ([...debits, ...credits].some((l) => !l.account_code)) return null;

  const totalD = debits.reduce((s, l) => s + l.remaining, 0);
  const totalC = credits.reduce((s, l) => s + l.remaining, 0);
  if (Math.abs(totalD - totalC) > EPSILON) return null;

  const pairs: JournalPair[] = [];
  let di = 0;
  let ci = 0;

  while (di < debits.length && ci < credits.length) {
    const d = debits[di];
    const c = credits[ci];
    const amount = Math.min(d.remaining, c.remaining);
    if (amount > EPSILON) {
      if (d.account_code === c.account_code) return null; // server rejects same-account pairs
      pairs.push({
        debit_account_code: d.account_code,
        credit_account_code: c.account_code,
        amount: Math.round(amount * 100) / 100,
        contact_id: d.contact_id || c.contact_id || null,
        description: d.line_comment || c.line_comment || null,
        cost_center_id: d.cost_center_id || c.cost_center_id || null,
      });
    }
    d.remaining -= amount;
    c.remaining -= amount;
    if (d.remaining <= EPSILON) di += 1;
    if (c.remaining <= EPSILON) ci += 1;
  }

  return pairs.length > 0 ? pairs : null;
}

export default pairJournalLines;

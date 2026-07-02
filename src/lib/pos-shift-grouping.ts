/**
 * POS Shift Grouping — Pure client-side transformation of statement rows.
 *
 * Given a chronological list of statement rows for a POS cash-box account,
 * collapses consecutive-per-shift `pos_sale` / `pos_sale_vat` / `pos_refund`
 * rows into a single "shift summary" synthetic row per pos_session, while
 * preserving the position of non-POS rows (manual JV, transfers, etc.).
 *
 * Safety guarantees:
 *  - Never mutates the input rows.
 *  - Totals (debit/credit) of the summary equal the sum of underlying rows.
 *  - Running balance is recomputed from the opening balance and stays
 *    mathematically identical to the un-grouped view (aggregation is
 *    associative — SUM stays SUM regardless of ordering within a shift).
 *  - When `expanded` set includes a session_id, the underlying rows are
 *    emitted immediately after the summary row (tagged as children) so the
 *    accountant can drill in without leaving the page.
 */

export interface PosShiftInfo {
  session_id: string;
  business_date: string;      // YYYY-MM-DD
  opened_at: string;
  closed_at: string | null;
  state: string | null;
  cashier_name: string | null;
  device_name: string | null;
  cash_box_id: string | null;
  cash_box_name: string | null;
  session_seq: number | null;
  order_count: number;
  total_debit: number;
  total_credit: number;
  total_vat: number;
  expected_cash: number | null;
  closing_cash: number | null;
  cash_variance: number | null;
  currency: string;
}

export interface ShiftGroupingContext {
  shifts: Map<string, PosShiftInfo>;              // session_id → info
  orderToSession: Map<string, string>;            // pos order_number → session_id
  expandedSessions: Set<string>;                  // sessions currently shown expanded
  enabled: boolean;                               // master switch (user toggle)
}

// Minimal contract the helper needs from the caller's row shape.
// Kept structural to avoid coupling to the page's full StatementRow type.
export interface GroupableRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
  currency: string;
  payment_method?: string | null;
  isCancelled?: boolean;
  // Grouping-specific tags (added by this helper — never read from input):
  isShiftSummary?: boolean;
  isShiftChild?: boolean;
  shiftSessionId?: string;
  shiftMeta?: PosShiftInfo | null;
  [k: string]: any;
}

const POS_TX_TYPES = new Set(['pos_sale', 'pos_sale_vat', 'pos_refund']);

function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch { return ''; }
}

export function isPosStatementRow(r: GroupableRow): boolean {
  return !!r.reference && POS_TX_TYPES.has(r.transaction_type);
}

/**
 * Transform `rows` by collapsing POS lines that share a session_id.
 * If ctx is disabled or no mapping is available, returns rows unchanged.
 */
export function groupRowsByShift<T extends GroupableRow>(
  rows: T[],
  ctx: ShiftGroupingContext,
): T[] {
  if (!ctx.enabled || rows.length === 0 || ctx.shifts.size === 0) return rows;

  type Slot = { idx: number; row: T };
  const slots: Slot[] = [];
  const buckets = new Map<string, T[]>();
  const firstIdx = new Map<string, number>();

  rows.forEach((row, idx) => {
    if (!isPosStatementRow(row)) { slots.push({ idx, row }); return; }
    const sid = ctx.orderToSession.get(String(row.reference));
    if (!sid || !ctx.shifts.has(sid)) { slots.push({ idx, row }); return; }
    if (!buckets.has(sid)) { buckets.set(sid, []); firstIdx.set(sid, idx); }
    buckets.get(sid)!.push(row);
  });

  for (const [sid, group] of buckets) {
    const info = ctx.shifts.get(sid)!;
    const debit = group.reduce((s, r) => s + (Number(r.debit) || 0), 0);
    const credit = group.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const anchorIdx = firstIdx.get(sid)!;
    // Prefer business_date on the summary so date sorting groups intraday sessions on one line.
    const displayDate = info.business_date || group[0].date;
    const cashier = info.cashier_name || 'كاشير غير محدد';
    const device = info.device_name ? ` · ${info.device_name}` : '';
    const open = timeOnly(info.opened_at);
    const close = info.closed_at ? timeOnly(info.closed_at) : '…';
    const openStatus = info.state === 'open' ? ' (مفتوحة)' : '';
    const description = `📦 وردية ${cashier}${device} · ${info.order_count} طلب · ${open}→${close}${openStatus}`;

    const summary = {
      date: displayDate,
      description,
      transaction_type: 'pos_shift_summary',
      reference: `SHIFT-${sid.slice(0, 8)}`,
      debit,
      credit,
      balance: 0, // recomputed below
      transaction_id: `shift-${sid}`,
      currency: group[0].currency || info.currency || 'شيكل',
      payment_method: null,
      isShiftSummary: true,
      shiftSessionId: sid,
      shiftMeta: info,
    } as unknown as T;

    slots.push({ idx: anchorIdx, row: summary });

    if (ctx.expandedSessions.has(sid)) {
      // Children get emitted immediately after the summary at fractional indices
      // to preserve stable ordering.
      group.forEach((child, k) => {
        const tagged = {
          ...child,
          isShiftChild: true,
          shiftSessionId: sid,
        } as T;
        slots.push({ idx: anchorIdx + (k + 1) * 1e-6, row: tagged });
      });
    }
  }

  slots.sort((a, b) => a.idx - b.idx);

  // Recompute running balance from the original opening balance.
  // openBal = firstRow.balance - (firstRow.debit - firstRow.credit)
  const first = rows[0];
  let running = (Number(first.balance) || 0) - ((Number(first.debit) || 0) - (Number(first.credit) || 0));
  const out: T[] = [];
  for (const { row } of slots) {
    if (row.isShiftChild) {
      // Children display their own debit/credit but do NOT affect running balance
      // (already reflected in the parent summary above them).
      out.push({ ...row, balance: NaN } as T);
      continue;
    }
    running += (Number(row.debit) || 0) - (Number(row.credit) || 0);
    out.push({ ...row, balance: running } as T);
  }
  return out;
}
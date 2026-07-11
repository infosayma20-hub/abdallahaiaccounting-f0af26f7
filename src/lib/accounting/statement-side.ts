export type StatementSideResolution = {
  isDebit: boolean;
  isCredit: boolean;
  isAmbiguous: boolean;
};

export const STATEMENT_BALANCE_COLORS = {
  debit: "#059669",
  credit: "#DC2626",
  settled: "#6B7280",
  debitBg: "#F0FDF4",
  creditBg: "#FEF2F2",
  settledBg: "#F9FAFB",
  debitBorder: "#BBF7D0",
  creditBorder: "#FECACA",
  settledBorder: "#E5E7EB",
} as const;

export function getStatementBalanceColor(value: number): string {
  if (value > 0) return STATEMENT_BALANCE_COLORS.debit;
  if (value < 0) return STATEMENT_BALANCE_COLORS.credit;
  return STATEMENT_BALANCE_COLORS.settled;
}

export function getStatementBalanceTone(value: number): { color: string; background: string; border: string; label: string } {
  if (value > 0) {
    return {
      color: STATEMENT_BALANCE_COLORS.debit,
      background: STATEMENT_BALANCE_COLORS.debitBg,
      border: STATEMENT_BALANCE_COLORS.debitBorder,
      label: "مدين (عليه)",
    };
  }
  if (value < 0) {
    return {
      color: STATEMENT_BALANCE_COLORS.credit,
      background: STATEMENT_BALANCE_COLORS.creditBg,
      border: STATEMENT_BALANCE_COLORS.creditBorder,
      label: "دائن (له)",
    };
  }
  return {
    color: STATEMENT_BALANCE_COLORS.settled,
    background: STATEMENT_BALANCE_COLORS.settledBg,
    border: STATEMENT_BALANCE_COLORS.settledBorder,
    label: "مسدد",
  };
}

export const CONTACT_STATEMENT_ACCOUNT_ROOTS = ["113", "211", "2180", "1146"] as const;

export function matchesStatementContactAccount(code: string | null | undefined): boolean {
  if (!code) return false;
  return CONTACT_STATEMENT_ACCOUNT_ROOTS.some((root) => code === root || code.startsWith(root));
}

export function normalizeStatementOwnCodes(codes: Iterable<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const code of codes) {
    const normalized = String(code || "").trim();
    if (normalized) out.add(normalized);
  }
  return out;
}

export function resolveStatementDebitCredit(
  tx: { debit_account_code?: string | null; credit_account_code?: string | null },
  ownAccountCodes?: Iterable<string | null | undefined>,
): StatementSideResolution {
  const debitMatches = matchesStatementContactAccount(tx.debit_account_code);
  const creditMatches = matchesStatementContactAccount(tx.credit_account_code);

  if (debitMatches && creditMatches) {
    const ownCodes = normalizeStatementOwnCodes(ownAccountCodes || []);
    if (ownCodes.size > 0) {
      const debitOwn = !!tx.debit_account_code && ownCodes.has(tx.debit_account_code);
      const creditOwn = !!tx.credit_account_code && ownCodes.has(tx.credit_account_code);
      if (debitOwn !== creditOwn) {
        return { isDebit: debitOwn, isCredit: creditOwn, isAmbiguous: false };
      }
    }

    // Never default an inter-contact transfer to debit. If the selected party's
    // exact linked account is unknown, the row must stay out of debit/credit
    // totals instead of silently flipping the sign.
    return { isDebit: false, isCredit: false, isAmbiguous: true };
  }

  return { isDebit: debitMatches, isCredit: creditMatches, isAmbiguous: false };
}
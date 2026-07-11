export type StatementSideResolution = {
  isDebit: boolean;
  isCredit: boolean;
  isAmbiguous: boolean;
};

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
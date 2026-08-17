/**
 * Al-Malaky (الملكي) tenant gate.
 * Some reports/screens are exclusive to the Malaky tenant.
 */
export const MALAKY_OWNER_ID = "0b08eba6-c81a-4f6c-b371-e6e324016e73";

export const MALAKY_OWNER_EMAILS = [
  "malakybroast@gmail.com",
  "mosaab@malaky.com",
  "mosab@malaky.com",
  "kamal@malaky.com",
];

/** Reports restricted to the Malaky tenant only (by report slug). */
export const MALAKY_ONLY_REPORT_SLUGS = ["delivery-areas", "sales-by-type"];

export const isMalakyOwner = (ownerId?: string | null) => ownerId === MALAKY_OWNER_ID;

export const isMalakyEmail = (email?: string | null) =>
  !!email && MALAKY_OWNER_EMAILS.includes(email.toLowerCase());

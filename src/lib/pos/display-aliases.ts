/**
 * Short, human-typeable aliases for customer order-display screens.
 * Usage: https://unifyerp.app/tv/plaza  ->  full device token.
 */
export const DISPLAY_TOKEN_ALIASES: Record<string, string> = {
  plaza: "2d71f6a3051f4649b8616686a680f186",
};

export function resolveDisplayToken(input: string): string {
  const key = (input || "").trim().toLowerCase();
  return DISPLAY_TOKEN_ALIASES[key] || input;
}

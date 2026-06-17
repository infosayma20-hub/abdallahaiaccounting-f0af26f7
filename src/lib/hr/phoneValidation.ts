/**
 * Phone validation for Palestinian / Israeli numbers (WhatsApp-ready).
 *
 * Accepted forms (normalized to E.164):
 *  - +970 5X XXX XXXX  (10 digits after +970, total 13 chars incl '+')
 *  - +972 5X XXX XXXX  (10 digits after +972, total 13 chars incl '+')
 *  - 05X XXX XXXX      (local 10 digits — auto-prefixed to +970)
 *  - 9705X… / 9725X…   (auto-prefixed with '+')
 *
 * Anything else is rejected to prevent silently storing bad numbers.
 */

const ALLOWED_PREFIXES = ["+970", "+972"] as const;

export type PhoneValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; error: string };

/** Strip spaces, dashes, parentheses. Keep leading '+' and digits only. */
function clean(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/[\s\-().]/g, "");
  // keep one leading + and digits
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return (hasPlus ? "+" : "") + digits;
}

/**
 * Validate and normalize a phone to one of: +970XXXXXXXXX or +972XXXXXXXXX
 * Returns `{ valid, normalized | error }`. Empty input is considered invalid.
 */
export function validatePhone(raw: string): PhoneValidationResult {
  const cleaned = clean(raw);
  if (!cleaned) {
    return { valid: false, error: "رقم الهاتف مطلوب" };
  }

  let normalized = cleaned;

  // Local format: starts with 0 → assume +970
  if (/^0\d{9}$/.test(normalized)) {
    normalized = "+970" + normalized.slice(1);
  }
  // Bare 9705… / 9725… without '+'
  else if (/^97[02]\d{9}$/.test(normalized)) {
    normalized = "+" + normalized;
  }

  // Must start with one of the allowed prefixes
  const prefix = ALLOWED_PREFIXES.find((p) => normalized.startsWith(p));
  if (!prefix) {
    return {
      valid: false,
      error: "يجب أن يبدأ الرقم بـ +970 أو +972 (مقدمة واتساب)",
    };
  }

  const rest = normalized.slice(prefix.length);
  if (!/^\d{9}$/.test(rest)) {
    return {
      valid: false,
      error: "الرقم غير مكتمل — مطلوب 9 أرقام بعد المقدمة (مثال: +970599123456)",
    };
  }
  // Palestinian/Israeli mobiles start with 5
  if (!rest.startsWith("5")) {
    return {
      valid: false,
      error: "رقم الموبايل يجب أن يبدأ بـ 5 (مثال: +970599123456)",
    };
  }

  return { valid: true, normalized: prefix + rest };
}

/** Lightweight boolean check (no normalization). */
export function isValidPhone(raw: string): boolean {
  return validatePhone(raw).valid;
}

/** Optional variant: empty input passes (for non-required fields). */
export function validatePhoneOptional(raw: string): PhoneValidationResult {
  if (!raw || !raw.trim()) return { valid: true, normalized: "" };
  return validatePhone(raw);
}
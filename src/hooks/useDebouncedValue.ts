import { useEffect, useState } from "react";

/**
 * Returns a debounced version of `value` that only updates after `delay` ms of stability.
 * Useful for filters and search inputs to prevent excessive re-queries.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

import { describe, expect, it } from "vitest";
import { multiWordMatchAny } from "../utils";
import { fetchAllRows, fetchRowsByIds } from "../fetch-all-rows";

describe("document contact search", () => {
  it("matches Arabic name variants and words across phone and name", () => {
    expect(multiWordMatchAny("صايمه", "أسامة صايمة")).toBe(true);
    expect(multiWordMatchAny("اسامه 056", "أسامة صايمة", "0569799317")).toBe(true);
    expect(multiWordMatchAny("اسامه 099", "أسامة صايمة", "0569799317")).toBe(false);
  });

  it("keeps contacts beyond the first thousand searchable", async () => {
    const contacts = Array.from({ length: 18293 }, (_, id) => ({
      id, name: id === 18292 ? "أسامة صايمة" : `جهة ${id}`,
    }));
    const loaded = await fetchAllRows((from, to) => Promise.resolve({
      data: contacts.slice(from, to + 1), error: null,
      count: null, status: 200, statusText: "OK", success: true as const,
    }));
    expect(loaded).toHaveLength(18293);
    expect(loaded.filter(c => multiWordMatchAny("اسامه", c.name)).map(c => c.id)).toEqual([18292]);
  });

  it("fetches all linked records in bounded batches without duplicate ids", async () => {
    const ids = Array.from({ length: 1501 }, (_, i) => String(i));
    const sizes: number[] = [];
    const result = await fetchRowsByIds([...ids, "0"], (batch, from, to) => {
      sizes.push(batch.length);
      return Promise.resolve({ data: batch.slice(from, to + 1).map(id => ({ id })),
        error: null, count: null, status: 200, statusText: "OK", success: true as const });
    });
    expect(result).toHaveLength(1501);
    expect(result.at(-1)?.id).toBe("1500");
    expect(Math.max(...sizes)).toBe(100);
  });

  it("does not hide lookup failures as empty results", async () => {
    const error = { message: "permission denied", details: "", hint: "", code: "42501" };
    await expect(fetchAllRows(() => Promise.reject(error))).rejects.toEqual(error);
  });
});
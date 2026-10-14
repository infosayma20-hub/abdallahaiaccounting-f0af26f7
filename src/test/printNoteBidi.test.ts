import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("docs/print-bridge-installer/print-bridge-v6.3.7-clean.js", "utf8");
const start = source.indexOf("function esc(s)");
const end = source.indexOf("// Normalize a counter/order number", start);
const helpers = runInNewContext(`${source.slice(start, end)}; ({ noteTextForSvg, wrapTextForSvg })`);
const layer = readFileSync("docs/print-bridge-bilingual/bilingual-layer.js", "utf8");
const translate = runInNewContext(`${layer}; enTranslateText`);

describe("print note directional isolation", () => {
  it("preserves leading Arabic quantities without reversing instructions", () => {
    const note = "2 بجبنة 2 بدون جبنة 8";
    expect(helpers.noteTextForSvg(note, "+ ")).toBe(`+ \u202b${note}\u202c`);
  });

  it("keeps multi-digit and Arabic-Indic quantities intact after wrapping", () => {
    const note = "12 بدون بصل ٢ بجبنة 18 بدون ملح";
    const lines: string[] = helpers.wrapTextForSvg(note, 22);
    expect(lines.join(" ")).toBe(note);
    for (const line of lines) {
      expect(helpers.noteTextForSvg(line)).toBe(`\u202b${line}\u202c`);
    }
  });

  it("leaves English-only notes in their original direction", () => {
    expect(helpers.noteTextForSvg("12 no onions", "+ ")).toBe("+ 12 no onions");
  });

  it("preserves Arabic instructions when bilingual mode translates the label", () => {
    const formatted = helpers.noteTextForSvg("12 بدون بصل", "ملاحظة: ");
    expect(translate(formatted)).toBe("Note: \u202b12 بدون بصل\u202c");
  });

  it("escapes customer input without changing quantity order", () => {
    expect(helpers.noteTextForSvg("2 جبنة < & >")).toBe("\u202b2 جبنة &lt; &amp; &gt;\u202c");
  });
});
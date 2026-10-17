import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildAgentPrompt } from "@/lib/wa/agentPrompt";

const body = (p: string) => readFileSync(p, "utf8").split("\n").slice(1).join("\n");

describe("WhatsApp agent prompt", () => {
  it("frontend preview and edge function use the same builder", () => {
    expect(body("src/lib/wa/agentPrompt.ts")).toBe(body("supabase/functions/_shared/wa-agent-prompt.ts"));
  });
  it("menu ends with إشي ثاني after the tracks", () => {
    const out = buildAgentPrompt({ tracks: [{ key: "a", label: "ضريبة" }, { key: "b", label: "تدقيق" }] });
    expect(out).toContain("1. ضريبة\n2. تدقيق\n3. إشي ثاني");
  });
  it("appends custom prompt only when set", () => {
    expect(buildAgentPrompt({ custom_prompt: "قاعدة خاصة" })).toContain("قاعدة خاصة");
    expect(buildAgentPrompt({})).not.toContain("تعليمات إضافية");
  });
});

import { describe, expect, it } from "vitest";
import { getDetailGroups } from "@/lib/employeeRequestDisplay";

const baseForm: any = {
  id: "1",
  form_type: "facility_quality",
  status: "pending",
  created_at: new Date().toISOString(),
  form_data: {
    notes: "تشييك يومي",
    attachment_urls: ["https://x.test/a.jpg", "https://x.test/b.jpg"],
    attachment_paths: ["uid/t90/a.jpg", "uid/t90/b.jpg"],
    attachment_url: "https://x.test/a.jpg",
    attachment_path: "uid/t90/a.jpg",
  },
};

describe("عرض مرفقات النماذج في شاشات الموارد", () => {
  const fields = getDetailGroups(baseForm).flatMap((g) => g.fields);

  it("يعرض كل صورة كمرفق مستقل", () => {
    const attach = fields.filter((f) => f.isUrl);
    expect(attach.map((f) => f.value)).toEqual(["https://x.test/a.jpg", "https://x.test/b.jpg"]);
  });

  it("لا يكرر أول مرفق ولا يعرض المسارات الداخلية", () => {
    expect(fields.filter((f) => f.value === "https://x.test/a.jpg")).toHaveLength(1);
    expect(fields.some((f) => String(f.value).startsWith("uid/t90/"))).toBe(false);
  });

  it("يعرض المرفق المفرد للنماذج القديمة", () => {
    const legacy: any = {
      ...baseForm,
      form_data: { notes: "قديم", attachment_url: "https://x.test/old.jpg" },
    };
    const legacyFields = getDetailGroups(legacy).flatMap((g) => g.fields);
    expect(legacyFields.filter((f) => f.isUrl).map((f) => f.value)).toEqual(["https://x.test/old.jpg"]);
  });
});

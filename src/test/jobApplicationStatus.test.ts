import { describe, expect, it } from "vitest";
import {
  JOB_APPLICATION_STATUSES,
  getJobApplicationStatus,
  jobApplicationStatusToUnified,
} from "@/lib/hr/jobApplicationStatus";

describe("job application statuses", () => {
  it("contains the complete ordered recruitment workflow", () => {
    expect(JOB_APPLICATION_STATUSES.map((status) => status.label)).toEqual([
      "جديد",
      "قيد الفرز",
      "مؤهل للمقابلة",
      "تم تحديد مقابلة",
      "تمت المقابلة – بانتظار التقييم",
      "مرشح احتياطي",
      "عرض وظيفي",
      "تم التوظيف",
      "مرفوض في الفرز",
      "مرفوض بعد المقابلة",
      "اعتذر المرشح",
      "مؤجل للمتابعة لاحقًا",
      "مغلق / مؤرشف",
    ]);
  });

  it("keeps legacy database keys under their updated labels", () => {
    expect(getJobApplicationStatus("shortlisted").label).toBe("قيد الفرز");
    expect(getJobApplicationStatus("rejected").label).toBe("مرفوض في الفرز");
  });

  it("maps final outcomes correctly for the owner portal", () => {
    expect(jobApplicationStatusToUnified("hired")).toBe("approved");
    expect(jobApplicationStatusToUnified("rejected_after_interview")).toBe("rejected");
    expect(jobApplicationStatusToUnified("candidate_withdrew")).toBe("rejected");
    expect(jobApplicationStatusToUnified("interview_scheduled")).toBe("pending");
  });
});
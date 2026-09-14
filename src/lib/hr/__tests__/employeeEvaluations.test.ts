import { describe, it, expect } from "vitest";
import {
  buildEvalRows, isEvaluationTemplate, scoreLabel,
  type EvalTemplateRow, type EvalFormRow,
} from "../employeeEvaluations";

const hrm06: EvalTemplateRow = {
  id: "tpl-06",
  name: "HRM-06 تقييم الموظفين الدوري",
  schema: {
    sections: [
      { key: "header", fields: [{ key: "employee_name", label: "اسم الموظف" }, { key: "evaluator", label: "المقيِّم" }] },
      {
        key: "criteria",
        fields: ["speed", "accuracy", "cooperation", "fsms_commitment", "fsms_goals", "guidance", "attendance", "time_use", "pressure", "assets", "total"]
          .map((k) => ({ key: k, label: k })),
      },
      { key: "followup", fields: [{ key: "employee_ack", label: "إقرار" }] },
    ],
  },
};

const notEval: EvalTemplateRow = {
  id: "tpl-x", name: "طلب إجازة",
  schema: { sections: [{ key: "header", fields: [{ key: "reason", label: "السبب" }] }] },
};

// سجل حقيقي (يمان حمد الله) — معايير بلا total: 8,7,8,8,8,8,8,6,7,8 = 76/10 = 7.6
const realForm: EvalFormRow = {
  id: "f1",
  employee_id: "mgr-1",
  template_id: "tpl-06",
  title: "HRM-06 تقييم الموظفين الدوري",
  form_data: {
    criteria: { speed: 8, accuracy: 7, cooperation: 8, fsms_commitment: 8, fsms_goals: 8, guidance: 8, attendance: 8, time_use: 6, pressure: 7, assets: 8, total: 8 },
    followup: { employee_ack: true },
    header: { employee_name: "يمان حمد الله", eval_date: "2026-09-14", eval_type: "تقييم دوري", evaluator: "مدير الفرع", job_title: "موظف مطبخ", year: "2026" },
  },
  status: "pending",
  workflow_status: "draft",
  created_at: "2026-09-14T08:18:04.905721+00:00",
  submitted_at: null,
  hr_hidden_at: null,
  employee_acknowledged_at: null,
};

const employees = [{ id: "mgr-1", full_name: "أحمد المدير", job_title: "مدير فرع", branch_id: "br-1" }];
const branches = new Map([["br-1", "فرع البيرة"]]);

describe("employeeEvaluations", () => {
  it("يميّز قوالب التقييم فقط", () => {
    expect(isEvaluationTemplate(hrm06)).toBe(true);
    expect(isEvaluationTemplate(notEval)).toBe(false);
  });

  it("يبني الصف من سجل حقيقي بدقة", () => {
    const [r] = buildEvalRows([realForm], [hrm06], employees, branches);
    expect(r.evaluated).toBe("يمان حمد الله");
    expect(r.evaluatorName).toBe("أحمد المدير");
    expect(r.evaluatorRole).toBe("مدير الفرع");
    expect(r.branch).toBe("فرع البيرة");
    expect(r.jobTitle).toBe("موظف مطبخ");
    expect(r.year).toBe("2026");
    expect(r.total).toBe(8);
    expect(r.average).toBe(7.6);
    expect(r.criteriaFilled).toBe(10);
    expect(r.criteriaCount).toBe(10);
    expect(r.acknowledged).toBe(true);
    expect(r.status).toBe("draft");
    expect(scoreLabel(r.average)).toBe("جيد");
  });

  it("يتحمّل المعايير الناقصة والبيانات الفارغة دون انهيار", () => {
    const partial: EvalFormRow = {
      ...realForm, id: "f2",
      form_data: { criteria: { speed: 9, accuracy: "", cooperation: null }, header: {} },
      employee_id: null,
    };
    const empty: EvalFormRow = { ...realForm, id: "f3", form_data: null, employee_id: null };
    const [a, b] = buildEvalRows([partial, empty], [hrm06], employees, branches);
    expect(a.criteriaFilled).toBe(1);
    expect(a.average).toBe(9);
    expect(a.evaluated).toBe("—");
    expect(a.branch).toBe("—");
    expect(a.year).toBe("2026");
    expect(b.average).toBeNull();
    expect(b.total).toBeNull();
    expect(b.acknowledged).toBe(false);
    expect(scoreLabel(b.average)).toBe("غير مكتمل");
  });
});

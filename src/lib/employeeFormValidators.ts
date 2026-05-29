/**
 * Unified validator for all employee_forms submissions.
 * Returns { ok: true } on success, or { ok: false, error: "<arabic message>" }.
 * Each form_type has its own required fields and business rules.
 */

export type ValidationResult = { ok: true } | { ok: false; error: string };

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function validateEmployeeForm(
  formType: string,
  data: Record<string, any>
): ValidationResult {
  switch (formType) {
    case "leave_request": {
      if (isEmpty(data.from_date)) return { ok: false, error: "حدد تاريخ بداية الإجازة" };
      if (isEmpty(data.to_date)) return { ok: false, error: "حدد تاريخ نهاية الإجازة" };
      if (data.to_date < data.from_date)
        return { ok: false, error: "تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية" };
      if (isEmpty(data.leave_type)) return { ok: false, error: "اختر نوع الإجازة" };
      if (!["annual", "regular"].includes(String(data.leave_type)))
        return { ok: false, error: "نوع الإجازة غير صحيح" };
      const days = Number(data.days_count);
      if (!Number.isFinite(days) || days <= 0)
        return { ok: false, error: "أدخل عدد أيام الإجازة بشكل صحيح" };
      return { ok: true };
    }

    case "advance_request": {
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        return { ok: false, error: "أدخل مبلغ السلفة" };
      if (isEmpty(data.reason)) return { ok: false, error: "اذكر سبب طلب السلفة" };
      return { ok: true };
    }

    case "loan_request": {
      if (isEmpty(data.full_name)) return { ok: false, error: "أدخل الاسم الرباعي" };
      const amount = Number(data.loan_amount);
      if (!Number.isFinite(amount) || amount <= 0)
        return { ok: false, error: "أدخل قيمة القرض المطلوبة" };
      if (isEmpty(data.reason)) return { ok: false, error: "اذكر سبب طلب القرض" };
      return { ok: true };
    }

    case "correction_request": {
      if (isEmpty(data.correction_date)) return { ok: false, error: "حدد تاريخ البصمة" };
      if (isEmpty(data.correction_type)) return { ok: false, error: "حدد نوع التصحيح" };
      if (isEmpty(data.correction_time)) return { ok: false, error: "أدخل وقت البصمة" };
      if (isEmpty(data.reason)) return { ok: false, error: "اذكر سبب التصحيح" };
      return { ok: true };
    }

    case "overtime_request": {
      if (isEmpty(data.employee_name)) return { ok: false, error: "اكتب اسم الموظف" };
      if (isEmpty(data.overtime_date)) return { ok: false, error: "حدد التاريخ" };
      if (isEmpty(data.from_time)) return { ok: false, error: "حدد ساعة البداية" };
      if (isEmpty(data.to_time)) return { ok: false, error: "حدد ساعة النهاية" };
      const hours = Number(data.hours);
      if (!Number.isFinite(hours) || hours <= 0)
        return { ok: false, error: "عدد الساعات غير صحيح" };
      if (isEmpty(data.reason)) return { ok: false, error: "اذكر سبب الأوفرتايم" };
      return { ok: true };
    }

    case "hr_message": {
      if (isEmpty(data.subject)) return { ok: false, error: "اكتب موضوع الرسالة" };
      if (isEmpty(data.message)) return { ok: false, error: "اكتب نص الرسالة" };
      return { ok: true };
    }

    case "employee_info": {
      if (isEmpty(data.name)) return { ok: false, error: "أدخل الاسم" };
      if (isEmpty(data.date_of_birth)) return { ok: false, error: "أدخل تاريخ الميلاد" };
      if (isEmpty(data.malaky_start_date)) return { ok: false, error: "أدخل تاريخ البداية في الملكي" };
      if (isEmpty(data.whatsapp_local)) return { ok: false, error: "أدخل رقم الواتساب" };
      {
        const digits = String(data.whatsapp_local || "").replace(/\D/g, "");
        const prefix = data.whatsapp_prefix || "+972";
        if (digits.length < 8 || digits.length > 10) return { ok: false, error: "رقم الواتساب غير صحيح (9 خانات)" };
        if (prefix !== "+972" && prefix !== "+970") return { ok: false, error: "اختر مقدمة الرقم +972 أو +970" };
      }
      if (isEmpty(data.id_number)) return { ok: false, error: "أدخل رقم الهوية" };
      {
        const id = String(data.id_number || "").replace(/\D/g, "");
        if (id.length < 7 || id.length > 12) return { ok: false, error: "رقم الهوية غير صحيح" };
      }
      if (isEmpty(data.marital_status)) return { ok: false, error: "اختر الحالة الاجتماعية" };
      if (isEmpty(data.branch)) return { ok: false, error: "أدخل الفرع" };
      if (isEmpty(data.department)) return { ok: false, error: "أدخل القسم" };
      if (["متزوج", "مطلق", "أرمل"].includes(String(data.marital_status))) {
        if (isEmpty(data.children_count)) return { ok: false, error: "أدخل عدد الأبناء" };
      }
      return { ok: true };
    }

    case "complaints": {
      if (isEmpty(data.complaint_type)) return { ok: false, error: "اختر نوع المشاركة" };
      if (isEmpty(data.content)) return { ok: false, error: "اكتب نص الشكوى أو الاقتراح" };
      return { ok: true };
    }

    case "disciplinary_action": {
      if (isEmpty(data.manager_name)) return { ok: false, error: "اكتب اسم المدير" };
      if (isEmpty(data.employee_name)) return { ok: false, error: "اكتب اسم الموظف" };
      if (isEmpty(data.description)) return { ok: false, error: "اكتب وصف المخالفة" };
      return { ok: true };
    }

    case "facility_quality":
    case "equipment_fault": {
      if (isEmpty(data.employee_name)) return { ok: false, error: "اكتب اسم الموظف" };
      if (isEmpty(data.branch)) return { ok: false, error: "حدد الفرع" };
      return { ok: true };
    }

    case "inventory_balance": {
      if (isEmpty(data.employee_name)) return { ok: false, error: "اكتب اسم الموظف" };
      if (isEmpty(data.branch)) return { ok: false, error: "حدد الفرع" };
      return { ok: true };
    }

    default: {
      // Generic fallback: at least one field beyond attachment must be filled.
      const meaningful = Object.entries(data).filter(
        ([k, v]) => k !== "attachment_url" && !isEmpty(v)
      );
      if (meaningful.length === 0)
        return { ok: false, error: "النموذج فارغ — الرجاء تعبئة الحقول المطلوبة" };
      return { ok: true };
    }
  }
}

/** Compute calendar days inclusive between two ISO dates (YYYY-MM-DD). */
export function diffDaysInclusive(from?: string, to?: string): number {
  if (!from || !to) return 0;
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Compute hours between two HH:MM strings on the same day. */
export function diffHours(from?: string, to?: string): number {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if ([fh, fm, th, tm].some(n => Number.isNaN(n))) return 0;
  const diff = th * 60 + tm - (fh * 60 + fm);
  if (diff <= 0) return 0;
  return Math.round((diff / 60) * 100) / 100;
}
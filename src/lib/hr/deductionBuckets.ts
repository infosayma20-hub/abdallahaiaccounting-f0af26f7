/**
 * بنود الخصومات (Deduction Buckets)
 * ------------------------------------------------------------------
 * مصدر واحد لأسماء بنود شاشة الخصومات، ولربط سطر السند ببند محدد.
 *
 * السياسة:
 *  - إذا لم يحدّد المحاسب البند → لا نكتب أي تجاوز، ويبقى التصنيف التلقائي
 *    القديم (classifyBucket في شاشة الخصومات) كما هو تماماً.
 *  - إذا حدّده → نثبّت البند في hr_deduction_bucket_overrides على معرّف
 *    حركة الموظف (employee_financial_movements.id) — وهي نفس الآلية التي
 *    تستعملها شاشة الخصومات عند التغيير اليدوي، فلا ازدواج ولا تضارب.
 */
import { supabase } from "@/integrations/supabase/client";

export type DeductionBucketKey =
  | "advance" | "loan" | "voucher" | "meal" | "penalty" | "purchase"
  | "transport" | "shortage" | "surplus" | "settlement" | "other";

export const DEDUCTION_BUCKET_ORDER: DeductionBucketKey[] = [
  "advance", "loan", "voucher", "meal", "penalty", "purchase",
  "transport", "shortage", "surplus", "settlement", "other",
];

export const DEDUCTION_BUCKET_LABELS: Record<DeductionBucketKey, string> = {
  advance: "سلف",
  loan: "قرض حسن",
  voucher: "سندات صرف",
  meal: "أكل",
  penalty: "مخالفات",
  purchase: "مشتريات",
  transport: "توصيل",
  shortage: "عجز",
  surplus: "فائض",
  settlement: "سداد",
  other: "أخرى",
};

/** البنود التي لها مقابل في employee_financial_movements.category */
const BUCKET_TO_CATEGORY: Partial<Record<DeductionBucketKey, string>> = {
  advance: "advance",
  loan: "loan_installment",
  meal: "food",
  penalty: "penalty",
  purchase: "purchase",
  transport: "transport",
  shortage: "cash_shortage",
  surplus: "cash_surplus",
  other: "other",
};

export const bucketToMovementCategory = (bucket: string | undefined | null): string | null =>
  (bucket && BUCKET_TO_CATEGORY[bucket as DeductionBucketKey]) || null;

export const isDeductionBucket = (v: unknown): v is DeductionBucketKey =>
  typeof v === "string" && (DEDUCTION_BUCKET_ORDER as string[]).includes(v);

interface SaveArgs {
  ownerId: string;
  createdBy?: string | null;
  /** employee_financial_movements.id */
  movementId: string;
  employeeName?: string | null;
  /** "" أو null = رجوع للتصنيف التلقائي (حذف التجاوز) */
  bucket?: string | null;
}

/** يثبّت/يحذف بند الخصم لحركة موظف واحدة. لا يرمي — يسجّل تحذيراً فقط. */
export async function saveDeductionBucketOverride({
  ownerId, createdBy, movementId, employeeName, bucket,
}: SaveArgs): Promise<void> {
  if (!ownerId || !movementId) return;
  try {
    if (!bucket || !isDeductionBucket(bucket)) {
      await (supabase as any)
        .from("hr_deduction_bucket_overrides")
        .delete()
        .eq("user_id", ownerId)
        .eq("source_id", movementId);
      return;
    }
    await (supabase as any)
      .from("hr_deduction_bucket_overrides")
      .upsert(
        {
          user_id: ownerId,
          source_id: movementId,
          employee_name: employeeName || null,
          bucket,
          reason: "محدَّد من سند الصرف",
          created_by: createdBy || null,
        },
        { onConflict: "user_id,source_id" },
      );
  } catch (e: any) {
    console.warn("[deductionBuckets] override save failed:", e?.message || e);
  }
}

/** يحذف تجاوزات بنود مرتبطة بحركات سيتم حذفها (سياسة delete & recreate) */
export async function clearDeductionBucketOverrides(ownerId: string, movementIds: string[]): Promise<void> {
  if (!ownerId || !movementIds.length) return;
  try {
    await (supabase as any)
      .from("hr_deduction_bucket_overrides")
      .delete()
      .eq("user_id", ownerId)
      .in("source_id", movementIds);
  } catch (e: any) {
    console.warn("[deductionBuckets] override cleanup failed:", e?.message || e);
  }
}

/** يقرأ التجاوزات المحفوظة لمجموعة حركات → Map(movementId → bucket) */
export async function fetchDeductionBucketOverrides(
  ownerId: string, movementIds: string[],
): Promise<Map<string, DeductionBucketKey>> {
  const map = new Map<string, DeductionBucketKey>();
  if (!ownerId || !movementIds.length) return map;
  const { data } = await (supabase as any)
    .from("hr_deduction_bucket_overrides")
    .select("source_id, bucket")
    .eq("user_id", ownerId)
    .in("source_id", movementIds);
  (data || []).forEach((r: any) => {
    if (isDeductionBucket(r.bucket)) map.set(String(r.source_id), r.bucket);
  });
  return map;
}

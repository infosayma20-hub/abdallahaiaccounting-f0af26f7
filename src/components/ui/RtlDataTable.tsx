/**
 * RtlDataTable — المعيار الموحّد لكل الجداول العربية في نظام أموالي.
 *
 * أي جدول عربي في النظام يجب أن يستخدم هذا المكوّن للحفاظ على:
 *   - اتجاه RTL كامل (container/header/body)
 *   - تصميم هيدر موحّد مطابق لجدول الحضور (#0D1B2E + نص أبيض)
 *   - ترتيب الأعمدة من اليمين إلى اليسار كما تُمرَّر في `columns`
 *
 * ⚠️ ممنوع كتابة <table>/<thead> يدوياً في التقارير. استخدم هذا المكوّن.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export type RtlColumnAlign = "right" | "center" | "left";

export interface RtlColumn<T> {
  key: string;
  /** عنوان العمود بالعربية */
  header: React.ReactNode;
  /** محاذاة الخلية (افتراضي right للنص). الأرقام والأزرار مركزية. */
  align?: RtlColumnAlign;
  /** عرض ثابت اختياري */
  width?: string | number;
  /** كلاس إضافي على خلية البودي */
  cellClassName?: string | ((row: T, i: number) => string);
  /** عرض مخصص للقيمة */
  render: (row: T, i: number) => React.ReactNode;
}

interface RtlDataTableProps<T> {
  columns: RtlColumn<T>[];
  rows: T[];
  /** يُستخدم لاستخراج مفتاح فريد لكل صف */
  rowKey: (row: T, i: number) => string | number;
  /** يظهر عند rows.length===0 */
  emptyMessage?: React.ReactNode;
  /** يظهر بدلاً من الصفوف عند التحميل */
  loading?: boolean;
  loadingMessage?: React.ReactNode;
  /** كلاس إضافي على التايبل */
  className?: string;
  /** كلاس إضافي على صف الـ tbody */
  rowClassName?: string | ((row: T, i: number) => string);
}

const alignClass = (a?: RtlColumnAlign) =>
  a === "center" ? "text-center" : a === "left" ? "text-left" : "text-right";

export function RtlDataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "لا توجد بيانات",
  loading = false,
  loadingMessage = "جاري التحميل...",
  className,
  rowClassName,
}: RtlDataTableProps<T>) {
  return (
    <div className="overflow-x-auto" dir="rtl">
      <table className={cn("w-full text-xs border-collapse", className)} dir="rtl">
        <thead dir="rtl">
          <tr className="bg-[#0D1B2E] hover:bg-[#0D1B2E]">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: typeof c.width === "number" ? `${c.width}px` : c.width } : undefined}
                className={cn(
                  "p-3 font-semibold text-white whitespace-nowrap",
                  alignClass(c.align)
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody dir="rtl">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {loadingMessage}
              </td>
            </tr>
          ) : !rows.length ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const rc = typeof rowClassName === "function" ? rowClassName(row, i) : rowClassName;
              return (
                <tr
                  key={rowKey(row, i)}
                  className={cn("border-b border-border/40 hover:bg-muted/20", rc)}
                >
                  {columns.map((c) => {
                    const cc =
                      typeof c.cellClassName === "function" ? c.cellClassName(row, i) : c.cellClassName;
                    return (
                      <td key={c.key} className={cn("p-3", alignClass(c.align), cc)}>
                        {c.render(row, i)}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default RtlDataTable;
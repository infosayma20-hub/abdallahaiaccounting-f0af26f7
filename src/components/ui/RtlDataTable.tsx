/**
 * RtlDataTable — المعيار الموحّد لكل الجداول العربية في نظام يونيفاي.
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
  /** نقر على الصف (اختياري) — يُستخدم لتحديد السطر في الشاشات بأسلوب Dynamics */
  onRowClick?: (row: T, i: number) => void;
  /**
   * على الجوال يتحوّل الجدول تلقائياً إلى بطاقات (تسمية: قيمة).
   * مرّر false لإبقاء الجدول كما هو مع تمرير أفقي.
   */
  mobileCards?: boolean;
  /** مفتاح العمود الذي يُستخدم كعنوان للبطاقة على الجوال (افتراضي: أول عمود) */
  mobileTitleKey?: string;
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
  onRowClick,
  mobileCards = true,
  mobileTitleKey,
}: RtlDataTableProps<T>) {
  const titleCol = mobileTitleKey
    ? columns.find((c) => c.key === mobileTitleKey) || columns[0]
    : columns[0];
  const restCols = columns.filter((c) => c !== titleCol);

  return (
    <>
      {mobileCards && (
        <div className={cn("md:hidden divide-y divide-border/50", className)} dir="rtl">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-xs">{loadingMessage}</div>
          ) : !rows.length ? (
            <div className="p-6 text-center text-muted-foreground text-xs">{emptyMessage}</div>
          ) : (
            rows.map((row, i) => {
              const rc = typeof rowClassName === "function" ? rowClassName(row, i) : rowClassName;
              return (
                <div
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                  className={cn(
                    "p-3 space-y-2 active:bg-muted/40",
                    onRowClick && "cursor-pointer",
                    rc
                  )}
                >
                  <div className="text-sm font-semibold text-foreground break-words">
                    {titleCol?.render(row, i)}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {restCols.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[10px] text-muted-foreground truncate">{c.header}</dt>
                        <dd className="text-xs font-medium break-words">{c.render(row, i)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })
          )}
        </div>
      )}

    <div className={cn("overflow-x-auto", mobileCards && "hidden md:block")} dir="rtl">
      <table className={cn("w-full text-xs border-collapse", !mobileCards && className)} dir="rtl">
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
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
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
    </>
  );
}

export default RtlDataTable;
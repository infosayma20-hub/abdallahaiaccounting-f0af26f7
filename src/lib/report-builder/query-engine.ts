// محرك تنفيذ الاستعلامات والتجميع
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { DataSourceDef } from "./data-sources";

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  contactId?: string;
  status?: string;
  paymentMethod?: string;
  branchName?: string;
  category?: string;
  searchText?: string;
}

export interface RunReportParams {
  source: DataSourceDef;
  userId: string;
  filters: ReportFilters;
  groupBy?: string; // none/day/week/month/year/<fieldKey>
  sortBy?: { key: string; dir: "asc" | "desc" }[];
  page?: number; // 1-indexed
  pageSize?: number;
  selectedColumns?: string[]; // for narrow SELECT optimization
}

export interface RunReportResult {
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
  durationMs: number;
}

const ALWAYS_FIELDS_BY_SOURCE: Record<string, string[]> = {
  sales: ["id", "invoice_date", "total_amount", "paid_amount", "contact_id", "invoice_type"],
  purchases: ["id", "invoice_date", "total_amount", "paid_amount", "contact_id", "invoice_type"],
  inventory: ["id"],
};

function buildSelectClause(source: DataSourceDef, selectedColumns?: string[]) {
  if (!selectedColumns || selectedColumns.length === 0) return source.selectQuery;
  const always = ALWAYS_FIELDS_BY_SOURCE[source.key] || ["id"];
  // Tokens actually present in the source's selectQuery (exact match, not substring).
  const available = new Set(source.selectQuery.split(",").map((s) => s.trim()));
  const set = new Set<string>();
  const add = (c: string) => {
    if (available.has(c)) set.add(c);
  };
  [...always, source.dateColumn, ...selectedColumns].forEach(add);
  if (source.fixedFilter) add(source.fixedFilter.column);
  ["status", "payment_status", "payment_method", "category", "invoice_number", "contact_name", "name", "sku"].forEach(add);
  // Always include id as a safety net.
  set.add("id");
  return Array.from(set).join(", ");
}

export async function runReport({
  source,
  userId,
  filters,
  groupBy,
  sortBy,
  page = 1,
  pageSize = 50,
  selectedColumns,
}: RunReportParams): Promise<RunReportResult> {
  const t0 = performance.now();
  const isGrouped = !!groupBy && groupBy !== "none";

  const selectClause = buildSelectClause(source, selectedColumns);

  const buildBase = () => {
    let q: any = (supabase as any).from(source.table).select(selectClause, { count: "exact" }).eq("user_id", userId);
    // Source-level fixed filter (e.g. invoice_type='sale'/'purchase')
    if (source.fixedFilter) q = q.eq(source.fixedFilter.column, source.fixedFilter.value);
    if (filters.dateFrom) q = q.gte(source.dateColumn, filters.dateFrom);
    if (filters.dateTo) q = q.lte(source.dateColumn, filters.dateTo);
    if (filters.contactId && source.contactFilter) q = q.eq(source.contactFilter.column, filters.contactId);
    if (filters.status && source.statusValues?.includes(filters.status)) {
      const statusCol = source.table === "invoices" ? "payment_status" : "status";
      q = q.eq(statusCol as any, filters.status);
    }
    if (filters.paymentMethod && source.table === "invoices") q = q.eq("payment_method" as any, filters.paymentMethod);
    if (filters.category && source.table === "products") q = q.eq("category" as any, filters.category);
    return q;
  };

  let query = buildBase();

  // Sorting
  if (sortBy && sortBy.length > 0) {
    sortBy.forEach((s) => {
      query = query.order(s.key as any, { ascending: s.dir === "asc" });
    });
  } else {
    query = query.order(source.dateColumn as any, { ascending: false });
  }

  if (isGrouped) {
    // Cap aggregation source to 5000 most-recent rows to protect performance.
    query = query.limit(5000);
  } else {
    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  let rows = (data as any[]) || [];

  // Text search (client-side over current page)
  if (filters.searchText) {
    const q = filters.searchText.toLowerCase();
    rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }

  if (isGrouped && groupBy) {
    rows = applyGroupBy(rows, groupBy, source);
  }

  return {
    rows,
    total: typeof count === "number" ? count : rows.length,
    page,
    pageSize,
    durationMs: Math.round(performance.now() - t0),
  };
}

function applyGroupBy(rows: any[], groupBy: string, source: DataSourceDef) {
  const buckets: Record<string, { key: string; label: string; rows: any[]; count: number; total: number; paid: number }> = {};

  const dateBuckets = ["day", "week", "month", "year"];
  const isDateBucket = dateBuckets.includes(groupBy);

  rows.forEach((row) => {
    let bucketKey: string;
    let bucketLabel: string;

    if (isDateBucket) {
      const dateVal = row[source.dateColumn];
      if (!dateVal) return;
      const d = typeof dateVal === "string" ? parseISO(dateVal) : new Date(dateVal);
      switch (groupBy) {
        case "day":
          bucketKey = format(d, "yyyy-MM-dd");
          bucketLabel = format(d, "yyyy-MM-dd");
          break;
        case "week":
          bucketKey = format(startOfWeek(d), "yyyy-MM-dd");
          bucketLabel = `أسبوع ${format(startOfWeek(d), "yyyy-MM-dd")}`;
          break;
        case "month":
          bucketKey = format(startOfMonth(d), "yyyy-MM");
          bucketLabel = format(d, "yyyy-MM");
          break;
        case "year":
          bucketKey = format(startOfYear(d), "yyyy");
          bucketLabel = format(d, "yyyy");
          break;
        default:
          bucketKey = "—";
          bucketLabel = "—";
      }
    } else {
      bucketKey = String(row[groupBy] ?? "—");
      bucketLabel = bucketKey;
    }

    if (!buckets[bucketKey]) {
      buckets[bucketKey] = { key: bucketKey, label: bucketLabel, rows: [], count: 0, total: 0, paid: 0 };
    }
    buckets[bucketKey].rows.push(row);
    buckets[bucketKey].count++;
    buckets[bucketKey].total += Number(row.total_amount || row.quantity * row.buy_price || 0);
    buckets[bucketKey].paid += Number(row.paid_amount || 0);
  });

  return Object.values(buckets)
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((b) => ({
      _group: b.label,
      _count: b.count,
      total_amount: b.total,
      paid_amount: b.paid,
      _drillRows: b.rows,
    }));
}

// Calculate KPIs
export function calculateKPIs(rows: any[], source: DataSourceDef, totalCount?: number) {
  if (!rows.length) return [];
  const isGrouped = "_group" in (rows[0] || {});

  const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  const count = isGrouped
    ? rows.reduce((s, r) => s + (r._count || 0), 0)
    : typeof totalCount === "number"
    ? totalCount
    : rows.length;

  if (source.key === "inventory") {
    const totalQty = rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
    const totalCost = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.buy_price || 0), 0);
    return [
      { label: "عدد الأصناف", value: count.toLocaleString(), color: "primary" },
      { label: "إجمالي الكميات", value: totalQty.toLocaleString(), color: "muted" },
      { label: "قيمة المخزون (تكلفة)", value: `₪${totalCost.toLocaleString()}`, color: "primary" },
    ];
  }

  return [
    { label: source.key === "sales" ? "عدد الفواتير" : "عدد العمليات", value: count.toLocaleString(), color: "primary" },
    { label: "الإجمالي", value: `₪${totalAmount.toLocaleString()}`, color: "primary" },
    { label: "المدفوع", value: `₪${totalPaid.toLocaleString()}`, color: "muted" },
    {
      label: "المتبقي",
      value: `₪${(totalAmount - totalPaid).toLocaleString()}`,
      color: totalAmount - totalPaid > 0 ? "destructive" : "muted",
    },
  ];
}

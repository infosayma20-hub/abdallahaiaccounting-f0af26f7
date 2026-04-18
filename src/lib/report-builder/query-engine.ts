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
}

export async function runReport({ source, userId, filters, groupBy, sortBy }: RunReportParams) {
  let query = supabase
    .from(source.table as any)
    .select(source.selectQuery)
    .eq("user_id", userId);

  // Date filter
  if (filters.dateFrom) query = query.gte(source.dateColumn, filters.dateFrom);
  if (filters.dateTo) query = query.lte(source.dateColumn, filters.dateTo);

  // Contact filter
  if (filters.contactId && source.contactFilter) {
    query = query.eq(source.contactFilter.column, filters.contactId);
  }

  // Status
  if (filters.status && source.statusValues?.includes(filters.status)) {
    query = query.eq("status" as any, filters.status);
  }

  if (filters.paymentMethod) {
    query = query.eq("payment_method" as any, filters.paymentMethod);
  }
  if (filters.branchName) {
    query = query.eq("branch_name" as any, filters.branchName);
  }
  if (filters.category) {
    query = query.eq("category" as any, filters.category);
  }

  // Soft-delete safety
  query = query.or("is_deleted.is.null,is_deleted.eq.false" as any);

  // Sorting
  if (sortBy && sortBy.length > 0) {
    sortBy.forEach(s => {
      query = query.order(s.key as any, { ascending: s.dir === "asc" });
    });
  } else {
    query = query.order(source.dateColumn as any, { ascending: false });
  }

  query = query.limit(2000);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data as any[]) || [];

  // Text search (client-side)
  if (filters.searchText) {
    const q = filters.searchText.toLowerCase();
    rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }

  // Group By
  if (groupBy && groupBy !== "none") {
    rows = applyGroupBy(rows, groupBy, source);
  }

  return rows;
}

function applyGroupBy(rows: any[], groupBy: string, source: DataSourceDef) {
  const buckets: Record<string, { key: string; label: string; rows: any[]; count: number; total: number; paid: number }> = {};

  const dateBuckets = ["day", "week", "month", "year"];
  const isDateBucket = dateBuckets.includes(groupBy);

  rows.forEach(row => {
    let bucketKey: string;
    let bucketLabel: string;

    if (isDateBucket) {
      const dateVal = row[source.dateColumn];
      if (!dateVal) return;
      const d = typeof dateVal === "string" ? parseISO(dateVal) : new Date(dateVal);
      switch (groupBy) {
        case "day": bucketKey = format(d, "yyyy-MM-dd"); bucketLabel = format(d, "yyyy-MM-dd"); break;
        case "week": bucketKey = format(startOfWeek(d), "yyyy-MM-dd"); bucketLabel = `أسبوع ${format(startOfWeek(d), "yyyy-MM-dd")}`; break;
        case "month": bucketKey = format(startOfMonth(d), "yyyy-MM"); bucketLabel = format(d, "yyyy-MM"); break;
        case "year": bucketKey = format(startOfYear(d), "yyyy"); bucketLabel = format(d, "yyyy"); break;
        default: bucketKey = "—"; bucketLabel = "—";
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
    .map(b => ({
      _group: b.label,
      _count: b.count,
      total_amount: b.total,
      paid_amount: b.paid,
      _drillRows: b.rows,
    }));
}

// Calculate KPIs
export function calculateKPIs(rows: any[], source: DataSourceDef) {
  if (!rows.length) return [];
  const isGrouped = "_group" in (rows[0] || {});

  const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  const count = isGrouped ? rows.reduce((s, r) => s + (r._count || 0), 0) : rows.length;

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
    { label: "المتبقي", value: `₪${(totalAmount - totalPaid).toLocaleString()}`, color: totalAmount - totalPaid > 0 ? "destructive" : "muted" },
  ];
}

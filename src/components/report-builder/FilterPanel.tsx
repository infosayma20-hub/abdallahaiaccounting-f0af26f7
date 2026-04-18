import { Calendar, Search, User, Tag, CreditCard, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataSourceDef, STATUS_LABELS, GROUP_BY_OPTIONS } from "@/lib/report-builder/data-sources";
import { ReportFilters } from "@/lib/report-builder/query-engine";

interface Props {
  source: DataSourceDef;
  filters: ReportFilters;
  onChange: (f: ReportFilters) => void;
  groupBy: string;
  onGroupByChange: (g: string) => void;
  onRun: () => void;
  loading?: boolean;
}

export default function FilterPanel({ source, filters, onChange, groupBy, onGroupByChange, onRun, loading }: Props) {
  const update = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  // Build group-by options including data fields with groupable flag
  const groupableFields = source.fields.filter(f => f.groupable);
  const allGroupOpts = [
    ...GROUP_BY_OPTIONS,
    ...groupableFields.map(f => ({ key: f.key, label: `حسب ${f.label}` })),
  ];

  return (
    <div className="space-y-3 p-4 rounded-2xl bg-muted/30 border border-border/40" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {/* Date range */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> من تاريخ
          </label>
          <Input
            type="date"
            value={filters.dateFrom || ""}
            onChange={e => update({ dateFrom: e.target.value })}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> إلى تاريخ
          </label>
          <Input
            type="date"
            value={filters.dateTo || ""}
            onChange={e => update({ dateTo: e.target.value })}
            className="h-9 text-xs"
          />
        </div>

        {/* Search */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Search className="h-3 w-3" /> بحث نصي
          </label>
          <Input
            placeholder="ابحث..."
            value={filters.searchText || ""}
            onChange={e => update({ searchText: e.target.value })}
            className="h-9 text-xs"
          />
        </div>

        {/* Status (if available) */}
        {source.statusValues && source.statusValues.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">الحالة</label>
            <Select value={filters.status || "all"} onValueChange={v => update({ status: v === "all" ? undefined : v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {source.statusValues.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Payment method (sales/purchases only) */}
        {(source.key === "sales" || source.key === "purchases") && (
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> طريقة الدفع
            </label>
            <Select value={filters.paymentMethod || "all"} onValueChange={v => update({ paymentMethod: v === "all" ? undefined : v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="card">بطاقة</SelectItem>
                <SelectItem value="transfer">تحويل</SelectItem>
                <SelectItem value="cheque">شيك</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Group By */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">التجميع</label>
          <Select value={groupBy} onValueChange={onGroupByChange}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allGroupOpts.map(opt => (
                <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={onRun} disabled={loading} size="sm" className="gap-2 h-9">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          تشغيل التقرير
        </Button>
      </div>
    </div>
  );
}

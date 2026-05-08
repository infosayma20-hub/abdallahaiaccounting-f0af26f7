# Report Table UI — Canonical Spec (P0)

Reference implementation: **HR Attendance** (`src/pages/HRAttendancePage.tsx`)
and `SortableReportTable` + `ReportMetadataBar` as already wired by
`GenericReportPage`. This is the single source of truth for all report
screens going forward.

## Layout (RTL)

```
┌─────────────────────────────────────────────────────────────┐
│  [← back]  Title (right)            [Excel] [Print] (left)  │
│            Subtitle / description                            │
├─────────────────────────────────────────────────────────────┤
│  Filter toolbar: من [date] إلى [date]  [extra] [تحديث]      │
├─────────────────────────────────────────────────────────────┤
│  Optional KPI strip (4-up grid, print:grid-cols-4)          │
├─────────────────────────────────────────────────────────────┤
│  Table (SortableReportTable)                                │
│   - Navy header (#0A2342), gold accent, white text          │
│   - Centered header labels                                  │
│   - Sticky first column when needed                         │
│   - Per-column filter + sort + visibility toggle            │
│   - Totals row (background navy, white)                     │
├─────────────────────────────────────────────────────────────┤
│  Footer: ReportMetadataBar                                  │
│   source · filters · user · generatedAt                     │
└─────────────────────────────────────────────────────────────┘
```

## Mandatory pieces

| Slot              | Component                                  |
| ----------------- | ------------------------------------------ |
| Page wrapper      | `<div dir="rtl" className="space-y-4 …">`  |
| Title block       | `BackButton` + h1 + subtitle               |
| Actions           | Right side: `<Button>` cluster             |
| Filters           | `<Card className="p-3 …">` toolbar         |
| Table             | `SortableReportTable`                      |
| Empty state       | `ReportEmptyState`                         |
| Loading           | 6× skeleton rows (`animate-pulse`)         |
| Status badge      | `ReportStatusBadge` (reconciliation only)  |
| Footer            | `ReportMetadataBar`                        |
| Print             | `printGenericReport()` (NOT window.print)  |
| Excel             | `exportToExcel()` from report-export       |

## Print rules

- Print button MUST open a new window via `printGenericReport`.
- Never `window.print()` on the live app page.
- App chrome (sidebar, top nav, help bubble, tabs, debug, filter
  toolbar UI) MUST NOT appear in print output.
- See `src/lib/reports/report-print.ts` for the canonical print HTML.

## Debug toggle

- Debug button is **DEV-only**: gated by `import.meta.env.DEV`.
- `debugMode` state is force-initialized to `false` in production
  regardless of `localStorage["amwali:reports:debug"]`.
- `toggleDebug` is a no-op in production.

## Design tokens

- Primary navy: `hsl(var(--primary))` → renders `#0D1B2E`.
- Gold accent: `#4A9EE8` (table header underline only).
- Debit / positive: `text-green-600` / `text-emerald-600`.
- Credit / negative: `text-red-500` / `text-destructive`.
- Never hard-code other colors — always use semantic tokens.

## Migration order (P1, do not start yet)

1. Trial Balance, Profit & Loss, Balance Sheet — wrap with `ReportPageShell`,
   add `ReportMetadataBar`.
2. POSReportsPage tabs — replace custom render branches with
   `SortableReportTable`.
3. PeriodicReportsPage (tax) — same.
4. AccountStatementV2Page — keep its own print, but replace hard-coded
   color literals with semantic tokens.
5. HR Leave / HR Payroll / HR StaffCost — migrate into `ReportPageShell`.
6. Legacy module reports (Van, Customer, CallCenter, RepReports,
   TravelReports, StoreTrackerReports) — align or formally exempt.
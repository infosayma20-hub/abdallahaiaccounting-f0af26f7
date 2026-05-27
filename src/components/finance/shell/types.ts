/**
 * Finance Shell — shared types
 * Inspired by Microsoft Dynamics 365 Finance & Operations layout patterns
 * (Action Pane, Filters, My Views, FastTabs) — RTL-first.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface ActionItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  shortcut?: string; // e.g. "Alt+N"
  tooltip?: string;
}

export interface ActionGroup {
  key: string;
  label: string; // e.g. "جديد", "إجراءات", "طباعة"
  items: ActionItem[];
}

export interface ActionTab {
  key: string;
  label: string; // e.g. "عام", "فاتورة", "تحصيل"
  groups: ActionGroup[];
}

export type FilterOperator =
  | "begins_with"
  | "contains"
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "between"
  | "is_empty"
  | "is_not_empty";

export type FilterFieldType = "text" | "number" | "date" | "option";

export interface FilterField {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: { value: string; label: string }[];
}

export interface FilterCondition {
  id: string;
  fieldKey: string;
  operator: FilterOperator;
  value: string;
  valueTo?: string; // for between
}

export interface SavedView {
  id: string;
  name: string;
  filters: FilterCondition[];
  sort?: { fieldKey: string; direction: "asc" | "desc" } | null;
  visibleColumns?: string[];
  createdAt: string;
  isDefault?: boolean;
}

export interface FinanceShellProps {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actionTabs?: ActionTab[];
  filterFields?: FilterField[];
  storageKey?: string; // for MyViews persistence (per page)
  filters?: FilterCondition[];
  onFiltersChange?: (filters: FilterCondition[]) => void;
  rightSlot?: ReactNode;
  children: ReactNode;
}
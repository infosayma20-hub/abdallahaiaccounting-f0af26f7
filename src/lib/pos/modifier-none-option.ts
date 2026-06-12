/**
 * Synthetic "بدون ملاحظة" option injected into single-select modifier groups
 * so cashiers aren't forced to pick when nothing applies. Filtered out from
 * the modifiers actually sent to the order.
 */
export const NONE_OPTION_ID = "__none__";
export const NONE_OPTION_NAME = "بدون ملاحظة";

interface ModOption {
  id: string;
  name: string;
  extra_price: number;
  is_default: boolean;
  color: string | null;
  sort_order: number;
}

interface ModGroup {
  id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: ModOption[];
}

export function augmentGroupsWithNone<G extends ModGroup>(groups: G[]): G[] {
  return groups.map((g) => {
    if (g.selection_type !== "single") return g;
    if (g.options.some((o) => o.id === NONE_OPTION_ID)) return g;
    const hasRealDefault = g.options.some((o) => o.is_default);
    const noneOption: ModOption = {
      id: NONE_OPTION_ID,
      name: NONE_OPTION_NAME,
      extra_price: 0,
      is_default: !hasRealDefault,
      color: null,
      sort_order: -1,
    };
    return { ...g, options: [noneOption, ...g.options.map((o) => ({ ...o, is_default: hasRealDefault ? o.is_default : false }))] };
  });
}

export const isNoneOptionId = (id: string) => id === NONE_OPTION_ID;

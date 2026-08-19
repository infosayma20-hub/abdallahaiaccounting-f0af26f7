/** أصناف نموذج «رصيد الأصناف اليومي» — مصدر واحد للتعبئة وللاطلاع. */
export const INVENTORY_BALANCE_ITEMS: { key: string; label: string; required: boolean }[] = [
  { key: "chicken", label: "دجاج", required: true },
  { key: "mshab", label: "مسحب", required: true },
  { key: "wings", label: "اجنحة", required: true },
  { key: "burger_fresh", label: "لحصة برغر فريش", required: false },
  { key: "chicken_burger", label: "برغر دجاج", required: false },
  { key: "mutawama", label: "متومة", required: true },
  { key: "cabbage", label: "ملفوف", required: true },
  { key: "phino_sandwich", label: "فينو سندويش", required: true },
  { key: "phino_burger", label: "فينو برجر", required: true },
  { key: "mini_burger", label: "ميني برجر", required: true },
  { key: "fries", label: "بطاطا", required: true },
];

export const INVENTORY_BALANCE_LABELS: Record<string, string> = Object.fromEntries(
  INVENTORY_BALANCE_ITEMS.map((i) => [i.key, i.label]),
);

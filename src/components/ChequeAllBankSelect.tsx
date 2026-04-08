import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

const COMMON_BANKS = [
  "بنك فلسطين",
  "البنك العربي",
  "بنك القدس",
  "البنك الوطني",
  "البنك الإسلامي الفلسطيني",
  "البنك الإسلامي العربي",
  "بنك الاستثمار الفلسطيني",
  "بنك الأردن",
  "البنك الأهلي الأردني",
  "بنك القاهرة عمان",
  "بنك الإسكان للتجارة والتمويل",
  "البنك التجاري الأردني",
  "بنك صفوة الإسلامي",
  "بنك الاتحاد",
  "بنك لئومي",
  "بنك هبوعليم",
  "بنك ديسكونت",
  "بنك مزراحي طفحوت",
  "بنك مركنتيل",
  "بنك البريد",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  userBanks: { id: string; bank_name: string }[];
}

export default function ChequeAllBankSelect({ value, onChange, userBanks }: Props) {
  const [addingCustom, setAddingCustom] = useState(false);
  const [customBank, setCustomBank] = useState("");

  // Merge user banks + common banks, deduplicate
  const userBankNames = [...new Set(userBanks.map(b => b.bank_name).filter(Boolean))];
  const allBanks = [...new Set([...userBankNames, ...COMMON_BANKS])];

  // If current value is custom (not in list), add it
  if (value && !allBanks.includes(value)) {
    allBanks.push(value);
  }

  if (addingCustom) {
    return (
      <div className="flex gap-1">
        <Input
          value={customBank}
          onChange={e => setCustomBank(e.target.value)}
          placeholder="اسم البنك..."
          className="h-9 text-xs flex-1"
          autoFocus
          onKeyDown={e => {
            if (e.key === "Enter" && customBank.trim()) {
              onChange(customBank.trim());
              setAddingCustom(false);
              setCustomBank("");
            } else if (e.key === "Escape") {
              setAddingCustom(false);
              setCustomBank("");
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (customBank.trim()) {
              onChange(customBank.trim());
            }
            setAddingCustom(false);
            setCustomBank("");
          }}
          className="px-2 h-9 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          ✓
        </button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={v => {
      if (v === "__add_custom__") {
        setAddingCustom(true);
      } else {
        onChange(v);
      }
    }}>
      <SelectTrigger className="h-9 text-xs">
        <SelectValue placeholder="اختر البنك" />
      </SelectTrigger>
      <SelectContent>
        {userBankNames.length > 0 && (
          <>
            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground">بنوكك المعرّفة</div>
            {userBankNames.map(name => (
              <SelectItem key={`user-${name}`} value={name}>{name}</SelectItem>
            ))}
            <div className="border-t border-border my-1" />
          </>
        )}
        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground">جميع البنوك</div>
        {COMMON_BANKS.filter(b => !userBankNames.includes(b)).map(name => (
          <SelectItem key={name} value={name}>{name}</SelectItem>
        ))}
        <div className="border-t border-border my-1" />
        <SelectItem value="__add_custom__">
          <span className="flex items-center gap-1 text-primary">
            <Plus className="h-3 w-3" /> إضافة بنك آخر
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

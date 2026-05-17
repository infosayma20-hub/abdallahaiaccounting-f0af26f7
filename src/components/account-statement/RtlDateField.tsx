import TypedDateInput from "@/components/forms/TypedDateInput";

/**
 * RTL-safe date field for the Account Statement toolbar.
 * Wraps the shared TypedDateInput (same component used in invoices) in a
 * compact h-7 footprint suitable for the report header.
 */

interface Props {
  value: string;          // ISO yyyy-mm-dd
  onChange: (v: string) => void;
  label?: string;
  ariaLabel?: string;
}

export default function RtlDateField({ value, onChange, label, ariaLabel }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {label && (
        <span className="text-[10px] font-semibold text-muted-foreground select-none">
          {label}
        </span>
      )}
      <TypedDateInput
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel || label}
        className="w-[130px]"
        inputProps={{
          className:
            "!h-7 !rounded !pr-8 !pl-2 !text-xs tabular-nums",
        }}
      />
    </div>
  );
}

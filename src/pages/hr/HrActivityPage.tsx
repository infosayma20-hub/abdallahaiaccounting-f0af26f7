import { HrActivitySummary } from "./components/HrActivitySummary";

/** شاشة ملخص النشاطات — تُحمَّل فقط عند فتح بطاقتها من لوحة الموارد البشرية. */
export default function HrActivityPage() {
  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-8" dir="rtl">
      <HrActivitySummary />
    </div>
  );
}

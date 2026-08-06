/** بوابة الإدارة — ملخص تتبع الطلبيات (آخر 7 أيام) مع أعلى التأخيرات. */
import POSOrderTrackingReport from "@/components/pos-reports/POSOrderTrackingReport";

export default function PortalOrderTrackingTab() {
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - 6 * 86400000);
  return (
    <div className="p-3 space-y-3" dir="rtl">
      <h2 className="text-sm font-bold">تتبع الطلبيات — آخر 7 أيام</h2>
      <POSOrderTrackingReport dateFrom={dateFrom} dateTo={dateTo} branchIds={[]} />
    </div>
  );
}

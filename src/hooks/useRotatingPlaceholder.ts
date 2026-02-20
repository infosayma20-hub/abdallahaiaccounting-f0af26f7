import { useState, useEffect } from "react";

const placeholders = [
  "قبضت 1000 شيكل من الزبون علي حجاج نقداً",
  "دفعت 500 شيكل للمورد حنين صايمة من الصندوق",
  "حولت 2000 شيكل من الصندوق إلى البنك",
  "سددت 750 شيكل للمورد خالد حسين عبر البنك",
  "استلمت 1200 شيكل من الزبون سالم صايمة إلى البنك",
  "اشتريت بضاعة بقيمة 1500 شيكل ودفعنا نقداً",
  "دفعت مصاريف كهرباء 300 شيكل من البنك",
  "سحبت 400 شيكل من البنك إلى الصندوق",
  "سجلت فاتورة مبيعات 2500 شيكل للزبون علي حجاج",
  "دفعت راتب 2000 شيكل من الصندوق",
];

export function useRotatingPlaceholder(interval = 3000) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % placeholders.length);
    }, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return placeholders[index];
}

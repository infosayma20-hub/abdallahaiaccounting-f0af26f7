import { useState, useEffect } from "react";

const placeholders = [
  "قبضت 500 من أحمد",
  "دفعت كهرباء 100",
  "اشتريت بضاعة 1500",
  "حولت 200 للبنك",
  "صرفت بنزين 50",
  "سحبت من البنك 1000",
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

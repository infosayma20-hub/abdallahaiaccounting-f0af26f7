export interface BusinessDay {
  date: Date;
  dateStr: string;
  label: string;
  isActive: boolean;
  isBetweenShifts: boolean;
  shiftStart: Date;
  shiftEnd: Date;
}

export function getBusinessDay(): BusinessDay {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 0 && hour < 4) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const shiftStart = new Date(yesterday);
    shiftStart.setHours(9, 0, 0, 0);
    return {
      date: yesterday,
      dateStr: formatDateStr(yesterday),
      label: 'أمس (الوردية لا تزال جارية)',
      isActive: true,
      isBetweenShifts: false,
      shiftStart,
      shiftEnd: now,
    };
  } else if (hour >= 4 && hour < 9) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const shiftStart = new Date(yesterday);
    shiftStart.setHours(9, 0, 0, 0);
    const shiftEnd = new Date(now);
    shiftEnd.setHours(4, 0, 0, 0);
    return {
      date: yesterday,
      dateStr: formatDateStr(yesterday),
      label: 'آخر يوم عمل مكتمل',
      isActive: false,
      isBetweenShifts: true,
      shiftStart,
      shiftEnd,
    };
  } else {
    const shiftStart = new Date(now);
    shiftStart.setHours(9, 0, 0, 0);
    return {
      date: now,
      dateStr: formatDateStr(now),
      label: 'اليوم (وردية جارية)',
      isActive: true,
      isBetweenShifts: false,
      shiftStart,
      shiftEnd: now,
    };
  }
}

function formatDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function formatArabicTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'م' : 'ص';
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function formatArabicDate(date: Date): string {
  return date.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getShiftRangeForDate(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const start = new Date(d);
  start.setHours(9, 0, 0, 0);
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  end.setHours(4, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

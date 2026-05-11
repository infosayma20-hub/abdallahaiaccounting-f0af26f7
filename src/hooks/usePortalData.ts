import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type BusinessDay } from '@/lib/portal-business-day';

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCalendarRangeForDate(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: start,
    endDate: end,
  };
}

export interface BranchSales {
  id: string;
  name: string;
  location: string;
  totalSales: number;
  orderCount: number;
  avgOrder: number;
  lastOrderAt: string | null;
  hourlySales: Record<string, number>;
  topMeals: { name: string; quantity: number; revenue: number }[];
}

export interface SalesData {
  totalSales: number;
  orderCount: number;
  avgOrderValue: number;
  topBranch: { name: string; sales: number } | null;
  branches: BranchSales[];
}

export interface CashBoxData {
  id: string;
  name: string;
  branchLocation: string;
  currency: string;
  balance: number;
  isActive: boolean;
  type: string;
}

export interface LiquidityData {
  exchangeRates: { jod: number; usd: number };
  cashBoxes: CashBoxData[];
}

export function usePortalData(userId: string | undefined) {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [liquidityData, setLiquidityData] = useState<LiquidityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [businessDay, setBusinessDay] = useState<BusinessDay>(() => {
    const now = new Date();
    const today = getCalendarRangeForDate(formatLocalDate(now));
    return {
      date: now,
      dateStr: formatLocalDate(now),
      label: 'اليوم',
      isActive: true,
      isBetweenShifts: false,
      shiftStart: today.startDate,
      shiftEnd: now,
    };
  });
  const intervalRef = useRef<number>();

  const fetchData = useCallback(async (customDate?: string, customDateTo?: string) => {
    if (!userId) return;
    try {
      setLoading(true);
      let shiftStart: string;
      let shiftEnd: string;
      let bd: BusinessDay;

      if (customDate && customDateTo) {
        // Date range mode
        const rangeStart = getCalendarRangeForDate(customDate);
        const rangeEnd = getCalendarRangeForDate(customDateTo);
        shiftStart = rangeStart.start;
        shiftEnd = rangeEnd.end;
        const d = new Date(`${customDate}T00:00:00`);
        bd = {
          date: d, dateStr: customDate,
          label: 'فترة مخصصة', isActive: false,
          isBetweenShifts: false, shiftStart: rangeStart.startDate, shiftEnd: rangeEnd.endDate,
        };
      } else if (customDate) {
        const range = getCalendarRangeForDate(customDate);
        shiftStart = range.start;
        shiftEnd = range.end;
        const d = new Date(`${customDate}T00:00:00`);
        bd = {
          date: d, dateStr: customDate,
          label: 'تاريخ محدد', isActive: customDate === formatLocalDate(new Date()),
          isBetweenShifts: false, shiftStart: range.startDate, shiftEnd: range.endDate,
        };
      } else {
        const now = new Date();
        const todayStr = formatLocalDate(now);
        const range = getCalendarRangeForDate(todayStr);
        shiftStart = range.start;
        shiftEnd = now.toISOString();
        bd = {
          date: now,
          dateStr: todayStr,
          label: 'اليوم',
          isActive: true,
          isBetweenShifts: false,
          shiftStart: range.startDate,
          shiftEnd: now,
        };
      }

      setBusinessDay(bd);

      const { data, error } = await supabase.functions.invoke('malaki-data', {
        body: { action: 'dashboard', shiftStart, shiftEnd },
      });
      if (error) throw error;
      if (data) {
        setSalesData(data.sales || null);
        setLiquidityData(data.liquidity || null);
        setNeedsSetup(data.needsSetup || false);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Portal data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
    // Background refresh while the tab is visible only — never on tab focus,
    // so returning to Amwali from another tab does not flash a loading state.
    intervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchData();
    }, 15000);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return { salesData, liquidityData, loading, needsSetup, lastUpdated, businessDay, refresh: fetchData };
}

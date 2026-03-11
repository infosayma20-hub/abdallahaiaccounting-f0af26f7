import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getBusinessDay, getShiftRangeForDate, type BusinessDay } from '@/lib/portal-business-day';

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
  const [businessDay, setBusinessDay] = useState<BusinessDay>(getBusinessDay());
  const intervalRef = useRef<number>();

  const fetchData = useCallback(async (customDate?: string) => {
    if (!userId) return;
    try {
      let shiftStart: string;
      let shiftEnd: string;
      let bd: BusinessDay;

      if (customDate) {
        const range = getShiftRangeForDate(customDate);
        shiftStart = range.start;
        shiftEnd = range.end;
        const d = new Date(customDate + 'T00:00:00');
        bd = {
          date: d, dateStr: customDate,
          label: 'تاريخ محدد', isActive: false,
          isBetweenShifts: false, shiftStart: new Date(shiftStart), shiftEnd: new Date(shiftEnd),
        };
      } else {
        bd = getBusinessDay();
        shiftStart = bd.shiftStart.toISOString();
        shiftEnd = bd.shiftEnd.toISOString();
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
    intervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchData();
    }, 60000);
    return () => clearInterval(intervalRef.current);
  }, [fetchData]);

  return { salesData, liquidityData, loading, needsSetup, lastUpdated, businessDay, refresh: fetchData };
}

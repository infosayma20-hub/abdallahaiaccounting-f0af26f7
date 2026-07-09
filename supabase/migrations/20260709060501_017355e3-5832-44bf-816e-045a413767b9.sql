UPDATE public.transactions
SET is_deleted = true, updated_at = now()
WHERE id IN (
  'b2b272ac-21c6-4de2-b524-1024a97327c9', -- QV-2026-0111 صنايعي موسرجي 1200 (مكرر مع PV-2026-0047)
  'c1d72425-3bc0-4181-9504-08d4402b4a54'  -- QV-2026-0118 دعاية واعلان 1500 (مكرر مع PV-2026-0050)
);

-- Table: project_workers (ربط العمال بالمشاريع)
CREATE TABLE public.project_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'worker',
  assigned_at timestamptz DEFAULT now(),
  owner_id uuid NOT NULL,
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_workers ENABLE ROW LEVEL SECURITY;

-- Admin sees all their project workers
CREATE POLICY "admin_project_workers" ON public.project_workers
  FOR ALL USING (owner_id = auth.uid());

-- Workers see their own assignments
CREATE POLICY "worker_own_assignments" ON public.project_workers
  FOR SELECT USING (user_id = auth.uid());

-- Table: procurement_requests (طلبات الشراء)
CREATE TABLE public.procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id),
  worker_name text NOT NULL,
  request_number text,
  request_date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  payment_method text DEFAULT 'cash',
  supplier_name text,
  supplier_invoice_url text,
  notes text,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  owner_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.procurement_requests ENABLE ROW LEVEL SECURITY;

-- Admin sees all requests for their projects
CREATE POLICY "admin_procurement_requests" ON public.procurement_requests
  FOR ALL USING (owner_id = auth.uid());

-- Workers can insert and see their own requests
CREATE POLICY "worker_own_requests_select" ON public.procurement_requests
  FOR SELECT USING (worker_id = auth.uid());

CREATE POLICY "worker_insert_requests" ON public.procurement_requests
  FOR INSERT WITH CHECK (worker_id = auth.uid());

-- Table: procurement_items (أصناف كل طلب)
CREATE TABLE public.procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.procurement_requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  item_name text NOT NULL,
  category text,
  unit text DEFAULT 'قطعة',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total_price numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes text
);

ALTER TABLE public.procurement_items ENABLE ROW LEVEL SECURITY;

-- Items inherit access from their parent request
CREATE POLICY "procurement_items_via_request_admin" ON public.procurement_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.procurement_requests pr WHERE pr.id = request_id AND pr.owner_id = auth.uid())
  );

CREATE POLICY "procurement_items_via_request_worker" ON public.procurement_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.procurement_requests pr WHERE pr.id = request_id AND pr.worker_id = auth.uid())
  );

CREATE POLICY "procurement_items_insert_worker" ON public.procurement_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.procurement_requests pr WHERE pr.id = request_id AND pr.worker_id = auth.uid())
  );

-- Auto-generate request number
CREATE OR REPLACE FUNCTION public.generate_procurement_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.procurement_requests
  WHERE owner_id = NEW.owner_id;
  
  NEW.request_number := 'PR-' || to_char(now(), 'YYYY') || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_procurement_request_number
  BEFORE INSERT ON public.procurement_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL)
  EXECUTE FUNCTION public.generate_procurement_request_number();

-- Atomic approval function
CREATE OR REPLACE FUNCTION public.approve_procurement_request(
  p_request_id uuid,
  p_approved_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM public.procurement_requests WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;
  
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب ليس في حالة انتظار');
  END IF;

  -- Update request status
  UPDATE public.procurement_requests
  SET status = 'approved', approved_by = p_approved_by, approved_at = now(), updated_at = now()
  WHERE id = p_request_id;

  -- Update project expenses
  UPDATE public.contractor_projects
  SET total_expenses = COALESCE(total_expenses, 0) + v_request.total,
      updated_at = now()
  WHERE id = v_request.project_id;

  RETURN jsonb_build_object('success', true, 'amount', v_request.total);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Reject function
CREATE OR REPLACE FUNCTION public.reject_procurement_request(
  p_request_id uuid,
  p_rejected_by uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.procurement_requests
  SET status = 'rejected', approved_by = p_rejected_by, approved_at = now(),
      rejection_reason = p_reason, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود أو ليس معلقاً');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Enable realtime for procurement_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.procurement_requests;

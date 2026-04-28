-- =============================================================
-- Phase B1: Centralized Departments & Job Titles
-- Non-breaking: text columns kept as fallback, FKs are nullable
-- =============================================================

-- 1) departments table
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  code TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_user ON public.departments(user_id) WHERE is_deleted = false;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_own"
  ON public.departments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "departments_insert_own"
  ON public.departments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "departments_update_own"
  ON public.departments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "departments_delete_own"
  ON public.departments FOR DELETE
  USING (auth.uid() = user_id);

-- 2) job_titles table
CREATE TABLE IF NOT EXISTS public.job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_titles_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_job_titles_user ON public.job_titles(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_titles_department ON public.job_titles(department_id) WHERE is_deleted = false;

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_titles_select_own"
  ON public.job_titles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "job_titles_insert_own"
  ON public.job_titles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "job_titles_update_own"
  ON public.job_titles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "job_titles_delete_own"
  ON public.job_titles FOR DELETE
  USING (auth.uid() = user_id);

-- 3) updated_at triggers
DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_job_titles_updated_at ON public.job_titles;
CREATE TRIGGER trg_job_titles_updated_at
  BEFORE UPDATE ON public.job_titles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Optional FK columns on employees (nullable, text fallback preserved)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_title_id  UUID REFERENCES public.job_titles(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_job_title_id  ON public.employees(job_title_id);

-- 5) SEED: distinct existing department names per user_id
INSERT INTO public.departments (user_id, name, name_ar)
SELECT DISTINCT e.user_id, trim(e.department), trim(e.department)
FROM public.employees e
WHERE e.user_id IS NOT NULL
  AND e.department IS NOT NULL
  AND trim(e.department) <> ''
ON CONFLICT (user_id, name) DO NOTHING;

-- 6) SEED: distinct existing job titles per user_id (job_title or position fallback)
INSERT INTO public.job_titles (user_id, name, name_ar)
SELECT DISTINCT e.user_id,
       trim(COALESCE(NULLIF(trim(e.job_title),''), NULLIF(trim(e.position),''))) AS title,
       trim(COALESCE(NULLIF(trim(e.job_title),''), NULLIF(trim(e.position),''))) AS title
FROM public.employees e
WHERE e.user_id IS NOT NULL
  AND COALESCE(NULLIF(trim(e.job_title),''), NULLIF(trim(e.position),'')) IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- 7) BACKFILL: link employees.department_id from text match
UPDATE public.employees e
SET department_id = d.id
FROM public.departments d
WHERE e.department_id IS NULL
  AND e.user_id = d.user_id
  AND trim(e.department) = d.name
  AND e.department IS NOT NULL
  AND trim(e.department) <> '';

-- 8) BACKFILL: link employees.job_title_id from text match
UPDATE public.employees e
SET job_title_id = j.id
FROM public.job_titles j
WHERE e.job_title_id IS NULL
  AND e.user_id = j.user_id
  AND trim(COALESCE(NULLIF(trim(e.job_title),''), NULLIF(trim(e.position),''))) = j.name
  AND COALESCE(NULLIF(trim(e.job_title),''), NULLIF(trim(e.position),'')) IS NOT NULL;

-- 9) BACKFILL: link job_titles.department_id where employees share both
WITH dominant AS (
  SELECT j.id AS jt_id, e.department_id, count(*) AS cnt,
         row_number() OVER (PARTITION BY j.id ORDER BY count(*) DESC) AS rn
  FROM public.job_titles j
  JOIN public.employees e
    ON e.job_title_id = j.id
   AND e.department_id IS NOT NULL
  GROUP BY j.id, e.department_id
)
UPDATE public.job_titles j
SET department_id = d.department_id
FROM dominant d
WHERE j.id = d.jt_id
  AND d.rn = 1
  AND j.department_id IS NULL;
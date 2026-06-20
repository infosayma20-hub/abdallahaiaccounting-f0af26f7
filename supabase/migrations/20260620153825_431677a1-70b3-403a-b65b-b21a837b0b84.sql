ALTER TABLE public.pos_printers
ADD COLUMN IF NOT EXISTS terminal_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_pos_printers_terminal_ids
ON public.pos_printers USING GIN (terminal_ids);
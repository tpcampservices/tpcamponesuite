ALTER TABLE public.sso_tickets
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_sso_tickets_workspace_id
  ON public.sso_tickets (workspace_id);

COMMENT ON COLUMN public.sso_tickets.workspace_id IS
  'Phase 1B-A: workspace the ticket was authorized for. NULL only on historical tickets issued before workspace binding; new tickets always carry it.';
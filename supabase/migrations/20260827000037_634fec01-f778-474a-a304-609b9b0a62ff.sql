CREATE TABLE public.sso_tickets (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_slug text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX sso_tickets_expires_idx ON public.sso_tickets (expires_at);
GRANT ALL ON public.sso_tickets TO service_role;
ALTER TABLE public.sso_tickets ENABLE ROW LEVEL SECURITY;
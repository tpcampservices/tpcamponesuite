CREATE TABLE public.invitation_send_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  email_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('initial','resend')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','sent','failed')),
  invitation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
COMMENT ON TABLE public.invitation_send_ledger IS 'Server-only invitation email send allowance. Rows older than 30 days are purged by public.purge_invitation_send_ledger().';
REVOKE ALL ON public.invitation_send_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invitation_send_ledger TO service_role;
ALTER TABLE public.invitation_send_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX invitation_send_ledger_actor_idx ON public.invitation_send_ledger (actor_user_id, created_at);
CREATE INDEX invitation_send_ledger_ws_idx ON public.invitation_send_ledger (workspace_id, created_at);
CREATE INDEX invitation_send_ledger_email_idx ON public.invitation_send_ledger (email_hash, created_at);

CREATE OR REPLACE FUNCTION public.reserve_invitation_send(
  _workspace_id uuid, _actor_user_id uuid, _email_hash text, _kind text, _invitation_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _now timestamptz := pg_catalog.now();
  _id uuid;
BEGIN
  IF _kind NOT IN ('initial','resend') THEN RAISE EXCEPTION 'invite_limit:invalid_kind'; END IF;
  IF _email_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invite_limit:invalid_hash'; END IF;

  -- Fixed lock order (sender, workspace, recipient) serializes every decision.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('inv-actor:' || _actor_user_id::text));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('inv-ws:' || _workspace_id::text));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('inv-email:' || _email_hash));

  IF (SELECT pg_catalog.count(*) FROM public.invitation_send_ledger
       WHERE actor_user_id = _actor_user_id AND status = 'failed'
         AND created_at > _now - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'invite_limit:sender_failures';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.invitation_send_ledger
       WHERE actor_user_id = _actor_user_id AND status IN ('reserved','sent')
         AND created_at > _now - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'invite_limit:sender_hourly';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.invitation_send_ledger
       WHERE actor_user_id = _actor_user_id AND status IN ('reserved','sent')
         AND created_at > _now - interval '24 hours') >= 50 THEN
    RAISE EXCEPTION 'invite_limit:sender_daily';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.invitation_send_ledger
       WHERE workspace_id = _workspace_id AND status IN ('reserved','sent')
         AND created_at > _now - interval '24 hours') >= 50 THEN
    RAISE EXCEPTION 'invite_limit:workspace_daily';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.invitation_send_ledger
       WHERE workspace_id = _workspace_id AND email_hash = _email_hash AND status IN ('reserved','sent')
         AND created_at > _now - interval '24 hours') >= 3 THEN
    RAISE EXCEPTION 'invite_limit:reinvite_daily';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.invitation_send_ledger
       WHERE email_hash = _email_hash AND status IN ('reserved','sent')
         AND created_at > _now - interval '24 hours') >= 3 THEN
    RAISE EXCEPTION 'invite_limit:recipient_daily';
  END IF;

  INSERT INTO public.invitation_send_ledger (workspace_id, actor_user_id, email_hash, kind, invitation_id)
  VALUES (_workspace_id, _actor_user_id, _email_hash, _kind, _invitation_id)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_invitation_send(_id uuid, _ok boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.invitation_send_ledger
     SET status = CASE WHEN _ok THEN 'sent' ELSE 'failed' END,
         finalized_at = pg_catalog.now()
   WHERE id = _id AND status = 'reserved';
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_invitation_send_ledger()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.invitation_send_ledger WHERE created_at < pg_catalog.now() - interval '30 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

ALTER FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) OWNER TO postgres;
ALTER FUNCTION public.finalize_invitation_send(uuid, boolean) OWNER TO postgres;
ALTER FUNCTION public.purge_invitation_send_ledger() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_invitation_send(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_invitation_send_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_invitation_send(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_invitation_send_ledger() TO service_role;
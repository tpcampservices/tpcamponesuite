CREATE OR REPLACE FUNCTION public.reserve_invitation_send(_workspace_id uuid, _actor_user_id uuid, _email_hash text, _kind text, _invitation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Atomic 30-day retention cleanup, inside this transaction, before counting.
  DELETE FROM public.invitation_send_ledger
   WHERE created_at < _now - interval '30 days';

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
$function$;

ALTER FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_send(uuid, uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.purge_invitation_send_ledger() IS 'Retained for manual/scheduled maintenance. Routine 30-day cleanup now runs atomically inside public.reserve_invitation_send.';
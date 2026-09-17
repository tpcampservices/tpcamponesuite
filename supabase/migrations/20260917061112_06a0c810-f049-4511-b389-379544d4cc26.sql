CREATE OR REPLACE FUNCTION public.write_member_permission_override(
  _workspace_id uuid,
  _membership_id uuid,
  _permission_id uuid,
  _effect text,
  _actor_user_id uuid,
  _target_user_id uuid,
  _target_email text,
  _role_key text,
  _permission_key text,
  _app_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  previous text;
  action_key text;
  changed boolean := false;
BEGIN
  IF _effect NOT IN ('allow', 'deny', 'clear') THEN
    RAISE EXCEPTION 'invalid_effect';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('ws-override:' || _membership_id::text || ':' || _permission_id::text)
  );

  SELECT o.effect INTO previous
    FROM public.workspace_member_permission_overrides o
   WHERE o.membership_id = _membership_id
     AND o.permission_id = _permission_id
   FOR UPDATE;

  IF _effect = 'clear' THEN
    IF previous IS NOT NULL THEN
      DELETE FROM public.workspace_member_permission_overrides
       WHERE membership_id = _membership_id AND permission_id = _permission_id;
      changed := true;
    END IF;
    action_key := 'member_permission_override_removed';
  ELSE
    IF previous IS NULL THEN
      INSERT INTO public.workspace_member_permission_overrides
        (workspace_id, membership_id, permission_id, effect, created_by)
      VALUES (_workspace_id, _membership_id, _permission_id, _effect, _actor_user_id);
      changed := true;
    ELSIF previous <> _effect THEN
      UPDATE public.workspace_member_permission_overrides
         SET effect = _effect
       WHERE membership_id = _membership_id AND permission_id = _permission_id;
      changed := true;
    END IF;
    action_key := CASE WHEN _effect = 'allow'
                       THEN 'member_permission_allowed'
                       ELSE 'member_permission_denied' END;
  END IF;

  IF changed THEN
    INSERT INTO public.team_audit_log
      (workspace_id, actor_user_id, target_user_id, target_email, action, role_key, details)
    VALUES (
      _workspace_id, _actor_user_id, _target_user_id, NULLIF(btrim(_target_email), ''),
      action_key, NULLIF(btrim(_role_key), ''),
      jsonb_build_object(
        'membership_id', _membership_id,
        'permission_key', _permission_key,
        'app_key', NULLIF(btrim(_app_key), ''),
        'previous_effect', COALESCE(previous, 'inherited'),
        'new_effect', CASE WHEN _effect = 'clear' THEN 'inherited' ELSE _effect END
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'changed', changed,
    'previous_effect', COALESCE(previous, 'inherited'),
    'new_effect', CASE WHEN _effect = 'clear' THEN 'inherited' ELSE _effect END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.write_member_permission_override(
  uuid, uuid, uuid, text, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_member_permission_override(
  uuid, uuid, uuid, text, uuid, uuid, text, text, text, text
) TO service_role;
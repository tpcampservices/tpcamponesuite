-- Fix: COALESCE is SQL syntax and cannot be schema-qualified.
CREATE OR REPLACE FUNCTION public.provision_additional_workspace_atomic(
  _actor_user_id uuid,
  _actor_email text,
  _target_owner_user_id uuid,
  _workspace_name text,
  _workspace_type text,
  _requested_slug text,
  _idempotency_key text,
  _input_hash text,
  _app_access_levels jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ledger_id uuid;
  v_ledger_status text;
  v_ledger_hash text;
  v_ledger_ws uuid;
  v_ws uuid;
  v_slug text;
  v_owner_role uuid;
  v_membership uuid;
  v_user record;
  v_app text;
  v_level text;
  v_levels jsonb := '{}'::jsonb;
  v_apps text[] := ARRAY['catalog','splits','operations','finance','invoice'];
BEGIN
  IF _actor_user_id IS NULL OR NOT public.has_role(_actor_user_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  IF _workspace_type IS NULL OR _workspace_type NOT IN ('customer','managed_client','demo','internal','integration_test') THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF _workspace_name IS NULL OR pg_catalog.length(pg_catalog.btrim(_workspace_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;
  IF _idempotency_key IS NULL OR pg_catalog.length(_idempotency_key) NOT BETWEEN 16 AND 128
     OR _input_hash IS NULL OR pg_catalog.length(_input_hash) <> 64 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id, u.email_confirmed_at, u.confirmed_at, u.banned_until, u.deleted_at, u.is_anonymous
    INTO v_user FROM auth.users u WHERE u.id = _target_owner_user_id;
  IF v_user.id IS NULL
     OR v_user.deleted_at IS NOT NULL
     OR COALESCE(v_user.is_anonymous, false)
     OR (v_user.banned_until IS NOT NULL AND v_user.banned_until > pg_catalog.now())
     OR (v_user.email_confirmed_at IS NULL AND v_user.confirmed_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _target_owner_user_id) THEN
    RAISE EXCEPTION 'INVALID_TARGET_OWNER' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.workspace_provisioning_requests (
    idempotency_key, actor_user_id, actor_email, target_owner_user_id,
    workspace_name, workspace_type, requested_slug, input_hash, status
  ) VALUES (
    _idempotency_key, _actor_user_id, _actor_email, _target_owner_user_id,
    pg_catalog.btrim(_workspace_name), _workspace_type, _requested_slug, _input_hash, 'in_progress'
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    SELECT r.id, r.status, r.input_hash, r.workspace_id
      INTO v_ledger_id, v_ledger_status, v_ledger_hash, v_ledger_ws
      FROM public.workspace_provisioning_requests r
     WHERE r.idempotency_key = _idempotency_key
     FOR UPDATE;
    IF v_ledger_hash <> _input_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF v_ledger_status = 'completed' THEN
      SELECT w.slug INTO v_slug FROM public.workspaces w WHERE w.id = v_ledger_ws;
      RETURN pg_catalog.jsonb_build_object(
        'workspace_id', v_ledger_ws, 'slug', v_slug, 'is_existing', true);
    ELSIF v_ledger_status = 'in_progress' THEN
      RAISE EXCEPTION 'CONCURRENT_REQUEST' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.workspace_provisioning_requests
       SET status = 'in_progress', error_message = NULL, updated_at = pg_catalog.now()
     WHERE id = v_ledger_id;
  END IF;

  IF _requested_slug IS NOT NULL AND pg_catalog.btrim(_requested_slug) <> '' THEN
    v_slug := pg_catalog.lower(pg_catalog.btrim(_requested_slug));
    IF v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$' THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.slug = v_slug) THEN
      RAISE EXCEPTION 'SLUG_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_slug := 'ws-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  END IF;

  SELECT r.id INTO v_owner_role FROM public.workspace_roles r
   WHERE r.workspace_id IS NULL AND r.role_key = 'owner' LIMIT 1;
  IF v_owner_role IS NULL THEN
    RAISE EXCEPTION 'OWNER_ROLE_MISSING' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.workspaces (name, owner_user_id, status, slug, workspace_type, sso_eligible)
  VALUES (pg_catalog.btrim(_workspace_name), _target_owner_user_id, 'active', v_slug, _workspace_type, false)
  RETURNING id INTO v_ws;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role_id, status, joined_at)
  VALUES (v_ws, _target_owner_user_id, v_owner_role, 'active', pg_catalog.now())
  RETURNING id INTO v_membership;

  FOREACH v_app IN ARRAY v_apps LOOP
    v_level := COALESCE(_app_access_levels ->> v_app, 'no_access');
    IF v_level NOT IN ('no_access','view','edit','manage') THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.workspace_member_app_access (membership_id, app_key, access_level)
    VALUES (v_membership, v_app, v_level);
    v_levels := v_levels || pg_catalog.jsonb_build_object(v_app, v_level);
  END LOOP;

  INSERT INTO public.team_audit_log (workspace_id, actor_user_id, target_user_id, action, role_key, details)
  VALUES (v_ws, _actor_user_id, _target_owner_user_id, 'workspace.provisioned', 'owner',
    pg_catalog.jsonb_build_object('workspace_type', _workspace_type, 'slug', v_slug,
      'idempotency_key', _idempotency_key, 'app_access', v_levels, 'sso_eligible', false));

  INSERT INTO public.admin_access_audit (actor_user_id, actor_email, target_user_id, target_workspace, action, details)
  VALUES (_actor_user_id, _actor_email, _target_owner_user_id, v_ws::text, 'provision_additional_workspace',
    pg_catalog.jsonb_build_object('workspace_id', v_ws, 'workspace_name', pg_catalog.btrim(_workspace_name),
      'workspace_type', _workspace_type, 'slug', v_slug, 'idempotency_key', _idempotency_key,
      'app_access', v_levels, 'sso_eligible', false));

  UPDATE public.workspace_provisioning_requests
     SET status = 'completed', workspace_id = v_ws, updated_at = pg_catalog.now()
   WHERE id = v_ledger_id;

  RETURN pg_catalog.jsonb_build_object('workspace_id', v_ws, 'slug', v_slug, 'is_existing', false);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_additional_workspace_atomic(uuid, text, uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_additional_workspace_atomic(uuid, text, uuid, text, text, text, text, text, jsonb) TO service_role;
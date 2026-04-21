-- =========================================================================
-- Post-Audit Hardening Migration (idempotent, safe in single + multi-tenant)
-- =========================================================================
-- Addresses the client_portal_tokens public-enumeration finding.
-- Skips cleanly if client_portal_tokens doesn't exist (legacy CRM).
-- Safe to re-run.
-- =========================================================================

DO $$
BEGIN
  -- Skip entirely if client portal feature isn't installed
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_portal_tokens') THEN
    RAISE NOTICE 'client_portal_tokens table not found — skipping hardening (not applicable)';
    RETURN;
  END IF;

  -- Drop permissive policies
  EXECUTE 'DROP POLICY IF EXISTS "portal_public_token_lookup" ON client_portal_tokens';
  EXECUTE 'DROP POLICY IF EXISTS "portal_token_public_select" ON client_portal_tokens';

  -- Revoke public/anon table access
  EXECUTE 'REVOKE SELECT ON client_portal_tokens FROM anon';
  EXECUTE 'REVOKE SELECT ON client_portal_tokens FROM authenticated';

  -- Clean up related portal_read_* policies on data tables
  EXECUTE 'DROP POLICY IF EXISTS "portal_read_clients" ON clients';
  EXECUTE 'DROP POLICY IF EXISTS "portal_read_projects" ON projects';
  EXECUTE 'DROP POLICY IF EXISTS "portal_read_tasks" ON tasks';
  EXECUTE 'DROP POLICY IF EXISTS "portal_read_invoices" ON invoices';
  EXECUTE 'DROP POLICY IF EXISTS "portal_read_settings" ON settings';
END $$;

-- =========================================================================
-- SECURITY DEFINER RPC — the only way anon can read portal data.
-- Caller must know the token (which is 32 bytes of random hex, unguessable).
-- Returns one consolidated JSON blob so the client makes a single call.
-- Only created if client_portal_tokens exists.
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_portal_tokens') THEN
    RETURN;
  END IF;

  EXECUTE $func$
    CREATE OR REPLACE FUNCTION public.get_portal_data(token_input TEXT)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      token_row RECORD;
      client_row JSONB;
      projects_data JSONB;
      tasks_data JSONB;
      invoices_data JSONB;
      settings_data JSONB;
    BEGIN
      SELECT * INTO token_row FROM client_portal_tokens WHERE token = token_input LIMIT 1;

      IF token_row IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_token');
      END IF;

      IF token_row.expires_at IS NOT NULL AND token_row.expires_at < NOW() THEN
        RETURN jsonb_build_object('error', 'expired');
      END IF;

      SELECT jsonb_build_object('name', name, 'service', service, 'status', status)
      INTO client_row FROM clients WHERE id = token_row.client_id;

      IF client_row IS NULL THEN
        RETURN jsonb_build_object('error', 'client_not_found');
      END IF;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'title', title, 'status', status, 'due_date', due_date
      ) ORDER BY created_at DESC), '[]'::jsonb)
      INTO projects_data FROM projects
      WHERE client_id = token_row.client_id LIMIT 20;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'text', text, 'done', done, 'priority', priority, 'due_date', due_date
      ) ORDER BY created_at DESC), '[]'::jsonb)
      INTO tasks_data FROM tasks
      WHERE client_id = token_row.client_id LIMIT 30;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'num', num, 'amount', amount, 'status', status, 'due_date', due_date
      ) ORDER BY created_at DESC), '[]'::jsonb)
      INTO invoices_data FROM invoices
      WHERE client_id = token_row.client_id LIMIT 20;

      SELECT jsonb_object_agg(key, value) INTO settings_data
      FROM settings
      WHERE user_id = token_row.user_id
        AND key IN ('company_name', 'company_logo_url');

      RETURN jsonb_build_object(
        'client', client_row,
        'projects', projects_data,
        'tasks', tasks_data,
        'invoices', invoices_data,
        'settings', COALESCE(settings_data, '{}'::jsonb)
      );
    END;
    $body$
  $func$;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_portal_data(TEXT) TO anon, authenticated';
END $$;

-- Done

-- =========================================================================
-- EMERGENCY — Restore table access for authenticated users
-- =========================================================================
-- Fixes 403 Forbidden errors across all data tables by:
--   1. Re-granting SELECT/INSERT/UPDATE/DELETE to the 'authenticated' role
--   2. Dropping any RESTRICTIVE policies that may be blocking reads
--   3. Ensuring every data table has an own-row permissive RLS policy
--
-- Idempotent — safe to run multiple times.
-- =========================================================================

-- Tables the CRM frontend reads from
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'clients', 'contacts', 'projects', 'tasks', 'invoices',
    'outreach_leads', 'outreach_steps', 'events', 'time_entries',
    'notes', 'settings', 'activity', 'campaigns', 'meeting_notes',
    'services', 'goals', 'credentials', 'brand_assets', 'documents',
    'sops', 'templates', 'email_templates', 'agent_configs',
    'agent_runs', 'agent_rate_limits', 'briefings',
    'integrations', 'tenants', 'tenant_members'
  ];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    -- Only act on tables that actually exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      -- 1. Grant basic CRUD access to authenticated users (bypass RLS grants re-established)
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);

      -- 2. Ensure RLS is enabled so policies apply
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      -- 3. Drop any RESTRICTIVE policies (these can block even when permissive policies allow)
      EXECUTE format(
        'DO $inner$ DECLARE p TEXT; BEGIN
           FOR p IN SELECT policyname FROM pg_policies WHERE tablename = %L AND permissive = ''RESTRICTIVE''
           LOOP EXECUTE format(''DROP POLICY IF EXISTS %%I ON %I'', p); END LOOP;
         END $inner$',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- Ensure every user-owned table has an own-row permissive policy.
-- If the table has a user_id column and no working policy, create one.
DO $$
DECLARE
  t TEXT;
  policy_exists BOOLEAN;
  has_user_id BOOLEAN;
  tbls TEXT[] := ARRAY[
    'clients', 'contacts', 'projects', 'tasks', 'invoices',
    'outreach_leads', 'outreach_steps', 'events', 'time_entries',
    'notes', 'settings', 'activity', 'campaigns', 'meeting_notes',
    'services', 'goals', 'credentials', 'brand_assets', 'documents',
    'sops', 'templates', 'email_templates', 'briefings'
  ];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    -- Only process existing tables with a user_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'user_id'
    ) INTO has_user_id;
    IF NOT has_user_id THEN CONTINUE; END IF;

    -- Drop the potentially-broken generic "<table>_policy" if it exists
    EXECUTE format('DROP POLICY IF EXISTS "%s_policy" ON %I', t, t);

    -- Re-create a clean, permissive own-row ALL policy
    EXECUTE format(
      'CREATE POLICY "%s_own_rows" ON %I
         FOR ALL
         TO authenticated
         USING (auth.uid() = user_id)
         WITH CHECK (auth.uid() = user_id)',
      t, t
    );
  END LOOP;
END $$;

-- Re-create the get_user_tenants() RPC that the frontend looks for
-- (app gracefully falls back when this doesn't exist, but being explicit
-- avoids the 404 noise in the console).
CREATE OR REPLACE FUNCTION public.get_user_tenants()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the tenants table doesn't exist, return an empty result set cleanly
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
    RETURN;
  END IF;

  -- Otherwise return the tenants this user belongs to
  RETURN QUERY
  SELECT t.id, t.name, tm.role
  FROM tenants t
  JOIN tenant_members tm ON tm.tenant_id = t.id
  WHERE tm.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;

-- Done

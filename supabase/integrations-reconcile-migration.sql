-- =========================================================================
-- Integrations Schema Reconciliation (safe in both single-tenant and
-- multi-tenant configurations)
-- =========================================================================
-- Problem: Two earlier migrations defined `integrations` differently, and
-- the runtime code writes by user_id with provider = 'gmail', which may
-- silently fail against some configurations.
--
-- This migration works whether or not the `tenants` table exists.
-- Idempotent — safe to re-run multiple times.
-- =========================================================================

-- 1. Ensure columns the runtime code expects exist
DO $$
BEGIN
  -- user_id column (legacy/agent-phase2 path still writes this)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE integrations ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- email column (used by google-callback to find which user owns the token)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'email'
  ) THEN
    ALTER TABLE integrations ADD COLUMN email TEXT;
  END IF;

  -- tenant_id column — ONLY if the tenants table exists (multi-tenant mode)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'integrations' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE integrations ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 2. Loosen the provider CHECK so it accepts the values the app actually uses
DO $$
DECLARE
  check_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO check_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'integrations'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%provider%';

  IF check_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE integrations DROP CONSTRAINT %I', check_constraint_name);
  END IF;
END $$;

ALTER TABLE integrations
  ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN (
    'gmail', 'google_calendar', 'google_drive',
    'zapier', 'slack', 'quickbooks', 'discord',
    'stripe', 'anthropic', 'openai'
  ));

-- 3. Unique index on (user_id, provider) — the code's primary upsert key
DROP INDEX IF EXISTS integrations_user_provider_uniq;
CREATE UNIQUE INDEX integrations_user_provider_uniq
  ON integrations(user_id, provider)
  WHERE user_id IS NOT NULL;

-- Drop the old (tenant_id, provider) unique index if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'integrations' AND indexname = 'integrations_tenant_id_provider_key'
  ) THEN
    DROP INDEX integrations_tenant_id_provider_key;
  END IF;
END $$;

-- Tenant-scoped unique index only if tenant_id column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'tenant_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'integrations' AND indexname = 'integrations_tenant_provider_uniq'
    ) THEN
      CREATE UNIQUE INDEX integrations_tenant_provider_uniq
        ON integrations(tenant_id, provider)
        WHERE tenant_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- 4. Supporting indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);

-- 5. Row-Level Security
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DO $$
DECLARE policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies WHERE tablename = 'integrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON integrations', policy_name);
  END LOOP;
END $$;

-- Build policy expressions dynamically based on whether tenants/tenant_members exist
DO $$
DECLARE
  has_tenants BOOLEAN;
  own_check TEXT := 'auth.uid() = user_id';
  full_check TEXT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_members') INTO has_tenants;

  IF has_tenants THEN
    full_check := 'auth.uid() = user_id OR (tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = integrations.tenant_id AND tm.user_id = auth.uid()))';
    EXECUTE 'CREATE POLICY integrations_select ON integrations FOR SELECT USING (' || full_check || ')';
    EXECUTE 'CREATE POLICY integrations_insert ON integrations FOR INSERT WITH CHECK (' || full_check || ')';
    EXECUTE 'CREATE POLICY integrations_update ON integrations FOR UPDATE USING (' || full_check || ')';
    EXECUTE 'CREATE POLICY integrations_delete ON integrations FOR DELETE USING (auth.uid() = user_id OR (tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = integrations.tenant_id AND tm.user_id = auth.uid() AND tm.role IN (''admin'', ''member''))))';
  ELSE
    -- Single-tenant: only user_id scoping
    EXECUTE 'CREATE POLICY integrations_select ON integrations FOR SELECT USING (' || own_check || ')';
    EXECUTE 'CREATE POLICY integrations_insert ON integrations FOR INSERT WITH CHECK (' || own_check || ')';
    EXECUTE 'CREATE POLICY integrations_update ON integrations FOR UPDATE USING (' || own_check || ')';
    EXECUTE 'CREATE POLICY integrations_delete ON integrations FOR DELETE USING (' || own_check || ')';
  END IF;
END $$;

-- Done

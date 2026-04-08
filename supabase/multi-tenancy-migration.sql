-- ============================================================================
-- GTH Command Center — Multi-Tenancy, Teams & Integrations Migration
-- ============================================================================
-- This migration adds multi-tenancy support to the existing GTH CRM database.
--
-- What it does:
--   Part 1: Creates new tables (tenants, tenant_members, tenant_invitations,
--           integrations, webhook_events)
--   Part 2: Adds tenant_id column to ALL existing tables
--   Part 3: Backfills existing data (creates a tenant per user, links rows)
--   Part 4: Makes tenant_id NOT NULL on all tables
--   Part 5: Replaces old user_id RLS policies with tenant-based policies
--   Part 6: Auto-create tenant trigger for new user signups
--   Part 7: RLS for the new tables
--   Part 8: Helper function get_user_tenants()
--
-- Safe to run on an existing database with data.
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- Enable UUID extension (should already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PART 1: CREATE NEW TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('zapier', 'slack', 'quickbooks', 'google_drive', 'discord')),
  status TEXT NOT NULL DEFAULT 'disconnected',
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  webhook_url TEXT,
  webhook_secret TEXT,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  response_code INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PART 2: ADD tenant_id TO ALL EXISTING TABLES
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  existing_tables TEXT[] := ARRAY[
    'clients','tasks','projects','invoices','invoice_files','outreach_leads',
    'events','campaigns','credentials','sops','documents','client_files',
    'tax_status','activity_log','global_notes','settings','contacts',
    'meeting_notes','services','email_templates','time_entries','goals',
    'client_links','ai_conversations','ai_messages','backup_log',
    'client_portal_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY existing_tables LOOP
    -- Only add column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PART 3: BACKFILL EXISTING DATA
-- ============================================================================
-- For each distinct user_id found in the database, create a tenant and
-- assign all their rows across all tables.

DO $$
DECLARE
  uid UUID;
  uname TEXT;
  uemail TEXT;
  new_tenant_id UUID;
  t TEXT;
  slug_base TEXT;
  slug_final TEXT;
  slug_counter INTEGER;
  existing_tables TEXT[] := ARRAY[
    'clients','tasks','projects','invoices','invoice_files','outreach_leads',
    'events','campaigns','credentials','sops','documents','client_files',
    'tax_status','activity_log','global_notes','settings','contacts',
    'meeting_notes','services','email_templates','time_entries','goals',
    'client_links','ai_conversations','ai_messages','backup_log',
    'client_portal_tokens'
  ];
BEGIN
  -- Collect all distinct user_ids from all tables
  FOR uid IN
    SELECT DISTINCT u.user_id FROM (
      SELECT user_id FROM clients WHERE tenant_id IS NULL
      UNION SELECT user_id FROM tasks WHERE tenant_id IS NULL
      UNION SELECT user_id FROM projects WHERE tenant_id IS NULL
      UNION SELECT user_id FROM invoices WHERE tenant_id IS NULL
      UNION SELECT user_id FROM invoice_files WHERE tenant_id IS NULL
      UNION SELECT user_id FROM outreach_leads WHERE tenant_id IS NULL
      UNION SELECT user_id FROM events WHERE tenant_id IS NULL
      UNION SELECT user_id FROM campaigns WHERE tenant_id IS NULL
      UNION SELECT user_id FROM credentials WHERE tenant_id IS NULL
      UNION SELECT user_id FROM sops WHERE tenant_id IS NULL
      UNION SELECT user_id FROM documents WHERE tenant_id IS NULL
      UNION SELECT user_id FROM client_files WHERE tenant_id IS NULL
      UNION SELECT user_id FROM tax_status WHERE tenant_id IS NULL
      UNION SELECT user_id FROM activity_log WHERE tenant_id IS NULL
      UNION SELECT user_id FROM global_notes WHERE tenant_id IS NULL
      UNION SELECT user_id FROM settings WHERE tenant_id IS NULL
      UNION SELECT user_id FROM contacts WHERE tenant_id IS NULL
      UNION SELECT user_id FROM meeting_notes WHERE tenant_id IS NULL
      UNION SELECT user_id FROM services WHERE tenant_id IS NULL
      UNION SELECT user_id FROM email_templates WHERE tenant_id IS NULL
      UNION SELECT user_id FROM time_entries WHERE tenant_id IS NULL
      UNION SELECT user_id FROM goals WHERE tenant_id IS NULL
      UNION SELECT user_id FROM client_links WHERE tenant_id IS NULL
      UNION SELECT user_id FROM ai_conversations WHERE tenant_id IS NULL
      UNION SELECT user_id FROM ai_messages WHERE tenant_id IS NULL
      UNION SELECT user_id FROM backup_log WHERE tenant_id IS NULL
      UNION SELECT user_id FROM client_portal_tokens WHERE tenant_id IS NULL
    ) u
    WHERE u.user_id IS NOT NULL
  LOOP
    -- Skip if this user already has a tenant (from a previous run)
    IF EXISTS (
      SELECT 1 FROM tenant_members WHERE user_id = uid AND role = 'owner'
    ) THEN
      -- Just get the existing tenant_id and backfill any remaining NULL rows
      SELECT tm.tenant_id INTO new_tenant_id
        FROM tenant_members tm
        WHERE tm.user_id = uid AND tm.role = 'owner'
        LIMIT 1;
    ELSE
      -- Get user email from auth.users
      SELECT COALESCE(au.email, uid::text) INTO uemail
        FROM auth.users au WHERE au.id = uid;

      -- Derive name from email prefix
      uname := split_part(uemail, '@', 1);

      -- Generate unique slug
      slug_base := lower(regexp_replace(uname, '[^a-zA-Z0-9]', '-', 'g'));
      slug_final := slug_base;
      slug_counter := 0;

      WHILE EXISTS (SELECT 1 FROM tenants WHERE slug = slug_final) LOOP
        slug_counter := slug_counter + 1;
        slug_final := slug_base || '-' || slug_counter::text;
      END LOOP;

      -- Create the tenant
      INSERT INTO tenants (id, name, slug, owner_user_id)
      VALUES (uuid_generate_v4(), uname || '''s Workspace', slug_final, uid)
      RETURNING id INTO new_tenant_id;

      -- Add user as owner
      INSERT INTO tenant_members (tenant_id, user_id, role, accepted_at)
      VALUES (new_tenant_id, uid, 'owner', NOW())
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END IF;

    -- Backfill all tables for this user
    FOREACH t IN ARRAY existing_tables LOOP
      EXECUTE format(
        'UPDATE %I SET tenant_id = $1 WHERE user_id = $2 AND tenant_id IS NULL',
        t
      ) USING new_tenant_id, uid;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- PART 4: MAKE tenant_id NOT NULL
-- ============================================================================
-- Only set NOT NULL if there are no remaining NULLs (safe for re-runs)

DO $$
DECLARE
  t TEXT;
  has_nulls BOOLEAN;
  is_nullable TEXT;
  existing_tables TEXT[] := ARRAY[
    'clients','tasks','projects','invoices','invoice_files','outreach_leads',
    'events','campaigns','credentials','sops','documents','client_files',
    'tax_status','activity_log','global_notes','settings','contacts',
    'meeting_notes','services','email_templates','time_entries','goals',
    'client_links','ai_conversations','ai_messages','backup_log',
    'client_portal_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY existing_tables LOOP
    -- Check if column is already NOT NULL
    SELECT c.is_nullable INTO is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name = 'tenant_id';

    IF is_nullable = 'YES' THEN
      -- Check for any remaining NULLs
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE tenant_id IS NULL)', t) INTO has_nulls;
      IF NOT has_nulls THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);
      ELSE
        RAISE NOTICE 'WARNING: Table % still has NULL tenant_id rows — skipping NOT NULL constraint', t;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PART 5: REPLACE OLD RLS POLICIES WITH TENANT-BASED POLICIES
-- ============================================================================

-- First, drop ALL existing RLS policies on these tables (dynamic, safe)
DO $$
DECLARE
  t TEXT;
  pol RECORD;
  existing_tables TEXT[] := ARRAY[
    'clients','tasks','projects','invoices','invoice_files','outreach_leads',
    'events','campaigns','credentials','sops','documents','client_files',
    'tax_status','activity_log','global_notes','settings','contacts',
    'meeting_notes','services','email_templates','time_entries','goals',
    'client_links','ai_conversations','ai_messages','backup_log',
    'client_portal_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY existing_tables LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Helper: tenant membership subquery used in all policies
-- A user can see data for any tenant they belong to
-- tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())

-- Create new tenant-based RLS policies for all existing tables
DO $$
DECLARE
  t TEXT;
  -- Tables that need portal read access preserved
  portal_tables TEXT[] := ARRAY['clients','projects','tasks','invoices','settings'];
  existing_tables TEXT[] := ARRAY[
    'clients','tasks','projects','invoices','invoice_files','outreach_leads',
    'events','campaigns','credentials','sops','documents','client_files',
    'tax_status','activity_log','global_notes','settings','contacts',
    'meeting_notes','services','email_templates','time_entries','goals',
    'client_links','ai_conversations','ai_messages','backup_log',
    'client_portal_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY existing_tables LOOP
    -- Ensure RLS is enabled
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- SELECT: any tenant member can read
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
      )',
      'tenant_select_' || t, t
    );

    -- INSERT: tenant members with write access (not viewer)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM tenant_members
          WHERE user_id = auth.uid() AND role IN (''owner'', ''admin'', ''member'')
        )
      )',
      'tenant_insert_' || t, t
    );

    -- UPDATE: tenant members with write access (not viewer)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (
        tenant_id IN (
          SELECT tenant_id FROM tenant_members
          WHERE user_id = auth.uid() AND role IN (''owner'', ''admin'', ''member'')
        )
      ) WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM tenant_members
          WHERE user_id = auth.uid() AND role IN (''owner'', ''admin'', ''member'')
        )
      )',
      'tenant_update_' || t, t
    );

    -- DELETE: tenant members with write access (not viewer)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (
        tenant_id IN (
          SELECT tenant_id FROM tenant_members
          WHERE user_id = auth.uid() AND role IN (''owner'', ''admin'', ''member'')
        )
      )',
      'tenant_delete_' || t, t
    );
  END LOOP;
END $$;

-- Re-create portal read policies for client_portal_tokens (public lookup)
CREATE POLICY "portal_public_token_lookup"
  ON client_portal_tokens FOR SELECT
  USING (true);

-- Re-grant anon access for portal
GRANT SELECT ON client_portal_tokens TO anon;

-- Re-create portal read policies for tables that need public portal access
CREATE POLICY "portal_read_clients" ON clients FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_portal_tokens
    WHERE client_portal_tokens.client_id = clients.id
    AND client_portal_tokens.expires_at > now()
  )
);

CREATE POLICY "portal_read_projects" ON projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_portal_tokens
    WHERE client_portal_tokens.client_id = projects.client_id
    AND client_portal_tokens.expires_at > now()
  )
);

CREATE POLICY "portal_read_tasks" ON tasks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_portal_tokens
    WHERE client_portal_tokens.client_id = tasks.client_id
    AND client_portal_tokens.expires_at > now()
  )
);

CREATE POLICY "portal_read_invoices" ON invoices FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_portal_tokens
    WHERE client_portal_tokens.client_id = invoices.client_id
    AND client_portal_tokens.expires_at > now()
  )
);

CREATE POLICY "portal_read_settings" ON settings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_portal_tokens
    WHERE client_portal_tokens.user_id = settings.user_id
    AND client_portal_tokens.expires_at > now()
  )
);

-- ============================================================================
-- PART 6: AUTO-CREATE TENANT ON NEW USER SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
  uname TEXT;
  slug_base TEXT;
  slug_final TEXT;
  slug_counter INTEGER := 0;
BEGIN
  -- Derive name from email
  uname := split_part(COALESCE(NEW.email, NEW.id::text), '@', 1);

  -- Generate unique slug
  slug_base := lower(regexp_replace(uname, '[^a-zA-Z0-9]', '-', 'g'));
  slug_final := slug_base;

  WHILE EXISTS (SELECT 1 FROM tenants WHERE slug = slug_final) LOOP
    slug_counter := slug_counter + 1;
    slug_final := slug_base || '-' || slug_counter::text;
  END LOOP;

  -- Create tenant
  INSERT INTO tenants (id, name, slug, owner_user_id)
  VALUES (uuid_generate_v4(), uname || '''s Workspace', slug_final, NEW.id)
  RETURNING id INTO new_tenant_id;

  -- Add user as owner
  INSERT INTO tenant_members (tenant_id, user_id, role, accepted_at)
  VALUES (new_tenant_id, NEW.id, 'owner', NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- PART 7: RLS FOR NEW TABLES
-- ============================================================================

-- TENANTS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_tenants" ON tenants;
CREATE POLICY "tenant_select_tenants" ON tenants FOR SELECT USING (
  id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "tenant_update_tenants" ON tenants;
CREATE POLICY "tenant_update_tenants" ON tenants FOR UPDATE USING (
  owner_user_id = auth.uid()
) WITH CHECK (
  owner_user_id = auth.uid()
);

-- TENANT_MEMBERS
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tm_select" ON tenant_members;
CREATE POLICY "tm_select" ON tenant_members FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "tm_insert" ON tenant_members;
CREATE POLICY "tm_insert" ON tenant_members FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "tm_update" ON tenant_members;
CREATE POLICY "tm_update" ON tenant_members FOR UPDATE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
) WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "tm_delete" ON tenant_members;
CREATE POLICY "tm_delete" ON tenant_members FOR DELETE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- TENANT_INVITATIONS
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ti_select_admin" ON tenant_invitations;
CREATE POLICY "ti_select_admin" ON tenant_invitations FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Public can look up invitations by token (for invite link acceptance)
DROP POLICY IF EXISTS "ti_select_public" ON tenant_invitations;
CREATE POLICY "ti_select_public" ON tenant_invitations FOR SELECT USING (
  accepted_at IS NULL AND expires_at > NOW()
);

DROP POLICY IF EXISTS "ti_insert" ON tenant_invitations;
CREATE POLICY "ti_insert" ON tenant_invitations FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "ti_update" ON tenant_invitations;
CREATE POLICY "ti_update" ON tenant_invitations FOR UPDATE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
) WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "ti_delete" ON tenant_invitations;
CREATE POLICY "ti_delete" ON tenant_invitations FOR DELETE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

GRANT SELECT ON tenant_invitations TO anon;

-- INTEGRATIONS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "int_select" ON integrations;
CREATE POLICY "int_select" ON integrations FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "int_insert" ON integrations;
CREATE POLICY "int_insert" ON integrations FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "int_update" ON integrations;
CREATE POLICY "int_update" ON integrations FOR UPDATE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
) WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "int_delete" ON integrations;
CREATE POLICY "int_delete" ON integrations FOR DELETE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- WEBHOOK_EVENTS
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wh_select" ON webhook_events;
CREATE POLICY "wh_select" ON webhook_events FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
);

-- ============================================================================
-- PART 8: HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_tenants()
RETURNS TABLE(
  tenant_id UUID,
  tenant_name TEXT,
  tenant_slug TEXT,
  role TEXT,
  logo_url TEXT,
  primary_color TEXT
) AS $$
  SELECT t.id, t.name, t.slug, tm.role, t.logo_url, t.primary_color
  FROM tenants t
  JOIN tenant_members tm ON tm.tenant_id = t.id
  WHERE tm.user_id = auth.uid() AND tm.accepted_at IS NOT NULL
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Indexes on new tables
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user ON tenant_members(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token ON tenant_invitations(token);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations(email);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_provider ON integrations(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant ON webhook_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_integration ON webhook_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);

-- Indexes on tenant_id for all existing tables
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_files_tenant ON invoice_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_tenant ON outreach_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sops_tenant ON sops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_files_tenant ON client_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tax_status_tenant ON tax_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant ON activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_global_notes_tenant ON global_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_tenant ON meeting_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant ON time_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goals_tenant ON goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_links_tenant ON client_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant ON ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_tenant ON ai_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_backup_log_tenant ON backup_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_tenant ON client_portal_tokens(tenant_id);

-- ============================================================================
-- Migration complete
-- ============================================================================

-- ============================================================================
-- GTH Command Center — AI Agent System Migration
-- ============================================================================
-- This migration adds the AI agent infrastructure tables for automated
-- lead generation, outreach sequences, email classification, and scraping.
--
-- What it does:
--   Part 1: Creates new agent tables (agent_configs, agent_runs, scrape_jobs,
--           outreach_sequences, outreach_steps, agent_inbox_classifications)
--   Part 2: Alters outreach_leads to add agent-related columns
--   Part 3: Indexes on all new tables and columns
--   Part 4: RLS policies (user_id-based for backward compat with pre-migration)
--
-- Safe to run on an existing database with data.
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- Enable UUID extension (should already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PART 1: CREATE NEW TABLES
-- ============================================================================

-- agent_configs — stores config per agent per tenant
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('lead_gen', 'sales')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule_cron TEXT,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN agent_configs.config IS 'JSONB: target_industries, target_locations, daily_lead_quota, email_send_limit, working_hours, outreach_tone, auto_send, scrape_sources';

-- agent_runs — immutable log of every execution
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('lead_gen', 'sales')),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('cron', 'manual')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'error')) DEFAULT 'running',
  steps_completed INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}'::jsonb,
  error_log TEXT,
  cost_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0
);

-- scrape_jobs — individual scraping operations
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('google_maps', 'yelp', 'bbb', 'website', 'manual')),
  query TEXT,
  location TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'error')) DEFAULT 'pending',
  results_count INTEGER DEFAULT 0,
  raw_results JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- outreach_sequences — multi-step email sequences per lead
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES outreach_leads(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('lead_gen', 'sales')),
  sequence_name TEXT,
  current_step INTEGER NOT NULL DEFAULT 1,
  max_steps INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- outreach_steps — individual steps within a sequence
CREATE TABLE IF NOT EXISTS outreach_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('email', 'wait', 'qualify_check')),
  delay_hours INTEGER DEFAULT 0,
  subject TEXT,
  body TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'scheduled', 'sent', 'replied', 'bounced', 'skipped')) DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- agent_inbox_classifications — classified incoming emails
CREATE TABLE IF NOT EXISTS agent_inbox_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT UNIQUE,
  gmail_thread_id TEXT,
  from_email TEXT,
  subject TEXT,
  classification TEXT NOT NULL CHECK (classification IN (
    'lead_reply', 'client_message', 'meeting_request', 'objection',
    'positive_interest', 'not_interested', 'out_of_office', 'spam', 'other'
  )),
  linked_lead_id UUID REFERENCES outreach_leads(id) ON DELETE SET NULL,
  linked_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  suggested_action TEXT,
  confidence REAL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PART 2: ALTER outreach_leads — add agent-related columns
-- ============================================================================

DO $$
DECLARE
  col RECORD;
  cols_to_add TEXT[][] := ARRAY[
    ARRAY['email', 'TEXT'],
    ARRAY['phone', 'TEXT'],
    ARRAY['website', 'TEXT'],
    ARRAY['linkedin_url', 'TEXT'],
    ARRAY['location', 'TEXT'],
    ARRAY['company_size', 'TEXT'],
    ARRAY['source', 'TEXT'],
    ARRAY['scrape_job_id', 'UUID'],
    ARRAY['enrichment_data', 'JSONB'],
    ARRAY['qualification_score', 'REAL'],
    ARRAY['qualification_reason', 'TEXT'],
    ARRAY['agent_type', 'TEXT'],
    ARRAY['tags', 'TEXT']
  ];
  col_pair TEXT[];
BEGIN
  FOREACH col_pair SLICE 1 IN ARRAY cols_to_add LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outreach_leads'
        AND column_name = col_pair[1]
    ) THEN
      EXECUTE format('ALTER TABLE outreach_leads ADD COLUMN %I %s', col_pair[1], col_pair[2]);
    END IF;
  END LOOP;

  -- Add FK for scrape_job_id if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'outreach_leads'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'scrape_jobs'
  ) THEN
    BEGIN
      ALTER TABLE outreach_leads
        ADD CONSTRAINT fk_outreach_leads_scrape_job
        FOREIGN KEY (scrape_job_id) REFERENCES scrape_jobs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- constraint already exists
    END;
  END IF;
END $$;

-- ============================================================================
-- PART 3: INDEXES
-- ============================================================================

-- agent_configs indexes
CREATE INDEX IF NOT EXISTS idx_agent_configs_tenant ON agent_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_user ON agent_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type ON agent_configs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_configs_enabled ON agent_configs(enabled);

-- agent_runs indexes
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant ON agent_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_type ON agent_runs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at);

-- scrape_jobs indexes
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_tenant ON scrape_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_user ON scrape_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_agent_run ON scrape_jobs(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_source ON scrape_jobs(source);

-- outreach_sequences indexes
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_tenant ON outreach_sequences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_user ON outreach_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_lead ON outreach_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_agent_type ON outreach_sequences(agent_type);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_status ON outreach_sequences(status);

-- outreach_steps indexes
CREATE INDEX IF NOT EXISTS idx_outreach_steps_tenant ON outreach_steps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_user ON outreach_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_sequence ON outreach_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_status ON outreach_steps(status);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_scheduled_at ON outreach_steps(scheduled_at);

-- agent_inbox_classifications indexes
CREATE INDEX IF NOT EXISTS idx_agent_inbox_class_tenant ON agent_inbox_classifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_inbox_class_user ON agent_inbox_classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_inbox_class_classification ON agent_inbox_classifications(classification);
CREATE INDEX IF NOT EXISTS idx_agent_inbox_class_gmail_thread ON agent_inbox_classifications(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_inbox_class_linked_lead ON agent_inbox_classifications(linked_lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_inbox_class_linked_client ON agent_inbox_classifications(linked_client_id);

-- outreach_leads new column indexes
CREATE INDEX IF NOT EXISTS idx_outreach_leads_agent_type ON outreach_leads(agent_type);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_source ON outreach_leads(source);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_scrape_job ON outreach_leads(scrape_job_id);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_qualification ON outreach_leads(qualification_score);

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_inbox_classifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies — user can only access their own data (backward compat)
-- Uses the same pattern as the original migration.sql
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'agent_configs','agent_runs','scrape_jobs',
    'outreach_sequences','outreach_steps','agent_inbox_classifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop existing policies if re-running
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_user_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_user_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_user_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_user_delete', t);

    -- SELECT: user can read their own rows
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id)',
      t || '_user_select', t
    );

    -- INSERT: user can insert their own rows
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)',
      t || '_user_insert', t
    );

    -- UPDATE: user can update their own rows
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_user_update', t
    );

    -- DELETE: user can delete their own rows
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id)',
      t || '_user_delete', t
    );
  END LOOP;
END $$;

-- ============================================================================
-- PART 5: TENANT-BASED RLS POLICIES (for post-multi-tenancy setups)
-- ============================================================================
-- If the multi-tenancy migration has been applied, these tenant-based policies
-- provide team-level access. They coexist with user_id policies above (OR logic).

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'agent_configs','agent_runs','scrape_jobs',
    'outreach_sequences','outreach_steps','agent_inbox_classifications'
  ];
BEGIN
  -- Only create tenant policies if tenant_members table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenant_members'
  ) THEN
    FOREACH t IN ARRAY tables LOOP
      -- Drop existing tenant policies if re-running
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_select_' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_insert_' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_update_' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_delete_' || t, t);

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
  END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================

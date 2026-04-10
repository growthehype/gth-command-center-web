-- ============================================================================
-- Migration: Fix every schema mismatch between Phase 2 agent code and the DB
-- ============================================================================
-- Why this exists:
--   The agent backend code (scraper, orchestrator, runs, queue) was written
--   assuming column names and enum values that don't exist in the actual DB
--   schema. This migration adds the missing columns and relaxes/extends the
--   CHECK constraints so the code can write the values it actually uses.
--
-- Idempotent — safe to run multiple times.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. outreach_leads — add columns the scraper writes
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_pair TEXT[];
  cols_to_add TEXT[][] := ARRAY[
    ARRAY['address',         'TEXT'],
    ARRAY['rating',          'REAL'],
    ARRAY['google_maps_url', 'TEXT'],
    ARRAY['google_place_id', 'TEXT'],
    ARRAY['business_status', 'TEXT'],
    ARRAY['agent_run_id',    'UUID']
  ];
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
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. outreach_leads.stage — drop the rigid CHECK so both styles work
--    (the UI uses "New Lead", "Contacted"... the agents use "new-lead",
--     "new" — neither side should fight the other)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'outreach_leads'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%stage%'
  LOOP
    EXECUTE format('ALTER TABLE outreach_leads DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. agent_runs — extend status CHECK to allow 'completed' / 'failed'
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('running', 'success', 'partial', 'error', 'completed', 'failed', 'skipped'));

-- ─────────────────────────────────────────────────────────────────
-- 4. agent_runs — extend triggered_by CHECK to allow 'scheduled'
--    (some code paths still pass 'scheduled' instead of 'cron')
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_triggered_by_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_triggered_by_check
  CHECK (triggered_by IN ('cron', 'manual', 'scheduled', 'webhook'));

-- ─────────────────────────────────────────────────────────────────
-- 5. agent_runs — add agent_config_id (so we know WHICH config ran)
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_runs'
      AND column_name = 'agent_config_id'
  ) THEN
    ALTER TABLE agent_runs ADD COLUMN agent_config_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_config_id
  ON agent_runs (agent_config_id);

-- ─────────────────────────────────────────────────────────────────
-- 6. scrape_jobs — extend status CHECK to allow 'completed' / 'failed'
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_status_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_status_check
  CHECK (status IN ('pending', 'running', 'success', 'error', 'completed', 'failed'));

-- ─────────────────────────────────────────────────────────────────
-- 7. scrape_jobs — add leads_found / leads_new / error_message columns
--    (the scraper code writes these explicitly)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_pair TEXT[];
  cols_to_add TEXT[][] := ARRAY[
    ARRAY['leads_found',   'INTEGER'],
    ARRAY['leads_new',     'INTEGER'],
    ARRAY['error_message', 'TEXT']
  ];
BEGIN
  FOREACH col_pair SLICE 1 IN ARRAY cols_to_add LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'scrape_jobs'
        AND column_name = col_pair[1]
    ) THEN
      EXECUTE format('ALTER TABLE scrape_jobs ADD COLUMN %I %s', col_pair[1], col_pair[2]);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 8. outreach_steps — extend status CHECK so the queue actions work
--    (frontend writes 'approved', 'rejected', 'edited', etc.)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE outreach_steps DROP CONSTRAINT IF EXISTS outreach_steps_status_check;
ALTER TABLE outreach_steps ADD CONSTRAINT outreach_steps_status_check
  CHECK (status IN (
    'pending', 'scheduled', 'sent', 'replied', 'bounced', 'skipped',
    'approved', 'rejected', 'edited', 'sending', 'failed', 'draft'
  ));

-- ─────────────────────────────────────────────────────────────────
-- 9. agent_configs — add columns the dashboard reads
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_pair TEXT[];
  cols_to_add TEXT[][] := ARRAY[
    ARRAY['last_run_duration_ms', 'INTEGER'],
    ARRAY['last_run_metadata',    'JSONB'],
    ARRAY['stats_summary',        'TEXT']
  ];
BEGIN
  FOREACH col_pair SLICE 1 IN ARRAY cols_to_add LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_configs'
        AND column_name = col_pair[1]
    ) THEN
      EXECUTE format('ALTER TABLE agent_configs ADD COLUMN %I %s', col_pair[1], col_pair[2]);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 10. scrape_jobs.source — relax CHECK so 'manual', 'agent', etc. all work
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_source_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_source_check
  CHECK (source IN ('google_maps', 'google_places', 'yelp', 'bbb', 'website', 'manual', 'agent', 'other'));

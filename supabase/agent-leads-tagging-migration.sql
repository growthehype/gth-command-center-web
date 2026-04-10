-- Migration: Tag leads with the agent that created them
-- Idempotent — safe to run multiple times
--
-- This adds the columns needed to filter & export leads by client agent.
-- Without this, we cannot tell which client agent (e.g. "Ideal Integration")
-- generated which leads, which makes the per-client CSV export impossible.

-- 1. Add agent_name column to outreach_leads (denormalized for easy filtering/export)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outreach_leads'
      AND column_name = 'agent_name'
  ) THEN
    ALTER TABLE outreach_leads ADD COLUMN agent_name TEXT;
  END IF;
END $$;

-- 2. Add agent_type column to outreach_leads (so we can split core vs client)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outreach_leads'
      AND column_name = 'agent_type'
  ) THEN
    ALTER TABLE outreach_leads ADD COLUMN agent_type TEXT;
  END IF;
END $$;

-- 3. Add agent_config_id column for direct FK-style filtering (optional but useful)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outreach_leads'
      AND column_name = 'agent_config_id'
  ) THEN
    ALTER TABLE outreach_leads ADD COLUMN agent_config_id UUID;
  END IF;
END $$;

-- 4. Index for fast filtering by agent
CREATE INDEX IF NOT EXISTS idx_outreach_leads_agent_name
  ON outreach_leads (user_id, agent_name);

CREATE INDEX IF NOT EXISTS idx_outreach_leads_agent_config_id
  ON outreach_leads (user_id, agent_config_id);

-- 5. Backfill: try to attach existing leads to their agent run -> agent config
-- (Best-effort. Safe if tables/columns don't line up perfectly.)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outreach_leads'
      AND column_name = 'agent_run_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_runs'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_configs'
  ) THEN
    UPDATE outreach_leads l
    SET
      agent_type = COALESCE(l.agent_type, c.agent_type),
      agent_name = COALESCE(l.agent_name, c.agent_name),
      agent_config_id = COALESCE(l.agent_config_id, c.id)
    FROM agent_runs r
    JOIN agent_configs c ON c.id = r.agent_config_id
    WHERE l.agent_run_id = r.id
      AND (l.agent_type IS NULL OR l.agent_name IS NULL OR l.agent_config_id IS NULL);
  END IF;
END $$;

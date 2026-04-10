-- Migration: Add 'client' agent type support
-- Idempotent — safe to run multiple times

-- 1. Update agent_configs CHECK constraint to allow 'client'
ALTER TABLE agent_configs DROP CONSTRAINT IF EXISTS agent_configs_agent_type_check;
ALTER TABLE agent_configs ADD CONSTRAINT agent_configs_agent_type_check
  CHECK (agent_type IN ('lead_gen', 'sales', 'client'));

-- 2. Add agent_name column to agent_configs (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_configs' AND column_name = 'agent_name'
  ) THEN
    ALTER TABLE agent_configs ADD COLUMN agent_name TEXT;
  END IF;
END $$;

-- 3. Update agent_runs CHECK constraint to allow 'client'
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_agent_type_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_agent_type_check
  CHECK (agent_type IN ('lead_gen', 'sales', 'client'));

-- 4. Update outreach_sequences CHECK constraint to allow 'client'
ALTER TABLE outreach_sequences DROP CONSTRAINT IF EXISTS outreach_sequences_agent_type_check;
ALTER TABLE outreach_sequences ADD CONSTRAINT outreach_sequences_agent_type_check
  CHECK (agent_type IN ('lead_gen', 'sales', 'client'));

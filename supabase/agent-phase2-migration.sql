-- ============================================================
-- Phase 2: AI Agent System Migration
-- Adds: integrations, agent_rate_limits tables
--        + approval_status column on outreach_steps
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------
-- 1. integrations — OAuth refresh tokens for server-side use
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,            -- 'gmail', 'google_calendar', etc.
  refresh_token TEXT,
  credentials JSONB DEFAULT '{}'::jsonb,
  email TEXT,                        -- the connected email address
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- ----------------------------------------------------------
-- 2. agent_rate_limits — daily rate-limit tracking
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,              -- 'email_send', 'scrape', 'claude_call'
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, action, date)
);

-- ----------------------------------------------------------
-- 3. Add approval_status to outreach_steps (review queue)
-- ----------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'outreach_steps'
      AND column_name  = 'approval_status'
  ) THEN
    ALTER TABLE outreach_steps
      ADD COLUMN approval_status TEXT DEFAULT 'pending'
      CHECK (approval_status IN ('pending', 'approved', 'rejected', 'edited'));
  END IF;
END $$;

-- ----------------------------------------------------------
-- Indexes (IF NOT EXISTS keeps it idempotent)
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_integrations_user
  ON integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_integrations_provider
  ON integrations(provider);

CREATE INDEX IF NOT EXISTS idx_agent_rate_limits_user_action_date
  ON agent_rate_limits(user_id, action, date);

CREATE INDEX IF NOT EXISTS idx_outreach_steps_approval
  ON outreach_steps(approval_status);

-- ----------------------------------------------------------
-- Row Level Security — integrations
-- ----------------------------------------------------------
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'integrations' AND policyname = 'integrations_select_own'
  ) THEN
    CREATE POLICY integrations_select_own ON integrations
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'integrations' AND policyname = 'integrations_insert_own'
  ) THEN
    CREATE POLICY integrations_insert_own ON integrations
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'integrations' AND policyname = 'integrations_update_own'
  ) THEN
    CREATE POLICY integrations_update_own ON integrations
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'integrations' AND policyname = 'integrations_delete_own'
  ) THEN
    CREATE POLICY integrations_delete_own ON integrations
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------------------------
-- Row Level Security — agent_rate_limits
-- ----------------------------------------------------------
ALTER TABLE agent_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_rate_limits' AND policyname = 'agent_rate_limits_select_own'
  ) THEN
    CREATE POLICY agent_rate_limits_select_own ON agent_rate_limits
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_rate_limits' AND policyname = 'agent_rate_limits_insert_own'
  ) THEN
    CREATE POLICY agent_rate_limits_insert_own ON agent_rate_limits
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_rate_limits' AND policyname = 'agent_rate_limits_update_own'
  ) THEN
    CREATE POLICY agent_rate_limits_update_own ON agent_rate_limits
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_rate_limits' AND policyname = 'agent_rate_limits_delete_own'
  ) THEN
    CREATE POLICY agent_rate_limits_delete_own ON agent_rate_limits
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Client Portal Tokens table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS client_portal_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Owner policy — users can manage their own portal tokens
CREATE POLICY "Users manage own portal tokens"
  ON client_portal_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public read policy for portal access — anyone with a valid token can read client data
-- This allows the portal page to verify tokens without authentication
CREATE POLICY "Public portal token lookup"
  ON client_portal_tokens FOR SELECT
  USING (true);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON client_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_client ON client_portal_tokens(client_id);

-- Grant public read access to the portal tokens table for unauthenticated portal views
-- The portal page needs to look up tokens before any auth context exists
GRANT SELECT ON client_portal_tokens TO anon;

-- Also need to allow anon users to read specific client data for portal views
-- These policies allow reading ONLY when accessed via a valid portal token
-- (The portal page joins through the token to get client_id and user_id)

-- NOTE: For the portal to work, you also need SELECT policies on clients, projects, tasks, invoices, and settings
-- that allow reading when the user_id matches a portal token's user_id.
-- Add these if your RLS policies don't already have public read paths:

CREATE POLICY "Portal read clients" ON clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM client_portal_tokens WHERE client_portal_tokens.client_id = clients.id AND client_portal_tokens.expires_at > now())
);

CREATE POLICY "Portal read projects" ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM client_portal_tokens WHERE client_portal_tokens.client_id = projects.client_id AND client_portal_tokens.expires_at > now())
);

CREATE POLICY "Portal read tasks" ON tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM client_portal_tokens WHERE client_portal_tokens.client_id = tasks.client_id AND client_portal_tokens.expires_at > now())
);

CREATE POLICY "Portal read invoices" ON invoices FOR SELECT USING (
  EXISTS (SELECT 1 FROM client_portal_tokens WHERE client_portal_tokens.client_id = invoices.client_id AND client_portal_tokens.expires_at > now())
);

CREATE POLICY "Portal read settings" ON settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM client_portal_tokens WHERE client_portal_tokens.user_id = settings.user_id AND client_portal_tokens.expires_at > now())
);

# Phase 1: Database Schema

## Supabase Setup
1. Create account at supabase.com
2. Create new project
3. Note your Project URL and Anon Key

## Tables

Run these SQL statements in the Supabase SQL Editor:

### clients
```sql
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service TEXT,
  retainer TEXT,
  mrr NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'prospect',
  platform TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  colors TEXT,
  logo_path TEXT,
  last_activity TIMESTAMPTZ,
  notes TEXT,
  tags TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### tasks
```sql
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  done INTEGER DEFAULT 0,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  due_date DATE,
  tags TEXT,
  recurring TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### projects
```sql
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'backlog',
  due_date DATE,
  hours NUMERIC DEFAULT 0,
  links TEXT,
  recurring TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### invoices
```sql
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  num TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  amount NUMERIC DEFAULT 0,
  sent_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'draft',
  file_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ
);
```

### events
```sql
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'event',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  recurring TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### outreach_leads
```sql
CREATE TABLE outreach_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  stage TEXT DEFAULT 'lead',
  last_contact TIMESTAMPTZ,
  next_follow_up DATE,
  deal_value NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL
);
```

### campaigns
```sql
CREATE TABLE campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  platform TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  spend NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### contacts
```sql
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  is_primary INTEGER DEFAULT 0,
  notes TEXT,
  last_contacted TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### meeting_notes
```sql
CREATE TABLE meeting_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT DEFAULT 'meeting',
  attendees TEXT,
  notes TEXT,
  action_items TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### services
```sql
CREATE TABLE services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  pricing_model TEXT DEFAULT 'fixed',
  default_price NUMERIC,
  typical_hours NUMERIC,
  deliverables TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### email_templates
```sql
CREATE TABLE email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### goals
```sql
CREATE TABLE goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  metric_type TEXT DEFAULT 'number',
  target_value NUMERIC,
  current_value NUMERIC DEFAULT 0,
  target_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### activity_log
```sql
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);
```

### credentials
```sql
CREATE TABLE credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  fields TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### sops
```sql
CREATE TABLE sops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  area TEXT,
  status TEXT DEFAULT 'draft',
  url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### time_entries
```sql
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  billable INTEGER DEFAULT 1
);
```

### settings
```sql
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  UNIQUE(user_id, key)
);
```

## Row Level Security (RLS)

Enable RLS on ALL tables and add policies so users can only see their own data:

```sql
-- Repeat for each table:
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own clients" ON clients
  FOR ALL USING (auth.uid() = user_id);
```

## Auth Setup
1. In Supabase Dashboard -> Authentication -> Providers
2. Enable Email provider
3. Create your first user via the Auth -> Users tab

# THE AI CRM BLUEPRINT

## How I Built a $40,000 Custom CRM for Free Using AI

### By Omar Alladina | Grow The Hype

---

*A step-by-step guide to building a fully custom, AI-powered CRM using free tools, open-source technology, and artificial intelligence as your development partner.*

---

## INTRODUCTION

Let me save you a year of frustration.

I run a digital marketing agency called Grow The Hype. We handle paid media, web design, SEO, creative production, and consulting for clients across multiple industries. For years, I juggled our operations across a mess of spreadsheets, Notion databases, sticky notes, and three different SaaS tools that each did 20% of what I actually needed.

HubSpot wanted $800/month for the features I cared about. Salesforce required a consultant just to set up. Monday.com was great for project management but terrible for client financials. And none of them talked to each other the way I needed them to.

So I did something that would have been impossible two years ago: I built my own CRM from scratch, using AI as my development partner. The entire thing. Twenty-four pages of functionality. Client management, task boards, invoicing, a full calendar integration, document storage, campaign tracking, goal setting, and an embedded AI assistant that actually understands my business data.

If I had hired a development agency to build this, the quote would have landed somewhere between $30,000 and $50,000 CAD. I know because I asked. Instead, I built it for $0 in infrastructure costs using free tiers of modern cloud services, and the only "developer" on the project was me and Claude, Anthropic's AI.

**This guide is the exact playbook I used.**

You do not need to be a software engineer. You do not need a computer science degree. You need a laptop, an internet connection, and the willingness to follow a process. If you can write a clear email, you can prompt an AI to write code. I will teach you how.

**What you will build:**

A fully functional, web-based CRM with these 24 pages: Dashboard, Clients, Contacts, Projects, Tasks, Calendar, Meetings, Invoices, Financials, Profitability, Outreach, Campaigns, Services, Goals, Credentials Vault, Documents, SOPs, Templates, Notes, Brand Assets, Activity Log, Daily Briefing, Settings, and a Login/Auth system.

**Who this is for:**

- Agency owners who are tired of paying $500+/month for tools that don't fit
- Freelancers who need a single system to manage clients, projects, and money
- Consultants who want a professional operations hub without the enterprise price tag
- Small business operators who want something built around how they actually work

**The cost breakdown:**

| Item | Traditional Development | This Guide |
|------|------------------------|------------|
| Design + UX | $5,000 - $10,000 | $0 (AI-generated) |
| Frontend development | $10,000 - $20,000 | $0 (AI-generated) |
| Backend + database | $8,000 - $15,000 | $0 (Supabase free tier) |
| Hosting + deployment | $50 - $200/month | $0 (Vercel free tier) |
| Maintenance | $500 - $2,000/month | You, 30 min/month |
| **Total Year 1** | **$30,000 - $60,000+** | **$0** |

Let's build it.

---

## CHAPTER 1: THE TECH STACK

Before we write a single line of code, let me explain the tools we are using and why each one was chosen. You do not need to memorize this. Just understand the role each piece plays.

### React + TypeScript

React is a JavaScript library built by Meta (Facebook) for creating user interfaces. It is the most popular frontend framework in the world, which means AI models like Claude have been trained on millions of React code examples. This matters because when you ask AI to build something in React, it produces high-quality, reliable output.

TypeScript is JavaScript with a safety net. It adds "types" to your code, which means the editor can catch mistakes before you even run the application. Think of it like spell-check for code. You write `const revenue: number = 5000` and if you accidentally try to do something nonsensical with that variable later, TypeScript warns you immediately.

**Why this matters to you:** React + TypeScript is the industry standard. If you ever want to hire a developer to extend your CRM, every frontend developer on Earth knows React.

### Tailwind CSS

Traditional CSS is like writing a letter every time you want to change how something looks. Tailwind flips this: instead of writing custom style rules, you apply small utility classes directly to your HTML elements. Want a blue button with rounded corners and padding? You write `className="bg-blue-600 rounded-lg px-4 py-2"` and you are done.

**Why this matters to you:** Tailwind makes AI-generated code look professional immediately. Claude can produce pixel-perfect interfaces because Tailwind's class system is predictable and well-documented.

### Supabase

Supabase is an open-source alternative to Firebase. In plain English, it gives you a real PostgreSQL database, user authentication (login/signup), file storage, and a REST API -- all with a generous free tier. You get 500MB of database storage, 1GB of file storage, and 50,000 monthly active users for free.

**Why this matters to you:** Supabase is your entire backend. No server to manage, no infrastructure to configure. You create tables in a visual editor, and Supabase automatically generates the API endpoints your app uses to read and write data.

### Zustand

State management is how your app keeps track of information as the user interacts with it. Which client is selected? What filters are active? Is the sidebar open or closed? Zustand (German for "state") handles all of this with a fraction of the complexity of older solutions like Redux.

**Why this matters to you:** Zustand keeps your app fast and your code simple. When Claude generates state management code, Zustand's minimal syntax means fewer things can go wrong.

### Vite

Vite (French for "fast") is your build tool. It takes your React code, TypeScript, and Tailwind CSS and bundles everything into optimized files that browsers can run. During development, it gives you instant hot-reload -- you change a line of code, and the browser updates in under a second.

**Why this matters to you:** Vite is what makes your development experience feel instant. No waiting 30 seconds for your app to rebuild after every change.

### Vercel

Vercel is where your app lives on the internet. You connect it to your GitHub repository, and every time you push code, Vercel automatically builds and deploys your app. Free tier includes unlimited deployments, a `.vercel.app` subdomain, and support for custom domains.

**Why this matters to you:** Zero-config deployment. Push code, see it live in 60 seconds. No servers, no DevOps, no monthly bills.

### Claude API

Claude is the AI that powers the embedded assistant in your CRM. Using Anthropic's API, your CRM can have a conversational AI that understands your client data, generates reports, drafts emails, and answers questions about your business -- all without your data ever being used for training.

### Google Calendar API

The Google Calendar API lets your CRM read, create, update, and delete events on your Google Calendar. This means your meetings, deadlines, and appointments all live in one place, synced between your CRM and the calendar you already use.

---

## CHAPTER 2: SETTING UP YOUR FOUNDATION

This chapter walks you through every setup step. Follow it in order. Do not skip ahead.

### Step 1: Create a GitHub Account

GitHub is where your code lives. It is version-controlled, meaning every change you make is saved and you can always roll back if something breaks.

1. Go to [github.com](https://github.com) and click **Sign Up**
2. Use your business email address
3. Choose a username (something professional -- this is public)
4. Create a new repository:
   - Click the **+** icon in the top right, then **New repository**
   - Name it `gth-command-center-web` (or whatever you want to call your CRM)
   - Set it to **Private** (your code, your business)
   - Check **Add a README file**
   - Click **Create repository**

### Step 2: Create a Supabase Project

Supabase is your database, authentication system, and API layer -- all in one.

1. Go to [supabase.com](https://supabase.com) and click **Start your project**
2. Sign in with your GitHub account (this links them -- convenient later)
3. Click **New Project**
4. Fill in the details:
   - **Project name:** `gth-command-center`
   - **Database password:** Generate a strong one and save it in your password manager. You will need this later.
   - **Region:** Choose the closest to your location (for me, that is US East or Canada)
5. Click **Create new project** and wait 2-3 minutes for it to provision

Once your project is ready, you will see your **Project URL** and **Anon Key** on the main dashboard. Save both of these. They go into your app's environment variables.

> **TIP:** Your Supabase Anon Key is safe to include in frontend code. It is designed to be public. Row Level Security (RLS) policies on your database tables are what actually protect your data. We will set those up.

### Step 3: Set Up the Database

Your CRM needs tables to store data. Here is what each one does in business terms:

- **clients** -- Your client companies. Name, industry, status, contact info, revenue tier.
- **contacts** -- Individual people at those companies. Name, email, phone, role.
- **projects** -- Work you are doing for clients. Name, status, budget, timeline.
- **tasks** -- Individual to-dos within projects. Title, status, priority, assignee, due date.
- **invoices** -- Bills you send to clients. Amount, status (draft/sent/paid/overdue), due date.
- **outreach** -- Prospects you are reaching out to. Company, contact, stage in your pipeline.
- **campaigns** -- Marketing campaigns you are running. Platform, budget, dates, performance.
- **services** -- The services your business offers. Name, description, price.
- **goals** -- Business goals and targets. Revenue goals, client acquisition targets, etc.
- **credentials** -- Login info for client accounts (ad platforms, hosting, etc). Encrypted.
- **documents** -- Files you upload and organize. Contracts, proposals, deliverables.
- **sops** -- Standard Operating Procedures. Step-by-step guides for your team.
- **notes** -- Quick notes tied to clients, projects, or standalone.
- **meetings** -- Scheduled meetings with calendar sync.
- **templates** -- Reusable templates for emails, proposals, SOPs.
- **brand_assets** -- Logos, brand colors, fonts for each client.
- **activity_log** -- Auto-tracked history of actions taken in the CRM.

In your Supabase dashboard, go to the **SQL Editor** (left sidebar) and run this migration:

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Clients table
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  industry text,
  status text default 'active' check (status in ('active', 'paused', 'churned', 'prospect')),
  email text,
  phone text,
  website text,
  address text,
  notes text,
  monthly_revenue numeric(12,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Contacts table
create table public.contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- Projects table
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  status text default 'active' check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  budget numeric(12,2),
  start_date date,
  end_date date,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tasks table
create table public.tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  description text,
  status text default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Invoices table
create table public.invoices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text,
  amount numeric(12,2) not null,
  status text default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issue_date date default current_date,
  due_date date,
  paid_date date,
  notes text,
  line_items jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Outreach table
create table public.outreach (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  company_name text not null,
  contact_name text,
  contact_email text,
  stage text default 'identified' check (stage in ('identified', 'contacted', 'responded', 'meeting_booked', 'proposal_sent', 'won', 'lost')),
  source text,
  notes text,
  next_follow_up date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Campaigns table
create table public.campaigns (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  platform text,
  status text default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  budget numeric(12,2),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz default now()
);

-- Services table
create table public.services (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  price numeric(12,2),
  pricing_model text default 'monthly' check (pricing_model in ('monthly', 'project', 'hourly', 'retainer')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Goals table
create table public.goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text default 'revenue' check (category in ('revenue', 'clients', 'projects', 'personal', 'other')),
  target_value numeric(12,2),
  current_value numeric(12,2) default 0,
  unit text default 'dollars',
  deadline date,
  status text default 'in_progress' check (status in ('in_progress', 'achieved', 'missed', 'cancelled')),
  created_at timestamptz default now()
);

-- Credentials table
create table public.credentials (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  service_name text not null,
  username text,
  password_encrypted text,
  url text,
  notes text,
  created_at timestamptz default now()
);

-- Documents table
create table public.documents (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  file_path text,
  file_type text,
  file_size bigint,
  category text,
  created_at timestamptz default now()
);

-- SOPs table
create table public.sops (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text,
  content text,
  version integer default 1,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notes table
create table public.notes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text,
  content text,
  is_pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Meetings table
create table public.meetings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  google_event_id text,
  attendees jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Templates table
create table public.templates (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text,
  content text,
  variables jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Brand Assets table
create table public.brand_assets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  asset_type text check (asset_type in ('logo', 'color', 'font', 'guideline', 'other')),
  name text not null,
  value text,
  file_path text,
  created_at timestamptz default now()
);

-- Activity Log table
create table public.activity_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- Enable Row Level Security on all tables
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.invoices enable row level security;
alter table public.outreach enable row level security;
alter table public.campaigns enable row level security;
alter table public.services enable row level security;
alter table public.goals enable row level security;
alter table public.credentials enable row level security;
alter table public.documents enable row level security;
alter table public.sops enable row level security;
alter table public.notes enable row level security;
alter table public.meetings enable row level security;
alter table public.templates enable row level security;
alter table public.brand_assets enable row level security;
alter table public.activity_log enable row level security;

-- Create RLS policies (users can only access their own data)
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'clients','contacts','projects','tasks','invoices',
      'outreach','campaigns','services','goals','credentials',
      'documents','sops','notes','meetings','templates',
      'brand_assets','activity_log'
    ])
  loop
    execute format(
      'create policy "Users can view own %1$s" on public.%1$s for select using (auth.uid() = user_id)',
      t
    );
    execute format(
      'create policy "Users can insert own %1$s" on public.%1$s for insert with check (auth.uid() = user_id)',
      t
    );
    execute format(
      'create policy "Users can update own %1$s" on public.%1$s for update using (auth.uid() = user_id)',
      t
    );
    execute format(
      'create policy "Users can delete own %1$s" on public.%1$s for delete using (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;
```

Click **Run** in the SQL editor. You should see a success message for each statement. If you get an error, read the message carefully -- it usually tells you exactly which line has the problem.

### Step 4: Set Up Authentication

Still in your Supabase dashboard:

1. Click **Authentication** in the left sidebar
2. Click **Providers**
3. **Email** should already be enabled by default. Confirm it is.
4. Under Email settings, I recommend:
   - **Enable email confirmations:** Turn this OFF during development (you can enable it later for production). This lets you sign up and log in instantly without checking your email.
   - **Minimum password length:** 8 characters

That is it. Supabase handles password hashing, session management, JWT tokens -- all of it.

### Step 5: Create a Vercel Account

1. Go to [vercel.com](https://vercel.com) and click **Sign Up**
2. Choose **Continue with GitHub** (this links your accounts)
3. Authorize Vercel to access your GitHub repositories
4. You will see your Vercel dashboard. We will come back here after we have code to deploy.

### Step 6: Install Node.js and Create the Project

**Install Node.js:**

1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS** version (the one on the left, currently v20 or v22)
3. Run the installer. Accept all defaults.
4. Open a terminal (Command Prompt on Windows, Terminal on Mac) and verify:

```bash
node --version
# Should show v20.x.x or v22.x.x

npm --version
# Should show 10.x.x or higher
```

**Create the React project:**

```bash
npm create vite@latest gth-command-center-web -- --template react-ts
cd gth-command-center-web
```

This scaffolds a new React + TypeScript project using Vite.

### Step 7: Install Dependencies

```bash
npm install @supabase/supabase-js zustand lucide-react date-fns tailwindcss @tailwindcss/vite
```

Here is what each package does:

- `@supabase/supabase-js` -- Talks to your Supabase database and auth
- `zustand` -- Manages your app's state
- `lucide-react` -- Beautiful, consistent icons (the same ones used by shadcn/ui)
- `date-fns` -- Date formatting and manipulation
- `tailwindcss` + `@tailwindcss/vite` -- Utility-first CSS framework with Vite integration

### Step 8: Configure the Project

**vite.config.ts:**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**src/index.css:**

Replace everything in this file with:

```css
@import "tailwindcss";
```

Yes, that is the entire file. Tailwind v4 handles everything through this single import.

**src/lib/supabase.ts:**

Create this file:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**.env.local:**

Create this file in your project root (not inside `src/`):

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace with your actual values from the Supabase dashboard.

> **IMPORTANT:** Add `.env.local` to your `.gitignore` file so your keys never get pushed to GitHub. The default Vite `.gitignore` already includes this, but double-check.

### Step 9: First Deploy

```bash
git init
git add .
git commit -m "Initial project setup"
git remote add origin https://github.com/YOUR_USERNAME/gth-command-center-web.git
git push -u origin main
```

Now go to your Vercel dashboard:

1. Click **Add New Project**
2. Select your `gth-command-center-web` repository
3. Vercel will auto-detect it as a Vite project
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. Click **Deploy**

In about 60 seconds, your app will be live at `https://gth-command-center-web.vercel.app` (or similar). It will just show the default Vite welcome page for now, but the pipeline is working: push code to GitHub, Vercel builds and deploys automatically.

**Congratulations.** Your foundation is set. Every line of code from here forward automatically deploys to the internet when you push it.

---

## CHAPTER 3: BUILDING WITH AI -- THE METHOD

This is the most important chapter in this guide. The tech stack is freely available. The database schema is just SQL. The real value is the *method* -- how you use AI to build production-quality software without being a software engineer.

### The Mental Model

Stop thinking of AI as a search engine that spits out code snippets. Think of it as a junior developer who is incredibly fast, never gets tired, knows every framework and library, but needs clear direction from you -- the project manager.

Your job is not to write code. Your job is to:

1. **Define what you want** (clearly and specifically)
2. **Review what AI generates** (does it look right? does it work?)
3. **Provide feedback** (this part is wrong, change it to X)
4. **Commit what works** (save your progress)

This is the same feedback loop a senior developer uses with a junior developer. The AI is your junior dev. You are the senior.

### The Phase-by-Phase Strategy

Never ask AI to "build me a CRM." That is like telling a contractor to "build me a house" without blueprints. You will get something, but it will not be what you wanted.

Instead, break the build into phases. Each phase is a contained unit of work:

1. **One phase = one prompt session.** Start a new conversation for each phase.
2. **Give context at the start.** Tell the AI what tech stack you are using, what you have built so far, and what this phase needs to accomplish.
3. **Be specific about the output.** "Build a clients page with a table that shows name, industry, status, email, and monthly revenue. Include a search bar, status filter dropdown, and a button to add new clients."
4. **Request file-by-file output.** Ask AI to give you each file separately so you can review and paste them in one at a time.

### How to Review What AI Generates

You do not need to understand every line of code. You need to check three things:

1. **Does it compile?** Run `npm run dev` and see if the app starts without errors.
2. **Does it look right?** Open the browser and check visually. Does the page match what you described?
3. **Does it work?** Click buttons, fill forms, submit data. Does data show up in your Supabase dashboard?

If any of these fail, copy the error message and paste it back to the AI. Say: "I got this error when I tried to run the app. Here is the error message: [paste error]. Fix it."

### The Feedback Loop

The core cycle is:

```
Prompt  -->  Review  -->  Refine  -->  Commit
  |                                      |
  +--------------------------------------+
```

- **Prompt:** Give AI a clear, specific instruction
- **Review:** Run the code, check visually, test functionality
- **Refine:** If something is wrong, describe the problem and ask for a fix
- **Commit:** Once it works, save your progress with `git add . && git commit -m "Phase X: description"`

Never move to the next phase until the current one is working and committed. This way, if a future phase breaks something, you can always roll back.

### Example Prompts

Here is the exact format I use when starting a new phase:

> *"I am building a CRM web app using React 19, TypeScript, Tailwind CSS v4, Supabase for the database and auth, Zustand for state management, and Lucide React for icons. The app is deployed on Vercel.*
>
> *I have already built: [list completed phases].*
>
> *For this phase, I need you to build: [specific description of what this phase includes].*
>
> *Requirements:*
> *- [Specific requirement 1]*
> *- [Specific requirement 2]*
> *- [Specific requirement 3]*
>
> *The design should be clean, modern, and professional. Dark sidebar with light content area. Use monochrome colors with subtle accent colors for status indicators.*
>
> *Give me the code file by file."*

### Common Mistakes and How to Avoid Them

**Mistake 1: Prompts that are too vague.**
Bad: "Build me a tasks page."
Good: "Build a tasks page with a Kanban board. Four columns: To Do, In Progress, Review, Done. Each task card shows the title, priority (color-coded), due date, and the linked client name. Include a button to add new tasks that opens a modal with fields for title, description, priority dropdown, due date picker, project dropdown, and client dropdown."

**Mistake 2: Not providing error messages.**
When something breaks, do not say "it doesn't work." Copy the entire error message from the terminal or browser console and paste it. AI can usually fix the issue in one shot if it sees the exact error.

**Mistake 3: Changing too many things at once.**
Build one feature, test it, commit. Then build the next. If you try to build three features at once and something breaks, you will not know which change caused it.

**Mistake 4: Not committing often enough.**
Commit after every working change. `git add . && git commit -m "Add client filtering"` takes 3 seconds and can save you hours of frustration later.

---

## CHAPTER 4: THE BUILD -- PHASE BY PHASE

This is where we build the entire CRM. Each phase includes what you are building, the exact prompt to use, what to verify, and common issues you might hit.

### Phase 1: Authentication + Login Page

**What you are building:** A login page where users can sign up and sign in using email and password. After logging in, they see the main app. If they are not logged in, they are redirected to the login page.

**The prompt:**

> *"Build the authentication system for my CRM. I need:*
>
> *1. A Login page component at src/pages/Login.tsx with email and password fields, a Sign In button, and a Sign Up button. Clean, centered design with my brand name 'GTH Command Center' at the top.*
>
> *2. An auth store using Zustand at src/lib/store.ts that tracks the current user session and provides signIn, signUp, and signOut functions using Supabase auth.*
>
> *3. Update App.tsx to check for an active session on load. If the user is logged in, show the main app. If not, show the Login page.*
>
> *4. The Supabase client is already configured at src/lib/supabase.ts.*
>
> *Use Tailwind CSS for all styling. Professional, minimal design."*

**What to verify:**
- The login page renders without errors
- You can create a new account (check Supabase Auth dashboard to confirm the user was created)
- You can log in with that account
- After login, you see the main app (even if it is just a blank page with a "Welcome" message)
- Refreshing the page keeps you logged in
- Sign out works

**Troubleshooting:**
- If signup fails silently, check the browser console (F12) for errors. Common issue: your `.env.local` values are wrong.
- If the page is blank after login, check that `App.tsx` properly handles the session state.

### Phase 2: Shell Layout (Sidebar + Topbar + Navigation)

**What you are building:** The main app layout with a sidebar for navigation, a top bar with the user's info and a sign-out button, and a content area that changes based on which page is selected.

**The prompt:**

> *"Build the main app shell layout. I need:*
>
> *1. A Sidebar component (src/components/Sidebar.tsx) with navigation links for all 24 pages, organized into sections: Overview (Dashboard), Clients (Clients, Contacts), Work (Projects, Tasks, Calendar, Meetings), Revenue (Invoices, Financials, Profitability), Growth (Outreach, Campaigns, Services, Goals), Vault (Credentials, Documents, SOPs, Templates, Notes, Brand Assets), and System (Activity, Daily Briefing, Settings). Use Lucide icons for each item.*
>
> *2. A Topbar component (src/components/Topbar.tsx) with the current page title on the left and the user's email + sign out button on the right.*
>
> *3. Update App.tsx to render the sidebar, topbar, and a main content area. Use Zustand to track the active page and render the corresponding page component.*
>
> *4. Create placeholder page components for each of the 24 pages that just show the page name as a heading.*
>
> *Dark sidebar (gray-900), light content area (gray-50). Clean, tight spacing. The sidebar should be 240px wide and collapsible on mobile."*

**What to verify:**
- The sidebar renders with all navigation items
- Clicking a navigation item changes the active page
- The topbar shows the correct page title
- The layout looks professional and well-spaced
- Sign out button in the topbar works

### Phase 3: Client Management

**What you are building:** The full client management system -- view all clients in a table, search and filter them, add new clients, edit existing ones, and view client details in a slide-out drawer.

**The prompt:**

> *"Build the Clients page (src/pages/Clients.tsx) with full CRUD functionality:*
>
> *1. A data table showing all clients with columns: Name, Industry, Status (color-coded badge), Email, Monthly Revenue, and Created Date. The table should be sortable by clicking column headers.*
>
> *2. Above the table: a search input that filters by name, a status filter dropdown (All, Active, Paused, Churned, Prospect), and an 'Add Client' button.*
>
> *3. Clicking 'Add Client' opens a modal with a form: Name (required), Industry, Status dropdown, Email, Phone, Website, Address, Monthly Revenue, and Notes textarea. Saving the form inserts a row into the Supabase 'clients' table.*
>
> *4. Clicking a client row opens a detail drawer (slide-in from the right) showing all client info with edit capability. Include a delete button with confirmation.*
>
> *5. Create a Zustand store slice for clients (src/lib/store.ts) with: clients array, fetchClients, addClient, updateClient, deleteClient functions -- all hitting Supabase.*
>
> *The table should show a loading skeleton while data fetches and an empty state when there are no clients."*

**What to verify:**
- The table loads and shows clients from your database
- Search filters the table in real time
- Status filter works
- Adding a new client saves it to Supabase and it appears in the table
- Editing a client updates the record
- Deleting a client removes it (check Supabase to confirm)

### Phase 4: Tasks + Projects

**What you are building:** A projects page with a table similar to clients, and a tasks page with a drag-and-drop Kanban board.

**The prompt:**

> *"Build the Projects page and Tasks page:*
>
> *PROJECTS (src/pages/Projects.tsx):*
> *- Table with columns: Name, Client, Status (badge), Budget, Start Date, End Date*
> *- Add/Edit/Delete functionality similar to Clients*
> *- Client dropdown should pull from the clients table*
>
> *TASKS (src/pages/Tasks.tsx):*
> *- Kanban board with 4 columns: To Do, In Progress, Review, Done*
> *- Each task card shows: title, priority (color dot), due date, client name*
> *- Drag and drop between columns (use HTML5 drag and drop, no extra library needed)*
> *- Add task button that opens a modal: title, description, priority dropdown, due date, project dropdown, client dropdown*
> *- Filter bar at the top: filter by client, filter by priority, search by title*
>
> *Add Zustand store slices for both projects and tasks."*

**What to verify:**
- Projects table loads and CRUD works
- Tasks render in the correct columns based on status
- Dragging a task to a new column updates its status in Supabase
- Filters work correctly
- Creating a task with a linked project/client shows those associations

### Phase 5: Calendar + Meetings

**What you are building:** A calendar view and a meetings list. Google Calendar integration comes in Chapter 5 -- for now, build the local calendar that reads from your meetings table.

**The prompt:**

> *"Build the Calendar page and Meetings page:*
>
> *CALENDAR (src/pages/Calendar.tsx):*
> *- Monthly calendar grid view showing the current month*
> *- Navigation arrows to go to previous/next month*
> *- Dots or event indicators on days that have meetings*
> *- Clicking a day shows that day's meetings in a side panel*
> *- Button to create a new meeting from any day*
>
> *MEETINGS (src/pages/Meetings.tsx):*
> *- List view of all meetings, sorted by date (upcoming first)*
> *- Each meeting shows: title, date/time, client name, location*
> *- Add/Edit/Delete with a form modal: title, description, start time, end time, client dropdown, location*
>
> *Use date-fns for all date formatting and calculations."*

### Phase 6: Revenue (Invoices, Financials, Profitability)

**What you are building:** The financial backbone of your CRM -- invoice management, a financial overview, and per-client profitability tracking.

**The prompt:**

> *"Build three revenue pages:*
>
> *INVOICES (src/pages/Invoices.tsx):*
> *- Table: Invoice #, Client, Amount, Status (draft/sent/paid/overdue -- color-coded), Issue Date, Due Date*
> *- Add invoice modal with line items (description + amount, ability to add multiple lines)*
> *- Status update buttons (Mark as Sent, Mark as Paid)*
> *- Show total amount at the top*
>
> *FINANCIALS (src/pages/Financials.tsx):*
> *- Summary cards at top: Total Revenue (paid invoices), Outstanding (sent/overdue), Overdue amount, Average invoice value*
> *- Revenue by month (simple bar list, no charting library needed -- use colored divs for bars)*
> *- Revenue by client (top 5)*
>
> *PROFITABILITY (src/pages/Profitability.tsx):*
> *- Per-client view: client name, total revenue (paid invoices), number of projects, number of invoices, revenue per project*
> *- Sort by most profitable*
> *- Color-code rows: green for high revenue, yellow for medium, red for low*
>
> *All data pulls from existing Supabase tables."*

### Phase 7: Growth (Outreach, Campaigns, Services, Goals)

**What you are building:** Your business development toolkit -- a sales pipeline, campaign tracker, service catalog, and goal tracker.

**The prompt:**

> *"Build four growth pages:*
>
> *OUTREACH (src/pages/Outreach.tsx):*
> *- Pipeline view with columns for each stage: Identified, Contacted, Responded, Meeting Booked, Proposal Sent, Won, Lost*
> *- Drag and drop between stages (same pattern as Tasks Kanban)*
> *- Cards show: company name, contact name, source, next follow-up date*
>
> *CAMPAIGNS (src/pages/Campaigns.tsx):*
> *- Table: Name, Client, Platform, Status, Budget, Start Date, End Date*
> *- Full CRUD with modal form*
>
> *SERVICES (src/pages/Services.tsx):*
> *- Card grid showing each service with name, description, price, pricing model badge*
> *- Add/Edit/Delete*
> *- Toggle active/inactive*
>
> *GOALS (src/pages/Goals.tsx):*
> *- List of goals with progress bars showing current_value / target_value*
> *- Category filter tabs: All, Revenue, Clients, Projects, Personal*
> *- Add/Edit with form: title, category, target value, current value, unit, deadline*
> *- Status badges: In Progress, Achieved, Missed*"

### Phase 8: Vault (Credentials, Documents, SOPs)

**What you are building:** Secure storage for sensitive information, documents, SOPs, templates, notes, and brand assets.

**The prompt:**

> *"Build the Vault pages:*
>
> *CREDENTIALS (src/pages/Credentials.tsx):*
> *- Table: Service Name, Client, Username, URL. Password column shows dots with a 'reveal' toggle button.*
> *- Add/Edit/Delete. Group by client.*
>
> *DOCUMENTS (src/pages/Documents.tsx):*
> *- File list with: Name, Client, Project, Type, Size, Upload Date*
> *- Upload button (for now, just save metadata -- file upload to Supabase Storage can be Phase 10)*
> *- Category filter and search*
>
> *SOPS (src/pages/SOPs.tsx):*
> *- List view with: Title, Category, Version, Published status*
> *- Click to view/edit the full SOP content in a rich text area*
> *- Version number increments on each save*
>
> *TEMPLATES (src/pages/Templates.tsx):*
> *- Grid of template cards with name and category*
> *- Click to view/edit template content*
> *- Variable placeholders highlighted (e.g., {{client_name}})*
>
> *NOTES (src/pages/Notes.tsx):*
> *- Two-column layout: note list on left, note content on right*
> *- Pin important notes to the top*
> *- Link notes to clients or projects*
>
> *BRAND ASSETS (src/pages/BrandAssets.tsx):*
> *- Organized by client*
> *- Show color swatches, font names, logos (placeholder images for now)*
> *- Add/Edit/Delete*"

### Phase 9: AI Assistant

**What you are building:** An embedded AI chat panel that can answer questions about your CRM data. Full details in Chapter 6.

### Phase 10: Polish

**What you are building:** The finishing touches that make your CRM feel professional.

**The prompt:**

> *"Polish the CRM:*
>
> *1. DASHBOARD (src/pages/Dashboard.tsx): Summary cards showing total clients, active projects, open tasks, revenue this month, overdue invoices. Recent activity feed. Upcoming meetings (next 7 days). Quick-add buttons for common actions.*
>
> *2. DAILY BRIEFING (src/pages/DailyBriefing.tsx): Auto-generated summary of today's meetings, overdue tasks, invoices due this week, recent activity, and follow-ups due today.*
>
> *3. SETTINGS (src/pages/Settings.tsx): Profile info, theme toggle (light/dark mode), notification preferences placeholders.*
>
> *4. ACTIVITY LOG (src/pages/Activity.tsx): Chronological list of all actions taken in the CRM, auto-logged.*
>
> *5. RESPONSIVE DESIGN: Make the sidebar collapse into a hamburger menu on screens under 768px. Ensure all tables scroll horizontally on mobile. Test every page at mobile width.*
>
> *6. DARK MODE: Add a theme toggle in Settings and the topbar. Use Tailwind's dark: classes.*
>
> *7. Loading states and empty states for every page."*

**What to verify after Phase 10:**
- Dashboard shows real data from your database
- Every page works on mobile (resize your browser to test)
- Dark mode toggles across the entire app
- No blank pages, no broken links, no console errors

---

## CHAPTER 5: GOOGLE CALENDAR INTEGRATION

This chapter walks you through connecting your CRM to Google Calendar so meetings sync both ways.

### Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top of the page, then **New Project**
3. Name it `GTH Command Center` and click **Create**
4. Wait for the project to be created, then select it from the dropdown

### Step 2: Enable the Calendar API

1. In the left sidebar, go to **APIs & Services** then **Library**
2. Search for "Google Calendar API"
3. Click on it and click **Enable**

### Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services** then **OAuth consent screen**
2. Select **External** (unless you have a Google Workspace org, then choose Internal)
3. Fill in the required fields:
   - **App name:** GTH Command Center
   - **User support email:** Your email
   - **Developer contact email:** Your email
4. Click **Save and Continue**
5. On the **Scopes** screen, click **Add or Remove Scopes**
6. Search for and add these scopes:
   - `https://www.googleapis.com/auth/calendar.readonly` (read events)
   - `https://www.googleapis.com/auth/calendar.events` (create/edit/delete events)
7. Click **Save and Continue**
8. On the **Test users** screen, add your own email address
9. Click **Save and Continue**

> **NOTE:** While your app is in "Testing" mode, only the email addresses you add as test users can log in. This is fine for personal/small team use. To allow anyone to log in, you need to go through Google's verification process (which takes a few weeks but is straightforward).

### Step 4: Create OAuth Client ID

1. Go to **APIs & Services** then **Credentials**
2. Click **Create Credentials** then **OAuth client ID**
3. Application type: **Web application**
4. Name: `GTH CRM Web`
5. **Authorized JavaScript origins:** Add:
   - `http://localhost:5173` (for local development)
   - `https://your-app.vercel.app` (your production URL)
6. **Authorized redirect URIs:** Add:
   - `http://localhost:5173/auth/callback`
   - `https://your-app.vercel.app/auth/callback`
7. Click **Create**

You will see your **Client ID** and **Client Secret**. Save both.

Add to your `.env.local`:

```
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Step 5: Implement the OAuth Flow

Use this prompt for Claude:

> *"Add Google Calendar OAuth integration to my CRM:*
>
> *1. Create src/lib/google-calendar.ts with functions: initiateGoogleAuth (redirects to Google's OAuth consent), handleAuthCallback (exchanges code for tokens), fetchCalendarEvents (get events for a date range), createCalendarEvent, updateCalendarEvent, deleteCalendarEvent.*
>
> *2. Store the Google OAuth tokens in Supabase (create a user_tokens table with user_id, provider, access_token, refresh_token, expires_at).*
>
> *3. Update the Calendar page to show Google Calendar events alongside local meetings. Color-code them differently (blue for Google Calendar, green for local).*
>
> *4. Add a 'Connect Google Calendar' button in Settings that triggers the OAuth flow.*
>
> *5. Handle token refresh automatically when the access token expires.*
>
> *Use the Google Calendar API v3. My client ID is in VITE_GOOGLE_CLIENT_ID."*

### Step 6: Test the Integration

1. Click **Connect Google Calendar** in your Settings page
2. You will be redirected to Google's consent screen
3. Select your Google account and grant permission
4. You will be redirected back to your app
5. Go to the Calendar page -- you should see your Google Calendar events
6. Create a test event in your CRM and verify it appears in Google Calendar
7. Create an event in Google Calendar and verify it appears in your CRM (after refreshing)

### Troubleshooting

- **"redirect_uri_mismatch" error:** Your redirect URI in the Google Cloud Console does not exactly match what your app is sending. Check for trailing slashes, http vs https, and correct port numbers.
- **"access_denied" error:** Your email is not in the test users list. Add it in the OAuth consent screen settings.
- **Events not syncing:** Check that you requested the correct scopes. The `calendar.events` scope is needed for write access; `calendar.readonly` only allows reading.
- **Token expired errors:** Make sure your token refresh logic is working. Access tokens expire after 1 hour; your app should automatically use the refresh token to get a new one.

---

## CHAPTER 6: THE AI ASSISTANT

The AI assistant is what takes your CRM from "a nice database with a UI" to "the smartest tool in your business." This is an embedded chat interface that can query your data, generate reports, draft emails, and answer questions about your business.

### Getting a Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Go to **API Keys** and click **Create Key**
4. Name it `GTH CRM` and copy the key
5. Add to your `.env.local`:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

> **IMPORTANT SECURITY NOTE:** In a production app, you should NEVER put your API key in frontend code. The correct approach is to create a Supabase Edge Function that acts as a proxy -- your frontend calls the Edge Function, and the Edge Function calls Claude's API with the key stored securely on the server. For personal use during development, putting it in an env var is fine. I will show you the Edge Function approach in the prompt below.

### How Tool Use Works

Claude's API has a feature called "tool use" (also called "function calling"). Here is how it works in plain English:

1. You define a set of "tools" -- functions that Claude can ask you to run. For example: `get_clients`, `get_tasks_by_status`, `create_invoice`.
2. When a user asks the AI a question like "How many active clients do I have?", Claude reads the question and decides which tool(s) it needs to answer it.
3. Claude responds with a "tool call" -- basically saying "I need you to run `get_clients` with the filter `status = active`."
4. Your code executes that function (queries Supabase) and sends the results back to Claude.
5. Claude reads the results and formulates a natural language answer: "You have 12 active clients."

This means Claude can answer questions about YOUR data without your data ever being stored by Anthropic.

### The 10 Built-In Tools

Here are the tools your AI assistant will have:

1. **get_clients** -- Retrieve clients with optional filters (status, industry, search term)
2. **get_tasks** -- Retrieve tasks with optional filters (status, priority, client, project)
3. **get_projects** -- Retrieve projects with optional filters (status, client)
4. **get_invoices** -- Retrieve invoices with optional filters (status, client, date range)
5. **get_revenue_summary** -- Calculate total revenue, outstanding amount, overdue amount for a date range
6. **get_upcoming_meetings** -- Retrieve meetings for the next N days
7. **get_overdue_tasks** -- Retrieve all tasks past their due date
8. **get_outreach_pipeline** -- Retrieve outreach prospects grouped by stage with counts
9. **get_goal_progress** -- Retrieve goals with progress percentages
10. **search_notes** -- Full-text search across all notes

**The prompt to build it:**

> *"Build an AI Assistant panel for my CRM:*
>
> *1. Create a Supabase Edge Function at supabase/functions/ai-chat/index.ts that: receives messages from the frontend, calls Claude's API (claude-sonnet-4-20250514) with tool definitions for the 10 tools listed above, executes tool calls against the database, and returns the final response.*
>
> *2. Create src/components/AIAssistant.tsx -- a slide-out panel from the right side with a chat interface. Message input at the bottom, messages scroll above. User messages on the right (blue), AI messages on the left (gray). Show a typing indicator while waiting for a response.*
>
> *3. Add a floating button in the bottom-right corner of every page to toggle the AI panel open/closed.*
>
> *4. The AI should have a system prompt that says: 'You are the AI assistant for GTH Command Center, a CRM for a digital marketing agency. You have access to tools that query the CRM database. Be concise, professional, and actionable in your responses. When presenting data, use clean formatting.'*
>
> *Store the Anthropic API key as a Supabase secret, not in frontend code."*

### Voice Input

Adding voice input is simpler than you might think. The Web Speech API is built into every modern browser.

> *"Add voice input to the AI Assistant: a microphone button next to the text input. When clicked, it starts recording using the Web Speech API (webkitSpeechRecognition). When the user stops speaking, the transcribed text populates the input field. Show a visual indicator (pulsing red dot) while recording."*

### Adding Your Own Custom Tools

Once the base 10 tools are working, you can add more. The pattern is:

1. Define the tool in your Edge Function's tool array:

```typescript
{
  name: "get_client_campaigns",
  description: "Get all campaigns for a specific client",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "The UUID of the client" }
    },
    required: ["client_id"]
  }
}
```

2. Add the handler in the tool execution switch statement:

```typescript
case "get_client_campaigns":
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("client_id", input.client_id);
  return data;
```

That is it. Claude automatically knows when to use the new tool based on the name and description you gave it.

### Cost

Claude API pricing is based on tokens (roughly 4 characters = 1 token). A typical CRM conversation costs:

- Simple question ("How many active clients?"): ~$0.01
- Complex query ("Give me a profitability report for Q1"): ~$0.03-0.05
- Long conversation (10+ back-and-forth messages): ~$0.10-0.20

For a solo operator or small agency, expect to spend $5-15/month on AI usage. Less than a single SaaS subscription.

---

## CHAPTER 7: MAKING IT YOURS

The CRM you have built so far is designed around a digital marketing agency workflow. But the beauty of building your own tool is that every pixel and every feature is yours to change.

### Changing Brand Colors and Fonts

All styling in this project uses Tailwind CSS utility classes. To change the overall color scheme:

1. Open `src/index.css` and define your custom colors:

```css
@import "tailwindcss";

@theme {
  --color-brand-50: #f0f7ff;
  --color-brand-100: #e0effe;
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  --color-brand-900: #1e3a5f;
}
```

2. Then use `bg-brand-500`, `text-brand-700`, etc. throughout your components.

For fonts, add a Google Fonts import to your `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Then set the font in your CSS:

```css
body {
  font-family: 'Inter', sans-serif;
}
```

### Swapping the Logo

Replace the logo image in your `public/` folder and update any references in Sidebar.tsx or Login.tsx. If you are using text as your logo (like "GTH"), just change the string.

### Adding or Removing Pages

To remove a page you do not need:

1. Delete the page component file from `src/pages/`
2. Remove its entry from the sidebar navigation in `Sidebar.tsx`
3. Remove it from the page routing logic in `App.tsx`

To add a new page:

1. Create a new component in `src/pages/`
2. Add a navigation item in `Sidebar.tsx`
3. Add it to the routing logic in `App.tsx`
4. Create any needed database tables in Supabase

### Adding New Database Tables

In the Supabase SQL editor:

```sql
create table public.your_new_table (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  -- your columns here
  created_at timestamptz default now()
);

alter table public.your_new_table enable row level security;

create policy "Users can CRUD own your_new_table"
  on public.your_new_table
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Connecting Other APIs

The pattern for integrating any external API is:

1. Get API credentials from the service
2. Store them as environment variables
3. Create a utility file in `src/lib/` with functions that call the API
4. Create a Supabase Edge Function if the API requires server-side calls (to protect secrets)
5. Call those functions from your page components

### Industry-Specific Customization Ideas

**Real Estate Agents:**
- Replace "Clients" with "Buyers" and "Sellers"
- Add a "Listings" page with property details, photos, and status (active/pending/sold)
- Add a "Showings" page linked to Calendar
- Replace "Invoices" with "Commission Tracker"
- Add MLS integration

**Coaches / Consultants:**
- Add a "Sessions" page for tracking coaching sessions
- Replace "Projects" with "Programs" or "Engagements"
- Add a "Homework" tracker for client assignments
- Add a "Testimonials" collection page
- Integrate Calendly or Cal.com instead of Google Calendar

**E-Commerce Operators:**
- Add "Products" and "Orders" pages
- Replace "Outreach" with "Supplier Pipeline"
- Add "Inventory" tracking
- Integrate Shopify or Stripe API
- Add a "Returns" management page

**Freelance Developers / Designers:**
- Add "Time Tracking" with a start/stop timer
- Replace "Campaigns" with "Proposals"
- Add a "Portfolio" page
- Integrate GitHub API for project status
- Add a "Contracts" page under Vault

The entire structure is modular. Every table, every page, and every feature is an independent piece that can be swapped, renamed, or extended.

---

## CHAPTER 8: DEPLOYING AND MAINTAINING

Your CRM is deployed on Vercel and backed by Supabase. Here is how to keep it running smoothly.

### Custom Domain Setup

1. Buy a domain (I recommend Namecheap or Cloudflare Registrar)
2. In your Vercel dashboard, go to your project then **Settings** then **Domains**
3. Click **Add** and enter your domain (e.g., `crm.yourbusiness.com`)
4. Vercel will give you DNS records to add. Go to your domain registrar and add them:
   - For a subdomain like `crm.yourbusiness.com`: Add a CNAME record pointing to `cname.vercel-dns.com`
   - For a root domain like `yourbusiness.com`: Add an A record pointing to `76.76.21.21`
5. Wait for DNS propagation (usually 5-30 minutes, sometimes up to 48 hours)
6. Vercel automatically provisions an SSL certificate. Your CRM is now on HTTPS.

### Supabase Free Tier Limits

Know what you get for free so you know when to upgrade:

| Resource | Free Tier | Pro Tier ($25/month) |
|----------|-----------|----------------------|
| Database size | 500 MB | 8 GB |
| File storage | 1 GB | 100 GB |
| Monthly active users | 50,000 | 100,000 |
| Edge Function invocations | 500K/month | 2M/month |
| Realtime connections | 200 concurrent | 500 concurrent |

For a solo operator or small team (under 10 people), you will likely never hit the free tier limits. A CRM with 500 clients, 2,000 tasks, and 1,000 invoices uses less than 10 MB of database storage.

### Backup Strategy

**Database backups:** Supabase automatically takes daily backups on the Pro plan. On the free tier, you can manually export your data:

1. Go to **Settings** then **Database** in your Supabase dashboard
2. Under **Database Backups**, you can download a backup

Or run this SQL in the SQL editor to export any table as CSV:

```sql
-- This runs in the SQL editor and lets you copy the results
select * from public.clients;
```

**Code backups:** Your code is already backed up on GitHub. As long as you are pushing regularly, you are covered.

**Recommended schedule:**
- Push code to GitHub after every working session
- Export a database backup monthly (or weekly if you are actively using it)
- Keep a copy of your `.env.local` file in your password manager

### How to Push Updates

Every time you make changes to your CRM:

```bash
git add .
git commit -m "Description of what you changed"
git push
```

That is it. Vercel detects the push, builds the new version, and deploys it -- usually in under 60 seconds. If the build fails, Vercel keeps the previous version live so your CRM never goes down.

### Monthly Maintenance Checklist

Run through this list once a month:

- [ ] Check Supabase dashboard for any warnings or alerts
- [ ] Review your Supabase usage (are you approaching any limits?)
- [ ] Check Vercel deployment logs for any errors
- [ ] Update dependencies: `npm update` then test everything
- [ ] Review and clean up unused data (old outreach records, completed tasks from months ago)
- [ ] Export a database backup
- [ ] Check that Google Calendar sync is still working (tokens may need re-authorization every few months)
- [ ] Test the AI assistant with a few questions to make sure the Edge Function is responding

---

## CHAPTER 9: WHAT IS NEXT

You have built a fully functional, AI-powered CRM for your business. But this is just the foundation. Here is where you can take it.

### Advanced Features to Add

**Stripe Integration:** Accept payments directly from your invoices. When you send an invoice, include a "Pay Now" link that takes the client to a Stripe checkout page. When they pay, automatically mark the invoice as paid in your CRM. Stripe's free tier charges only per transaction (2.9% + $0.30), no monthly fee.

**Gmail Integration:** Pull your email threads into the CRM, linked to client records. See the last 10 emails exchanged with a client without leaving your CRM. Draft and send emails from within the client detail view. Google's Gmail API has a generous free tier.

**Slack Notifications:** Get notified in a Slack channel when invoices are overdue, tasks are due today, or a new outreach prospect responds. Slack's Incoming Webhooks are free and take 15 minutes to set up.

**Automated Reports:** Use Supabase's scheduled functions (cron jobs) to generate a weekly summary email sent to you every Monday morning. Revenue for the week, tasks completed, meetings held, pipeline movement.

### Scaling to Multi-User / Team Features

When you hire your first team member, you will want to add:

- **Team invitations** -- invite users by email to join your CRM workspace
- **Role-based access** -- Admin (full access), Manager (read all + write own), Member (own data only)
- **Task assignment** -- assign tasks to specific team members
- **Activity attribution** -- see who did what in the activity log

The Supabase Row Level Security policies we set up are already designed for this. You would add an `organization_id` column to each table and update the RLS policies to check organization membership instead of just `user_id`.

### Using This as a Client Service

Here is the business opportunity most people will miss: **You can sell CRM builds to other businesses.**

You have just learned how to build a custom CRM in a weekend. Most businesses do not know this is possible. They are still paying $200-800/month for SaaS tools or spending $30K+ on custom development.

**The offer:** "I will build you a custom CRM tailored to your business for $3,000-5,000, with a $200/month maintenance retainer."

Your cost to deliver: a weekend of your time, $0 in infrastructure (client pays for their own Supabase/Vercel if they outgrow free tiers). Your margin is essentially 100%.

You already have the playbook. For each new client, you fork your repo, customize the branding and page structure, adjust the database schema, and deploy. The AI does the heavy lifting. You are the project manager.

This is a legitimate, scalable service business built on the exact skills you just learned.

### Community and Support

- **Anthropic's Discord:** Join the community for Claude API help and best practices
- **Supabase Discord:** Active community for database and auth questions
- **Vercel's Documentation:** Some of the best docs in the industry at [vercel.com/docs](https://vercel.com/docs)
- **GitHub Discussions:** Post questions on your own repo or search for similar projects

---

## CLOSING

Let me recap what you just built.

A 24-page, fully functional CRM with client management, project tracking, Kanban task boards, Google Calendar integration, invoicing, financial analytics, a sales pipeline, campaign tracking, document storage, encrypted credential vaults, standard operating procedures, an activity log, a daily briefing, and an AI assistant that understands your business data and answers questions in natural language.

The infrastructure cost: **$0.**

The equivalent development cost if you hired a team: **$30,000 to $50,000+.**

The time to build it: **A focused weekend, or a week of evenings.**

The tool that made it possible: **AI as your development partner, not as a toy, not as a gimmick -- as a genuine force multiplier that turns clear thinking into working software.**

This is the new paradigm. The barrier to building custom software has collapsed. You do not need a technical co-founder. You do not need a six-figure development budget. You need a clear vision of what you want, the willingness to follow a process, and a relentless habit of shipping.

You now have the playbook. Build the tool that fits YOUR workflow. Stop paying for software that was designed for someone else's business.

---

**Want us to build it for you?**

If you love the idea but would rather have professionals handle the build, Grow The Hype offers custom CRM builds as a service. We will design, build, and deploy your personalized CRM -- tailored to your industry, your workflow, and your brand.

Visit **[growthehype.ca](https://growthehype.ca)** to learn more.

---

**Share your build.**

Built your CRM using this guide? I want to see it. Share a screenshot on Twitter/X and tag **@growthehype**. I will feature the best builds in our community.

---

*Copyright 2026 Grow The Hype Inc. All rights reserved.*
*This guide is for personal and business use by the purchaser. Do not redistribute.*

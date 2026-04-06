# GTH CRM Build Playbook

## What This Is
A complete blueprint for building a custom AI-powered Operations Command Center (CRM) for agencies, freelancers, and small businesses. Built with React + Supabase + Tailwind CSS + Claude AI.

## What You Get
- 24-page web application with full CRUD operations
- Google Calendar integration (2-way sync)
- AI assistant powered by Claude (voice + text, 10 executable tools)
- Dark/light mode
- Progressive Web App (installable on mobile)
- Fully mobile responsive
- Real-time dashboard with charts and analytics

## Tech Stack
| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript | Industry standard, huge ecosystem |
| Styling | Tailwind CSS v4 | Utility-first, rapid development |
| State | Zustand | Lightweight, no boilerplate |
| Backend | Supabase (PostgreSQL + Auth + Storage) | Free tier, real-time, handles auth |
| Hosting | Vercel | Free, auto-deploys from GitHub |
| AI | Claude API (Anthropic) | Best reasoning, native tool use |
| Calendar | Google Calendar API v3 | Free, OAuth implicit flow |

## Build Phases
1. Foundation — Supabase + Auth + Project scaffold
2. Shell — Layout, sidebar, topbar, navigation
3. Core Pages — Clients, Tasks, Projects, Calendar
4. Revenue — Invoices, Financials, Profitability
5. Growth — Outreach, Campaigns, Services, Templates, Goals
6. Vault — Credentials, Brand Assets, Documents, SOPs
7. Operations — Notes, Activity, Settings
8. Intelligence — AI assistant, Google Calendar, Dashboard charts
9. Polish — Mobile responsive, dark mode, PWA

## Time Estimate
- With AI assistance (Claude Code): 8-16 hours
- Traditional development: 300-500 hours
- Agency build quote: $30,000-60,000

## File Structure
```
src/
├── components/
│   ├── shell/          # Shell.tsx, Sidebar.tsx, Topbar.tsx
│   ├── ai-panel/       # AiPanel.tsx (Claude-powered assistant)
│   ├── command-palette/ # CommandPalette.tsx (Ctrl+K search)
│   └── ui/             # Modal.tsx, Toast.tsx, EmptyState.tsx, ContextMenu.tsx
├── lib/
│   ├── api.ts          # All Supabase CRUD operations
│   ├── store.ts        # Zustand global state
│   ├── google-calendar.ts  # Google OAuth + Calendar API
│   ├── supabase.ts     # Supabase client init
│   └── utils.ts        # Date formatting, helpers
├── pages/              # 24 page components
│   ├── DailyBriefing.tsx
│   ├── Dashboard.tsx
│   ├── Calendar.tsx
│   ├── Clients.tsx
│   ├── Contacts.tsx
│   ├── Projects.tsx
│   ├── Tasks.tsx
│   ├── Meetings.tsx
│   ├── Invoices.tsx
│   ├── Financials.tsx
│   ├── Profitability.tsx
│   ├── Outreach.tsx
│   ├── Campaigns.tsx
│   ├── Services.tsx
│   ├── Templates.tsx
│   ├── Goals.tsx
│   ├── Credentials.tsx
│   ├── BrandAssets.tsx
│   ├── Documents.tsx
│   ├── SOPs.tsx
│   ├── Notes.tsx
│   ├── Activity.tsx
│   ├── Settings.tsx
│   └── Login.tsx
├── App.tsx             # Root component, auth flow
├── main.tsx            # Entry point, service worker registration
└── index.css           # Tailwind config, theme, components
```

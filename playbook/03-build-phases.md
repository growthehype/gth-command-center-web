# Phase 3-9: Build Phases

## How to Use This With Claude Code

Open Claude Code in your project directory and give it instructions phase by phase. Here's what to tell it for each phase:

### Phase 3: Shell + Auth
"Build a login page with Supabase email/password auth. Create a Shell component with a fixed topbar (logo, search trigger, user info) and a left sidebar with navigation groups: COMMAND (Briefing, Dashboard, Calendar, Clients, Contacts, Projects, Tasks, Meetings), REVENUE (Invoices, Financials, Profitability), GROWTH (Outreach, Campaigns, Services, Templates, Goals), VAULT (Credentials, Brand Assets, Documents), OPERATIONS (SOPs, Notes, Activity, Settings). The sidebar should show badge counts for active items. Use Zustand for state management with a global store."

### Phase 4: Core CRUD Pages
"Build the Clients page with a sortable/filterable table, search, status filters (active/prospect/paused/done), a detail drawer with tabs (Overview, Contacts, Projects, Tasks, Invoices, Time, Credentials, Links, Meetings, Files, Notes), and a create/edit modal with form validation. Extract form fields as standalone components to prevent re-render issues."

Repeat similar instructions for Tasks, Projects (kanban board with 4 columns), Contacts, Meetings.

### Phase 5: Calendar
"Integrate Google Calendar using OAuth implicit flow. The Calendar page should ONLY display Google Calendar events (no CRM-side storage). Support creating events that go directly to Google Calendar, viewing event details, and deleting events. Use a weekly grid view with hours 8AM-8PM."

### Phase 6: Revenue Pages
"Build Invoices as a file-upload system organized by client tabs. Build Financials with yearly revenue tracking and tax status. Build Profitability with per-client profit analysis using MRR and time entries."

### Phase 7: AI Assistant
"Build an AI assistant panel that uses the Claude API with tool_use. It should have 10 tools: create_task, create_event, create_project, create_invoice, complete_task, get_crm_data, navigate_to_page, log_activity, start_timer, stop_timer. Include voice input using the Web Speech API. The system prompt should include a live summary of CRM data."

### Phase 8: Polish
"Make the entire app mobile responsive. Add a hamburger menu sidebar drawer on mobile. Make all grids stack to single column. Add dark mode with a CSS variable swap. Add PWA support with manifest.json and a service worker."

### Phase 9: Dashboard
"Upgrade the dashboard with meaningful charts: Revenue by Client bar chart, Task Activity 7-day chart, Project Pipeline status bar, Week at a Glance strip. Use pure CSS/SVG — no chart libraries."

## Key Patterns to Follow
1. All API calls go through src/lib/api.ts — one file for all Supabase operations
2. Global state in Zustand store with refresh functions per entity
3. Modals for create/edit, drawers for detail views
4. Consistent styling: label class for headers, card class for containers
5. Every table has user_id + RLS for multi-tenant security

# Customization Guide

## Branding
- Colors: Edit the `@theme` block in `src/index.css`
- Fonts: Change the Google Fonts import in `src/index.css`
- Logo: Replace `public/icon.png`
- App name: Update `src/components/shell/Topbar.tsx` wordmark text

## Adding a New Page
1. Create `src/pages/NewPage.tsx`
2. Add to `pageMap` in `src/components/shell/Shell.tsx`
3. Add nav item to `navGroups` in `src/components/shell/Sidebar.tsx`
4. Add refresh function to store if it has its own data

## Adding a New Database Table
1. Create table in Supabase SQL Editor
2. Enable RLS + add user policy
3. Add CRUD functions in `src/lib/api.ts`
4. Add TypeScript interface in `src/lib/store.ts`
5. Add to `loadAllData` in the store

## Adding a New AI Tool
1. Add tool definition to the `tools` array in `AiPanel.tsx`
2. Add case to the `executeTool` switch statement
3. Call the appropriate API function and refresh the store

## Adding a New Integration
Follow the Google Calendar pattern:
1. Create `src/lib/[service].ts` with auth + API functions
2. Add token management (localStorage)
3. Add OAuth flow if needed
4. Wire into relevant pages

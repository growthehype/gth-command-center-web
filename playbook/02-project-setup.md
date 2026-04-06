# Phase 2: Project Setup

## Create React Project
```bash
npm create vite@latest my-crm -- --template react-ts
cd my-crm
npm install
```

## Install Dependencies
```bash
npm install @supabase/supabase-js zustand lucide-react date-fns
npm install -D @tailwindcss/vite tailwindcss
```

## Configure Vite
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
})
```

## Configure Tailwind (src/index.css)
See the full index.css in the codebase for the complete theme system including:
- Brand colors (light + dark mode)
- Font imports (Montserrat + Space Mono)
- Component classes (btn-primary, btn-ghost, card, stat-card, badge, etc.)
- Custom scrollbar styling

## Initialize Supabase Client
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Deploy to Vercel
1. Push to GitHub
2. Connect repo to Vercel
3. Deploy — it auto-detects Vite and builds correctly

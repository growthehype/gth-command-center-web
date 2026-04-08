import { HelpCircle, Keyboard, Zap, Shield, Mail, FileText, Calendar, BarChart3, Users, Target } from 'lucide-react'
import { useAppStore } from '@/lib/store'

const SHORTCUTS = [
  { keys: 'Ctrl + K', action: 'Open command palette / search' },
  { keys: 'Ctrl + J', action: 'Toggle AI assistant panel' },
  { keys: 'Ctrl + N', action: 'Quick add (new client, task, etc.)' },
  { keys: 'Ctrl + ,', action: 'Open settings' },
  { keys: '?', action: 'Show keyboard shortcuts modal' },
  { keys: '/', action: 'Focus search' },
  { keys: 'G then D', action: 'Go to Dashboard' },
  { keys: 'G then B', action: 'Go to Daily Briefing' },
  { keys: 'G then C', action: 'Go to Clients' },
  { keys: 'G then P', action: 'Go to Projects' },
  { keys: 'G then T', action: 'Go to Tasks' },
  { keys: 'G then I', action: 'Go to Invoices' },
  { keys: 'G then F', action: 'Go to Financials' },
  { keys: 'G then O', action: 'Go to Outreach' },
  { keys: 'G then M', action: 'Go to Meetings' },
]

const FEATURES = [
  {
    icon: Users,
    title: 'Clients & Contacts',
    desc: 'Manage your clients, store their brand colors, logos, contact info, and track all related projects, tasks, and invoices in one place.',
  },
  {
    icon: FileText,
    title: 'Invoice Builder',
    desc: 'Create professional PDF invoices with your branding, send them via Gmail, and track payment status (Draft → Sent → Paid).',
  },
  {
    icon: Calendar,
    title: 'Calendar & Meetings',
    desc: 'Sync with Google Calendar, log meeting notes, track action items, and never miss a client touchpoint.',
  },
  {
    icon: Target,
    title: 'Outreach Pipeline',
    desc: 'Track leads through stages (Cold → Warm → Hot → Won), log follow-ups, and convert leads to clients when ready.',
  },
  {
    icon: BarChart3,
    title: 'Financials & Profitability',
    desc: 'See revenue by client, track MRR, compare time spent vs. revenue, and understand which clients are most profitable.',
  },
  {
    icon: Shield,
    title: 'Credentials Vault',
    desc: 'Securely store client platform logins and API keys. Encrypted per-user in your database.',
  },
  {
    icon: Zap,
    title: 'AI Assistant',
    desc: 'Press Ctrl+J to open the AI panel. Ask questions about your data, get suggestions, draft emails, and more.',
  },
  {
    icon: Mail,
    title: 'Email Templates',
    desc: 'Save reusable email templates with personalization tokens like {client_name} and {amount}. Use them when sending invoices.',
  },
]

const FAQ = [
  {
    q: 'How do I connect Google Calendar?',
    a: 'Go to the Calendar page and click "Connect Google Calendar." You\'ll be redirected to Google to authorize. Once connected, your events sync automatically.',
  },
  {
    q: 'How do I send invoices via email?',
    a: 'First connect Gmail in the Invoice builder (click Send → Connect Gmail). Then compose your email, attach the PDF, and send directly from the CRM.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is stored in your private Supabase database with Row Level Security (RLS). Each user can only access their own data. Passwords are handled by Supabase Auth with industry-standard hashing.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Go to Settings → Backup & Export → Export All Data. This downloads a complete JSON backup of your entire CRM.',
  },
  {
    q: 'How do time tracking and profitability work?',
    a: 'Start a timer from any project or task. When you stop it, the time is logged. The Profitability page compares hours spent against revenue earned per client.',
  },
  {
    q: 'What is the Client Portal?',
    a: 'You can generate a read-only share link for any client. They can view their projects, tasks, and invoices without needing a login.',
  },
]

export default function Help() {
  const { setCurrentPage } = useAppStore()

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1>Help & Guide</h1>
          <HelpCircle size={14} className="text-dim" />
        </div>
        <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
          Everything you need to know about your Command Center
        </p>
      </div>

      {/* Quick start */}
      <div className="card">
        <h2 className="label-md text-steel mb-3">QUICK START</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => setCurrentPage('clients')} className="card bg-obsidian/50 hover:bg-cell transition-colors cursor-pointer text-left">
            <span className="text-polar font-[700]" style={{ fontSize: '13px' }}>1. Add your first client</span>
            <p className="text-dim mt-1" style={{ fontSize: '11px' }}>Go to Clients → New Client</p>
          </button>
          <button onClick={() => setCurrentPage('invoices')} className="card bg-obsidian/50 hover:bg-cell transition-colors cursor-pointer text-left">
            <span className="text-polar font-[700]" style={{ fontSize: '13px' }}>2. Create an invoice</span>
            <p className="text-dim mt-1" style={{ fontSize: '11px' }}>Go to Invoices → New Invoice</p>
          </button>
          <button onClick={() => setCurrentPage('settings')} className="card bg-obsidian/50 hover:bg-cell transition-colors cursor-pointer text-left">
            <span className="text-polar font-[700]" style={{ fontSize: '13px' }}>3. Set up your profile</span>
            <p className="text-dim mt-1" style={{ fontSize: '11px' }}>Go to Settings → Company Profile</p>
          </button>
        </div>
      </div>

      {/* Features */}
      <div>
        <h2 className="label-md text-steel mb-4">FEATURES</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="card flex items-start gap-3">
              <div className="bg-surface border border-border p-2 shrink-0">
                <f.icon size={16} className="text-polar" />
              </div>
              <div>
                <h3 className="text-polar font-[700]" style={{ fontSize: '13px' }}>{f.title}</h3>
                <p className="text-dim mt-1" style={{ fontSize: '11px', lineHeight: '1.6' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div>
        <h2 className="label-md text-steel mb-4">
          <Keyboard size={12} className="inline mr-2" />
          KEYBOARD SHORTCUTS
        </h2>
        <div className="card">
          <table className="w-full">
            <tbody>
              {SHORTCUTS.map(s => (
                <tr key={s.keys} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4" style={{ width: '160px' }}>
                    <kbd className="mono text-polar bg-obsidian border border-border px-2 py-0.5" style={{ fontSize: '11px' }}>{s.keys}</kbd>
                  </td>
                  <td className="py-2 text-dim" style={{ fontSize: '12px' }}>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="label-md text-steel mb-4">FREQUENTLY ASKED QUESTIONS</h2>
        <div className="space-y-3">
          {FAQ.map(item => (
            <details key={item.q} className="card group">
              <summary className="text-polar font-[700] cursor-pointer list-none flex items-center gap-2" style={{ fontSize: '13px' }}>
                <span className="text-dim group-open:rotate-90 transition-transform" style={{ fontSize: '14px' }}>&#9654;</span>
                {item.q}
              </summary>
              <p className="text-dim mt-2 pl-5" style={{ fontSize: '12px', lineHeight: '1.7' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

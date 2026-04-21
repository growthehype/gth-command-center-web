import { useState } from 'react'
import { Upload, FileText } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'
import { safeParseJSON } from '@/lib/utils'

const ALL_TABS = ['GTH Assets', 'Client Brands', 'Templates'] as const
type BrandTab = typeof ALL_TABS[number]

const BRAND_COLORS = [
  { name: 'Obsidian', hex: '#000000' },
  { name: 'Polar', hex: '#FFFFFF' },
  { name: 'Cream', hex: '#F5F0EB' },
  { name: 'Charcoal', hex: '#1A1A1A' },
  { name: 'Steel', hex: '#888888' },
  { name: 'Ash', hex: '#E8E8E8' },
]

const TYPOGRAPHY = [
  {
    name: 'Figtree',
    family: 'Figtree, sans-serif',
    usage: 'Headings, UI labels, buttons',
    weights: ['400 Regular', '600 Semibold', '700 Bold', '800 Extra Bold', '900 Black'],
    sample: 'The quick brown fox jumps over the lazy dog',
  },
  {
    name: 'Space Mono',
    family: "'Space Mono', monospace",
    usage: 'Data, metrics, timestamps, code',
    weights: ['400 Regular', '700 Bold'],
    sample: '$24,500 MRR | 12 clients | 99.8% uptime',
  },
]

const TEMPLATE_CARDS = [
  { name: 'Proposal Template', description: 'Service proposals for prospective clients', icon: FileText },
  { name: 'Digital Health Snapshot', description: '1-page cold outreach audit PDF', icon: FileText },
  { name: 'Intake Forms', description: 'New client onboarding questionnaire', icon: FileText },
  { name: 'Audit Report', description: 'Full multi-page digital audit deliverable', icon: FileText },
  { name: 'Invoice Template', description: 'Branded invoice for client billing', icon: FileText },
]

export default function BrandAssets() {
  const { clients, demoMode } = useAppStore()
  // In demo mode, hide agency-specific "GTH Assets" tab
  const TABS = demoMode
    ? (['Client Brands', 'Templates'] as const)
    : ALL_TABS
  const [activeTab, setActiveTab] = useState<BrandTab>(demoMode ? 'Client Brands' : 'GTH Assets')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Brand Assets</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {demoMode
              ? 'Client brands and template library'
              : 'GTH brand system, client brands, and template library'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 font-sans transition-colors cursor-pointer border-b-2 ${
              activeTab === tab
                ? 'text-polar border-polar'
                : 'text-dim border-transparent hover:text-steel'
            }`}
            style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* GTH Assets Tab */}
      {activeTab === 'GTH Assets' && (
        <div className="space-y-8">
          {/* GTH Logos */}
          <div>
            <h2 className="label-md text-steel mb-4">LOGOS</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card flex flex-col items-center gap-3 py-6">
                <div className="flex items-center justify-center border border-border" style={{ width: '160px', height: '160px', backgroundColor: '#000000' }}>
                  <img src="./icon.png" alt="GTH Shield" className="w-24 h-24" style={{ filter: 'brightness(0) invert(1)' }} />
                </div>
                <span className="label text-dim">SHIELD — DARK BG</span>
              </div>
              <div className="card flex flex-col items-center gap-3 py-6">
                <div className="flex items-center justify-center border border-border" style={{ width: '160px', height: '160px', backgroundColor: '#FFFFFF' }}>
                  <img src="./icon.png" alt="GTH Shield" className="w-24 h-24" style={{ filter: 'brightness(0)' }} />
                </div>
                <span className="label text-dim">SHIELD — LIGHT BG</span>
              </div>
              <div className="card flex flex-col items-center gap-3 py-6">
                <div className="flex items-center justify-center gap-3 border border-border" style={{ width: '160px', height: '160px', backgroundColor: '#000000' }}>
                  <img src="./icon.png" alt="GTH" className="w-8 h-8" style={{ filter: 'brightness(0) invert(1)' }} />
                  <span className="text-polar font-[900] uppercase" style={{ fontSize: '11px', letterSpacing: '0.08em', lineHeight: '1.2' }}>GROW<br/>THE HYPE</span>
                </div>
                <span className="label text-dim">WORDMARK</span>
              </div>
              <div className="card flex flex-col items-center gap-3 py-6">
                <div className="flex flex-col items-center justify-center gap-2 border border-border" style={{ width: '160px', height: '160px', backgroundColor: '#000000' }}>
                  <img src="./icon.png" alt="GTH" className="w-12 h-12" style={{ filter: 'brightness(0) invert(1)' }} />
                  <span className="text-polar font-[900] uppercase text-center leading-tight" style={{ fontSize: '9px', letterSpacing: '0.14em' }}>
                    GROW THE HYPE
                  </span>
                </div>
                <span className="label text-dim">STACKED</span>
              </div>
            </div>
          </div>

          {/* Color palette */}
          <div>
            <h2 className="label-md text-steel mb-4">COLOR PALETTE</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {BRAND_COLORS.map(color => (
                <div key={color.name} className="card">
                  <div
                    className="w-full h-16 mb-3 border border-border"
                    style={{ backgroundColor: color.hex }}
                  />
                  <h3 className="text-polar font-[700]" style={{ fontSize: '13px' }}>{color.name}</h3>
                  <p className="mono text-dim mt-0.5">{color.hex}</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(color.hex)
                      showToast(`Copied ${color.hex}`, 'success')
                    }}
                    className="label text-dim hover:text-polar mt-2 cursor-pointer transition-colors"
                  >
                    COPY HEX
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div>
            <h2 className="label-md text-steel mb-4">TYPOGRAPHY</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TYPOGRAPHY.map(type => (
                <div key={type.name} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-polar font-[700]" style={{ fontSize: '15px', fontFamily: type.family }}>{type.name}</h3>
                      <span className="badge badge-neutral mt-1">{type.usage}</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="label text-dim">WEIGHTS</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {type.weights.map(w => (
                        <span key={w} className="badge badge-neutral">{w}</span>
                      ))}
                    </div>
                  </div>

                  <div className="bg-surface border border-border p-3">
                    <span className="label text-dim mb-1 block">SAMPLE</span>
                    <p className="text-polar" style={{ fontFamily: type.family, fontSize: '14px', lineHeight: '1.5' }}>
                      {type.sample}
                    </p>
                    <p className="text-steel mt-1" style={{ fontFamily: type.family, fontSize: '20px', fontWeight: 700, lineHeight: '1.3' }}>
                      Aa Bb Cc 123
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brand rules summary */}
          <div>
            <h2 className="label-md text-steel mb-4">BRAND RULES</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card">
                <h3 className="text-polar font-[700] mb-2" style={{ fontSize: '13px' }}>No Rounded Corners</h3>
                <p className="text-dim" style={{ fontSize: '12px' }}>All UI elements use sharp 0px border-radius. No soft edges.</p>
              </div>
              <div className="card">
                <h3 className="text-polar font-[700] mb-2" style={{ fontSize: '13px' }}>Dark Background</h3>
                <p className="text-dim" style={{ fontSize: '12px' }}>Obsidian (#000000) base with subtle cell/surface layering.</p>
              </div>
              <div className="card">
                <h3 className="text-polar font-[700] mb-2" style={{ fontSize: '13px' }}>Tight Spacing</h3>
                <p className="text-dim" style={{ fontSize: '12px' }}>Minimal padding, compact layouts. Data density over whitespace.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Brands Tab */}
      {activeTab === 'Client Brands' && (
        <div>
          {clients.length === 0 ? (
            <EmptyState
              icon={Palette}
              title="No clients yet"
              description="Add clients to manage their brand assets."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {clients.map(client => {
                const colors = safeParseJSON<string[]>(client.colors, [])
                // Handle both array and comma-separated string
                const colorList: string[] = Array.isArray(colors)
                  ? colors
                  : typeof client.colors === 'string' && client.colors
                    ? client.colors.split(',').map(c => c.trim()).filter(Boolean)
                    : []

                return (
                  <div key={client.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-polar font-[700]" style={{ fontSize: '14px' }}>{client.name}</h3>
                        {client.service && (
                          <span className="badge badge-neutral mt-1">{client.service}</span>
                        )}
                      </div>
                      <span className={`badge ${client.status === 'active' ? 'badge-ok' : 'badge-neutral'}`}>
                        {client.status}
                      </span>
                    </div>

                    {/* Color chips */}
                    {colorList.length > 0 ? (
                      <div className="mb-3">
                        <span className="label text-dim">BRAND COLORS</span>
                        <div className="flex items-center gap-2 mt-1.5">
                          {colorList.map((color, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                navigator.clipboard.writeText(color)
                                showToast(`Copied ${color}`, 'success')
                              }}
                              className="group relative cursor-pointer"
                              title={color}
                            >
                              <div
                                className="w-8 h-8 border border-border hover:border-polar transition-colors"
                                style={{ backgroundColor: color }}
                              />
                              <span className="mono text-dim mt-0.5 block text-center" style={{ fontSize: '9px' }}>{color}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <span className="label text-dim">BRAND COLORS</span>
                        <p className="text-dim mt-1" style={{ fontSize: '12px' }}>No colors defined</p>
                      </div>
                    )}

                    {/* Logo */}
                    {client.logo_path ? (
                      <div className="mb-3">
                        <span className="label text-dim">LOGO</span>
                        <div className="bg-surface border border-border p-2 mt-1 flex items-center gap-2">
                          <FileText size={12} className="text-dim" />
                          <span className="mono text-steel truncate">{client.logo_path}</span>
                        </div>
                      </div>
                    ) : null}

                    <button
                      onClick={() => showToast('Brand kit upload coming soon', 'info')}
                      className="btn-ghost flex items-center gap-2 w-full justify-center mt-2"
                    >
                      <Upload size={11} /> Upload Brand Kit
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'Templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {TEMPLATE_CARDS.map(tmpl => (
            <div key={tmpl.name} className="card">
              <div className="flex items-start gap-3">
                <div className="bg-surface border border-border p-2.5">
                  <tmpl.icon size={18} className="text-polar" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-polar font-[700]" style={{ fontSize: '14px' }}>{tmpl.name}</h3>
                  <p className="text-dim mt-1" style={{ fontSize: '12px' }}>{tmpl.description}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => showToast(`Opening ${tmpl.name}...`, 'info')}
                  className="btn-ghost flex-1 flex items-center justify-center gap-1"
                >
                  Open
                </button>
                <button
                  onClick={() => showToast('Duplicate created', 'success')}
                  className="btn-ghost flex-1 flex items-center justify-center gap-1"
                >
                  Duplicate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

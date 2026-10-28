import { useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'

export interface PageTab {
  id: string
  label: string
  component: React.ComponentType
}

/** Hosts merged pages as tabs under one sidebar entry. */
export default function TabbedPage({ tabs }: { tabs: PageTab[] }) {
  const pageTab = useAppStore((s) => s.pageTab)
  const setPageTab = useAppStore((s) => s.setPageTab)
  const active = tabs.find((t) => t.id === pageTab) ?? tabs[0]
  const Active = active.component

  const barRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ x: 0, w: 0 })

  useLayoutEffect(() => {
    const el = barRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${active.id}"]`)
    if (el) setIndicator({ x: el.offsetLeft, w: el.offsetWidth })
  }, [active.id])

  return (
    <div>
      <div className="tabbar" role="tablist" ref={barRef}>
        <span
          className="tabbar-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }}
        />
        {tabs.map((t) => (
          <button
            key={t.id}
            data-tab={t.id}
            role="tab"
            aria-selected={t.id === active.id}
            className={`tabbar-tab ${t.id === active.id ? 'tabbar-tab--active' : ''}`}
            onClick={() => setPageTab(t.id === tabs[0].id ? null : t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={active.id} className="tab-enter">
        <Active />
      </div>
    </div>
  )
}

import { FileX } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ComponentType<any>
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  action?: React.ReactNode
}

export default function EmptyState({ icon: Icon = FileX, title, description, actionLabel, onAction, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon size={52} className="text-dim mb-5" strokeWidth={1.2} style={{ opacity: 0.3 }} />
      <h3 className="text-steel font-[600] mb-1.5" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>{title}</h3>
      <p className="text-dim mb-6 max-w-sm mx-auto" style={{ fontSize: '12.5px', lineHeight: 1.5 }}>{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary" style={{ fontSize: '11px', padding: '8px 20px' }}>
          {actionLabel}
        </button>
      )}
      {action && !actionLabel && action}
    </div>
  )
}

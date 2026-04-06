import { FileX } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ComponentType<any>
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({ icon: Icon = FileX, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={32} className="text-dim mb-4" strokeWidth={1.5} />
      <h3 className="text-steel font-[700] mb-1" style={{ fontSize: '15px' }}>{title}</h3>
      <p className="text-dim mb-5" style={{ fontSize: '12px', maxWidth: '280px' }}>{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

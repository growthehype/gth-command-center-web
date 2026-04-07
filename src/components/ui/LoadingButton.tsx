import { Loader2 } from 'lucide-react'

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  children: React.ReactNode
}

export default function LoadingButton({ loading, children, disabled, className = '', ...props }: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={className}
      style={{ ...props.style, opacity: loading || disabled ? 0.6 : 1, position: 'relative' }}
    >
      {loading && (
        <Loader2 size={13} className="animate-spin inline mr-1.5" style={{ verticalAlign: 'middle' }} />
      )}
      {children}
    </button>
  )
}

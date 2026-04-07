/**
 * ClientAvatar — deterministic colored circle with client initials.
 */

const PALETTE = [
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#DC2626', // red
  '#EA580C', // orange
  '#CA8A04', // yellow
  '#16A34A', // green
  '#0D9488', // teal
  '#0284C7', // sky
  '#6D28D9', // purple
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0][0]?.toUpperCase() || '?'
  return (words[0][0] + words[1][0]).toUpperCase()
}

const SIZES = {
  sm: { box: 24, font: 10 },
  md: { box: 32, font: 12 },
  lg: { box: 40, font: 15 },
} as const

interface ClientAvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
}

export default function ClientAvatar({ name, size = 'md' }: ClientAvatarProps) {
  const color = PALETTE[hashName(name) % PALETTE.length]
  const initials = getInitials(name)
  const { box, font } = SIZES[size]

  return (
    <div
      style={{
        width: box,
        height: box,
        minWidth: box,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: font,
        fontWeight: 700,
        color: '#fff',
        lineHeight: 1,
        letterSpacing: '0.02em',
      }}
      title={name}
    >
      {initials}
    </div>
  )
}

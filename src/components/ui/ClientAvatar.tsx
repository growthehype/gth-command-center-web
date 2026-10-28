/**
 * ClientAvatar — deterministic colored circle with client initials.
 */

const PALETTE = [
  // Gunmetal series: identity through tone, not hue
  '#2A2F36',
  '#343A42',
  '#3D434C',
  '#23272D',
  '#454C56',
  '#2F343B',
  '#383E47',
  '#272B31',
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
        borderRadius: Math.round(box * 0.26),
        backgroundColor: color,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.06)',
        fontFamily: 'var(--font-display)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: font,
        fontWeight: 700,
        color: '#ECE9E3',
        lineHeight: 1,
        letterSpacing: '0.02em',
      }}
      title={name}
    >
      {initials}
    </div>
  )
}

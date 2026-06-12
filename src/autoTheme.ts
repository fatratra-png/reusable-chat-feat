function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim().toLowerCase()
  if (trimmed.startsWith('#')) {
    const hex = trimmed.replace('#', '')
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null
      return { r, g, b }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null
      return { r, g, b }
    }
    return null
  }
  const match = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (match) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    return { r, g, b }
  }
  return null
}

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`
}

function isLight(r: number, g: number, b: number): boolean {
  return (r * 0.299 + g * 0.587 + b * 0.114) > 140
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function adjust(c: { r: number; g: number; b: number }, amount: number): string {
  if (amount >= 0) {
    const f = 1 - amount
    return rgba({
      r: clamp(255 - (255 - c.r) * f),
      g: clamp(255 - (255 - c.g) * f),
      b: clamp(255 - (255 - c.b) * f),
    }, 1)
  }
  const f = 1 + amount
  return rgba({
    r: clamp(c.r * f),
    g: clamp(c.g * f),
    b: clamp(c.b * f),
  }, 1)
}

function getHostColor(
  style: CSSStyleDeclaration,
  props: string[],
  fallback: string,
): { r: number; g: number; b: number } | null {
  for (const prop of props) {
    const val = style.getPropertyValue(prop) || style[prop as keyof CSSStyleDeclaration]
    if (typeof val === 'string') {
      const rgb = parseRgb(val)
      if (rgb) return rgb
    }
  }
  const root = getComputedStyle(document.documentElement)
  for (const prop of [...props.map(p => `--${p.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`), ...props.map(p => `--${p}`)]) {
    const val = root.getPropertyValue(prop).trim()
    if (val) {
      const rgb = parseRgb(val)
      if (rgb) return rgb
    }
  }
  return parseRgb(fallback)
}

function getChatRoots(): HTMLElement[] {
  const roots = document.querySelectorAll<HTMLElement>('.chat-root')
  if (roots.length > 0) return Array.from(roots)
  const fallback = document.querySelector<HTMLElement>('.chat-root')
  return fallback ? [fallback] : []
}

export function autoThemeChat(container?: HTMLElement): void {
  const el = container || document.body
  const style = getComputedStyle(el)

  const bg = getHostColor(style, ['backgroundColor', 'background'], '#ffffff')
  const text = getHostColor(style, ['color'], '#1f1f1f')
  const accent = getHostColor(style, ['accentColor', '--color-primary', '--brand-primary'], '#6b7280')
  let border = getHostColor(style, ['borderColor', '--border-color'], '#d1d5db')
  const danger = getHostColor(style, ['--color-danger', '--danger', '--error'], '#ef4444')

  if (!bg || !text || !accent) return
  if (!border) border = text

  const light = isLight(bg.r, bg.g, bg.b)
  const targets = getChatRoots()
  if (targets.length === 0) return

  const set = (name: string, value: string) => {
    targets.forEach(el => el.style.setProperty(name, value))
  }

  if (light) {
    set('--chat-bg', rgba(bg, 0.5))
    set('--chat-bg-hover', rgba(bg, 0.08))
    set('--chat-surface', `rgb(${bg.r},${bg.g},${bg.b})`)
    set('--chat-primary', adjust(bg, -0.85))
    set('--chat-primary-light', adjust(bg, -0.7))
    set('--chat-primary-dark', adjust(bg, -0.9))
    set('--chat-surface-dark', adjust(bg, -0.03))
    set('--chat-text', `rgb(${text.r},${text.g},${text.b})`)
    set('--chat-text-secondary', rgba(text, 0.6))
    set('--chat-text-muted', rgba(text, 0.4))
    set('--chat-text-inverse', isLight(text.r, text.g, text.b) ? adjust(bg, -0.85) : '#ffffff')
    set('--chat-border', rgba(border, 0.15))
    set('--chat-border-light', rgba(border, 0.08))
    set('--chat-accent', `rgb(${accent.r},${accent.g},${accent.b})`)
    set('--chat-accent-light', adjust(accent, 0.3))
    set('--chat-accent-dark', adjust(accent, -0.2))
    set('--chat-accent-soft', rgba(accent, 0.12))
    set('--chat-accent-border', rgba(accent, 0.35))
    set('--chat-bubble-own', rgba(accent, 0.12))
    set('--chat-bubble-own-text', `rgb(${accent.r},${accent.g},${accent.b})`)
    set('--chat-bubble-other', rgba(bg, 0.08))
    set('--chat-bubble-other-text', `rgb(${text.r},${text.g},${text.b})`)
    set('--chat-glass-bg', rgba(bg, 0.5))
    set('--chat-overlay', rgba(bg, 0.5))
    set('--chat-overlay-heavy', isLight(bg.r, bg.g, bg.b) ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.95)')
  } else {
    set('--chat-bg', rgba(bg, 0.3))
    set('--chat-bg-hover', rgba(bg, 0.08))
    set('--chat-surface', `rgb(${bg.r},${bg.g},${bg.b})`)
    set('--chat-primary', adjust(bg, 0.2))
    set('--chat-primary-light', adjust(bg, 0.3))
    set('--chat-primary-dark', `rgb(${bg.r},${bg.g},${bg.b})`)
    set('--chat-surface-dark', `rgb(${bg.r},${bg.g},${bg.b})`)
    set('--chat-text', `rgb(${text.r},${text.g},${text.b})`)
    set('--chat-text-secondary', rgba(text, 0.6))
    set('--chat-text-muted', rgba(text, 0.4))
    set('--chat-text-inverse', isLight(text.r, text.g, text.b) ? `rgb(${bg.r},${bg.g},${bg.b})` : '#ffffff')
    set('--chat-border', rgba(border, 0.15))
    set('--chat-border-light', rgba(border, 0.08))
    set('--chat-accent', `rgb(${accent.r},${accent.g},${accent.b})`)
    set('--chat-accent-light', adjust(accent, 0.3))
    set('--chat-accent-dark', adjust(accent, -0.2))
    set('--chat-accent-soft', rgba(accent, 0.15))
    set('--chat-accent-border', rgba(accent, 0.4))
    set('--chat-bubble-own', rgba(accent, 0.2))
    set('--chat-bubble-own-text', `rgb(${text.r},${text.g},${text.b})`)
    set('--chat-bubble-other', rgba(bg, 0.1))
    set('--chat-bubble-other-text', `rgb(${text.r},${text.g},${text.b})`)
    set('--chat-glass-bg', rgba(bg, 0.3))
    set('--chat-overlay', 'rgba(0,0,0,0.6)')
    set('--chat-overlay-heavy', 'rgba(0,0,0,0.95)')
  }

  if (danger) {
    set('--chat-danger', `rgb(${danger.r},${danger.g},${danger.b})`)
    set('--chat-danger-bg', rgba(danger, 0.12))
    set('--chat-danger-text', adjust(danger, 0.3))
  }
}

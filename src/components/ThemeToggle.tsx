import type { Theme } from '../hooks/useTheme'

interface Props { theme: Theme; toggle: () => void }

export function ThemeToggle({ theme, toggle }: Props) {
  const isDark = theme === 'dark'
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? '☀' : '☾'}
    </button>
  )
}

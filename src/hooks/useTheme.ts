import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

function getInitial(): Theme {
  // Reads the attribute already set by the inline script in index.html
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('bnb_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return { theme, toggle }
}

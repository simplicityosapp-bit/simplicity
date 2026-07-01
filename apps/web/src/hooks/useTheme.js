import { useCallback, useEffect, useState } from 'react'

/* ════════════════════════════════════════════════════════════════
   useTheme — light / dark, persisted to localStorage.
   ════════════════════════════════════════════════════════════════
   Dark mode is driven by data-theme="dark" on <html> (NOT prefers-
   color-scheme), matching the prototype + design-tokens.md.
   Default: 'light' (user_preferences.theme). Pre-Supabase, the choice
   lives in localStorage so a refresh keeps it.
   ════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'mg-theme'

function readInitialTheme() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  }
  return 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme, isDark: theme === 'dark' }
}

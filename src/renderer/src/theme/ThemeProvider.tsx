import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const THEMES = [
  {
    id: 'light',
    label: '晨光浅色',
    description: '温暖、克制的浅色界面，适合长时间阅读与书写。'
  }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

const DEFAULT_THEME: ThemeId = 'light'
const STORAGE_KEY = 'qimu.theme'

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

function readStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemeId(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

interface ThemeContextValue {
  themeId: ThemeId
  setTheme: (theme: ThemeId) => void
  theme: (typeof THEMES)[number]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [themeId, setThemeId] = useState<ThemeId>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset['theme'] = themeId
    try {
      window.localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      // A blocked localStorage should never stop the app from rendering.
    }
  }, [themeId])

  const value = useMemo<ThemeContextValue>(() => {
    const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0]
    return { themeId, setTheme: setThemeId, theme }
  }, [themeId])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}

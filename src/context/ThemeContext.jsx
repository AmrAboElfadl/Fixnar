import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { startTranslating } from '../lib/i18n/translator'

const ThemeContext = createContext({})

export const THEMES = [
  { id:'light', icon:'☀️', label:'Light' },
  { id:'dark',  icon:'🌙', label:'Dark' },
  { id:'retro', icon:'🕹️', label:'Retro 80s/90s' },
]

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => { const t = localStorage.getItem('fixnar_theme'); return THEMES.some(x => x.id === t) ? t : 'light' })
  const [lang, setLang]   = useState(() => localStorage.getItem('fixnar_lang') || 'en')

  useEffect(() => {
    localStorage.setItem('fixnar_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1117' : theme === 'retro' ? '#000080' : '#1D9E75')
  }, [theme])

  const firstLang = useRef(lang)
  useEffect(() => {
    localStorage.setItem('fixnar_lang', lang)
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', lang)
    if (lang === 'ar') startTranslating()
    // leaving Arabic: reload so every screen redraws in the original language
    else if (firstLang.current === 'ar') window.location.reload()
  }, [lang])

  // Cycles Light → Dark → Retro → Light
  function toggleTheme() {
    setTheme(t => THEMES[(THEMES.findIndex(x => x.id === t) + 1) % THEMES.length].id)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

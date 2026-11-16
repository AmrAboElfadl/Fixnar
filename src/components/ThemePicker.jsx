import { useTheme, THEMES } from '../context/ThemeContext'

// Segmented Light / Dark / Retro switch
export default function ThemePicker({ full = false }) {
  const { theme, setTheme } = useTheme()
  return (
    <div className="fx-theme-picker" role="radiogroup" aria-label="Theme"
      style={{ display:'flex', gap:2, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:2, width: full ? '100%' : 'auto' }}>
      {THEMES.map(t => {
        const on = theme === t.id
        return (
          <button key={t.id} role="radio" aria-checked={on} title={t.label} onClick={() => setTheme(t.id)}
            style={{ flex: full ? 1 : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:5,
              background: on ? 'var(--surface)' : 'transparent', border:'none', borderRadius:6,
              padding: full ? '6px 4px' : '5px 9px', cursor:'pointer', fontSize: full ? 12 : 13,
              color: on ? 'var(--text)' : 'var(--text3)', fontWeight: on ? 600 : 400,
              boxShadow: on ? 'var(--shadow)' : 'none' }}>
            <span>{t.icon}</span>{full && <span>{t.id === 'retro' ? 'Retro' : t.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

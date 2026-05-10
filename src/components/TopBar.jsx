import { useTheme } from '../context/ThemeContext'
import { useState } from 'react'

const LANGS = [
  { code:'en', label:'EN', name:'English', flag:'🇬🇧' },
  { code:'ar', label:'AR', name:'العربية', flag:'🇦🇪' },
  { code:'ur', label:'UR', name:'اردو',    flag:'🇵🇰' },
]

export default function TopBar() {
  const { theme, toggleTheme, lang, setLang } = useTheme()
  const [langOpen, setLangOpen] = useState(false)
  const isDark = theme === 'dark'
  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  return (
    <div style={{
      position:'fixed', top:0, right:0, left:0,
      height:48, zIndex:200,
      background:'var(--sidebar-bg)',
      borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center', justifyContent:'flex-end',
      paddingRight:20, gap:8,
      boxShadow:'var(--shadow)',
    }}>

      {/* Theme toggle */}
      <button onClick={toggleTheme}
        title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
        style={{
          display:'flex', alignItems:'center', gap:6,
          background:'var(--bg3)', border:'1px solid var(--border)',
          borderRadius:8, padding:'5px 12px', cursor:'pointer',
          color:'var(--text2)', fontSize:13, fontWeight:500,
          transition:'all 0.15s',
        }}>
        {isDark ? '☀️ Light' : '🌙 Dark'}
      </button>

      {/* Language selector */}
      <div style={{ position:'relative' }}>
        <button onClick={() => setLangOpen(o => !o)}
          style={{
            display:'flex', alignItems:'center', gap:6,
            background:'var(--bg3)', border:'1px solid var(--border)',
            borderRadius:8, padding:'5px 12px', cursor:'pointer',
            color:'var(--text2)', fontSize:13, fontWeight:500,
          }}>
          {current.flag} {current.label} ▾
        </button>

        {langOpen && (
          <div style={{
            position:'absolute', top:'calc(100% + 6px)', right:0,
            background:'var(--card-bg)', border:'1px solid var(--border)',
            borderRadius:10, padding:4, minWidth:150,
            boxShadow:'0 4px 20px rgba(0,0,0,0.12)', zIndex:300,
          }}>
            {LANGS.map(l => (
              <button key={l.code}
                onClick={() => { setLang(l.code); setLangOpen(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  width:'100%', background: lang === l.code ? 'var(--green-bg)' : 'transparent',
                  border:'none', borderRadius:7, padding:'9px 12px', cursor:'pointer',
                  color: lang === l.code ? 'var(--green)' : 'var(--text)',
                  fontSize:13, fontWeight: lang === l.code ? 500 : 400,
                  textAlign:'left',
                }}>
                <span style={{ fontSize:18 }}>{l.flag}</span>
                <div>
                  <div style={{ fontSize:13 }}>{l.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{l.label}</div>
                </div>
                {lang === l.code && <span style={{ marginLeft:'auto', color:'var(--green)' }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {langOpen && (
        <div onClick={() => setLangOpen(false)}
          style={{ position:'fixed', inset:0, zIndex:250 }}/>
      )}
    </div>
  )
}

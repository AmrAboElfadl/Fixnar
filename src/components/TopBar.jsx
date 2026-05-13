import { useTheme } from '../context/ThemeContext'
import { useState } from 'react'

const LANGS = [
  { code:'en', label:'EN', name:'English', flag:'🇬🇧' },
  { code:'ar', label:'AR', name:'العربية', flag:'🇦🇪' },
  { code:'ur', label:'UR', name:'اردو',    flag:'🇵🇰' },
]

export default function TopBar({ onMenuToggle, pinned, onPin }) {
  const { theme, toggleTheme, lang, setLang } = useTheme()
  const [langOpen, setLangOpen] = useState(false)
  const isDark = theme === 'dark'
  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  return (
    <div style={{
      position:'fixed', top:0, right:0, left:0,
      height:52, zIndex:300,
      background:'var(--sidebar-bg)',
      borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center',
      justifyContent:'space-between',
      padding:'0 16px',
      boxShadow:'var(--shadow)',
    }}>

      {/* Left: hamburger + logo + pin button */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>

        {/* Hamburger — hidden when pinned */}
        {!pinned && (
          <button onClick={onMenuToggle} title="Open menu"
            style={{ width:38, height:38, borderRadius:10, background:'var(--bg3)', border:'1px solid var(--border)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:0 }}>
            <div style={{ width:18, height:2, background:'var(--text2)', borderRadius:1 }}/>
            <div style={{ width:18, height:2, background:'var(--text2)', borderRadius:1 }}/>
            <div style={{ width:18, height:2, background:'var(--text2)', borderRadius:1 }}/>
          </button>
        )}

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, background:'#1D9E75', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <path d="M2 9h5M11 9h5M9 2v5M9 11v5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="9" cy="9" r="2" fill="white"/>
            </svg>
          </div>
          <span style={{ color:'var(--text)', fontSize:16, fontWeight:600, letterSpacing:'-0.3px' }}>Fixnar</span>
        </div>

        {/* Pin sidebar toggle */}
        <button onClick={onPin}
          title={pinned ? 'Click to hide sidebar (slide-in mode)' : 'Click to pin sidebar (always visible)'}
          style={{
            display:'flex', alignItems:'center', gap:5,
            background: pinned ? 'var(--green-bg)' : 'var(--bg3)',
            border:`1px solid ${pinned ? 'var(--green)' : 'var(--border)'}`,
            borderRadius:8, padding:'5px 12px', cursor:'pointer',
            color: pinned ? 'var(--green)' : 'var(--text2)',
            fontSize:12, fontWeight:500, transition:'all 0.15s',
          }}>
          {pinned ? '📌 Sidebar on' : '📌 Pin sidebar'}
        </button>
      </div>

      {/* Right: Theme + Language */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {/* Theme toggle */}
        <button onClick={toggleTheme}
          title={isDark ? 'Switch to Light' : 'Switch to Dark'}
          style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'var(--text2)', fontSize:13, fontWeight:500 }}>
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>

        {/* Language selector */}
        <div style={{ position:'relative' }}>
          <button onClick={() => setLangOpen(o => !o)}
            style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'var(--text2)', fontSize:13, fontWeight:500 }}>
            {current.flag} {current.label} ▾
          </button>

          {langOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:4, minWidth:160, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:400 }}>
              {LANGS.map(l => (
                <button key={l.code}
                  onClick={() => { setLang(l.code); setLangOpen(false) }}
                  style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background: lang===l.code ? 'var(--green-bg)' : 'transparent', border:'none', borderRadius:7, padding:'9px 12px', cursor:'pointer', color: lang===l.code ? 'var(--green)' : 'var(--text)', fontSize:13, fontWeight: lang===l.code ? 500 : 400, textAlign:'left' }}>
                  <span style={{ fontSize:18 }}>{l.flag}</span>
                  <div>
                    <div style={{ fontSize:13 }}>{l.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{l.label}</div>
                  </div>
                  {lang===l.code && <span style={{ marginLeft:'auto', color:'var(--green)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {langOpen && <div onClick={() => setLangOpen(false)} style={{ position:'fixed', inset:0, zIndex:350 }}/>}
    </div>
  )
}

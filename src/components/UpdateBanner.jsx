import { useEffect, useState } from 'react'

// Detects when a new version of Fixnar has been deployed while this tab is open
// (old tabs keep running old code, which caused stuck buttons). Shows a reload bar.
function currentBundle() {
  const s = Array.from(document.scripts).find(x => /\/static\/js\/main\.[a-z0-9]+\.js/.test(x.src))
  return s ? new URL(s.src).pathname : null
}

export default function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const mine = currentBundle()
    if (!mine) return   // dev mode
    let stopped = false
    async function check() {
      if (stopped || document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/index.html?v=' + Date.now(), { cache:'no-store' })
        const html = await res.text()
        const m = html.match(/\/static\/js\/main\.[a-z0-9]+\.js/)
        if (m && m[0] !== mine) setStale(true)
      } catch { /* offline — try later */ }
    }
    const iv = setInterval(check, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', check)
    check()
    return () => { stopped = true; clearInterval(iv); document.removeEventListener('visibilitychange', check) }
  }, [])

  if (!stale) return null
  return (
    <div style={{ position:'fixed', bottom:16, left:'50%', transform:'translateX(-50%)', zIndex:5000, background:'var(--green)', color:'white', borderRadius:12, padding:'10px 14px', display:'flex', gap:12, alignItems:'center', boxShadow:'0 6px 20px rgba(0,0,0,.25)', fontSize:14, maxWidth:'calc(100vw - 24px)' }}>
      <span>✨ A new version of Fixnar is available.</span>
      <button onClick={() => window.location.reload()} style={{ background:'white', color:'var(--green)', border:'none', borderRadius:8, padding:'6px 14px', fontWeight:700, cursor:'pointer' }}>Reload</button>
    </div>
  )
}

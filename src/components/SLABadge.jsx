import { useState, useEffect } from 'react'
import { getSLAStatus, formatRemaining } from '../lib/sla'

export default function SLABadge({ priority, createdAt, status, dueAt }) {
  const [sla, setSla] = useState(null)

  useEffect(() => {
    function update() { setSla(getSLAStatus(priority, createdAt, status, dueAt)) }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [priority, createdAt, status, dueAt])

  if (!sla) return null
  if (sla.status === 'completed') return (
    <span style={{ background:'var(--green-bg)', color:'var(--green)', fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:500 }}>Done</span>
  )

  const colors = {
    ok:       { bg:'var(--blue-bg)',  text:'var(--blue)',  bar:'var(--blue)' },
    warning:  { bg:'var(--amber-bg)', text:'var(--amber)', bar:'var(--amber)' },
    breached: { bg:'var(--red-bg)',   text:'var(--red)',   bar:'var(--red)' },
  }
  const c = colors[sla.status] || colors.ok

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:120 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ background: c.bg, color: c.text, fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:500 }}>
          {sla.status === 'breached' ? '⚠ SLA Breached' : formatRemaining(sla.remainingMin)}
        </span>
        <span style={{ color:'var(--text3)', fontSize:11 }}>{sla.pct}%</span>
      </div>
      <div style={{ height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${sla.pct}%`, background: c.bar, borderRadius:2, transition:'width 0.5s' }}/>
      </div>
    </div>
  )
}

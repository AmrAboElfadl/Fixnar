import { useState, useEffect } from 'react'
import { getSLAStatus, formatRemaining } from '../lib/sla'

export default function SLABadge({ priority, createdAt, status }) {
  const [sla, setSla] = useState(null)

  useEffect(() => {
    function update() { setSla(getSLAStatus(priority, createdAt, status)) }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [priority, createdAt, status])

  if (!sla) return null
  if (sla.status === 'completed') return (
    <span style={{ background:'#1d2f26', color:'#1D9E75', fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:500 }}>Done</span>
  )

  const colors = {
    ok:       { bg:'#1a2b3c', text:'#378ADD', bar:'#378ADD' },
    warning:  { bg:'#2d2208', text:'#EF9F27', bar:'#EF9F27' },
    breached: { bg:'#2d1b1b', text:'#f85149', bar:'#f85149' },
  }
  const c = colors[sla.status] || colors.ok

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:120 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ background: c.bg, color: c.text, fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:500 }}>
          {sla.status === 'breached' ? '⚠ SLA Breached' : formatRemaining(sla.remainingMin)}
        </span>
        <span style={{ color:'#6b7280', fontSize:11 }}>{sla.pct}%</span>
      </div>
      <div style={{ height:4, background:'#21262d', borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${sla.pct}%`, background: c.bar, borderRadius:2, transition:'width 0.5s' }}/>
      </div>
    </div>
  )
}
